/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import {ConfigManager} from '../../../../src/core/config_manager.js';
import type K8 from '../../../../src/core/kube/k8.js';
import {type K8Client} from '../../../../src/core/kube/k8_client.js';
import {Templates} from '../../../../src/core/templates.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {V1Container, V1ExecAction, V1ObjectMeta, V1Pod, V1PodSpec, V1Probe} from '@kubernetes/client-node';
import {RemoteConfigValidator} from '../../../../src/core/config/remote/remote_config_validator.js';
import {ConsensusNodeStates} from '../../../../src/core/config/remote/enumerations.js';
import {ComponentsDataWrapper} from '../../../../src/core/config/remote/components_data_wrapper.js';
import {SoloError} from '../../../../src/core/errors.js';
import {RelayComponent} from '../../../../src/core/config/remote/components/relay_component.js';
import {HaProxyComponent} from '../../../../src/core/config/remote/components/ha_proxy_component.js';
import {MirrorNodeComponent} from '../../../../src/core/config/remote/components/mirror_node_component.js';
import {ConsensusNodeComponent} from '../../../../src/core/config/remote/components/consensus_node_component.js';
import {MirrorNodeExplorerComponent} from '../../../../src/core/config/remote/components/mirror_node_explorer_component.js';
import {EnvoyProxyComponent} from '../../../../src/core/config/remote/components/envoy_proxy_component.js';

import type {NodeAlias, NodeAliases} from '../../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';

describe('RemoteConfigValidator', () => {
  const namespace = 'remote-config-validator';

  let configManager: ConfigManager;
  let k8: K8Client;

  before(async () => {
    configManager = container.resolve(ConfigManager);
    configManager.update({[flags.namespace.name]: namespace});
    k8 = container.resolve('K8') as K8Client;
    await k8.createNamespace(namespace);
  });

  after(async () => {
    await k8.deleteNamespace(namespace);
  });

  const cluster = 'cluster';
  const state = ConsensusNodeStates.STARTED;

  const nodeAlias = 'node1' as NodeAlias;
  const haProxyName = Templates.renderHaProxyName(nodeAlias);
  const envoyProxyName = Templates.renderEnvoyProxyName(nodeAlias);
  const relayName = 'relay';
  const mirrorNodeName = 'mirror-node';
  const mirrorNodeExplorerName = 'mirror-node-explorer';

  const consensusNodeAliases = [nodeAlias] as NodeAliases;

  // @ts-ignore
  const components = new ComponentsDataWrapper(
    {[relayName]: new RelayComponent(relayName, cluster, namespace, consensusNodeAliases)},
    {[haProxyName]: new HaProxyComponent(haProxyName, cluster, namespace)},
    {[mirrorNodeName]: new MirrorNodeComponent(mirrorNodeName, cluster, namespace)},
    {[envoyProxyName]: new EnvoyProxyComponent(envoyProxyName, cluster, namespace)},
    {[nodeAlias]: new ConsensusNodeComponent(nodeAlias, cluster, namespace, state)},
    {[mirrorNodeExplorerName]: new MirrorNodeExplorerComponent(mirrorNodeExplorerName, cluster, namespace)},
  );

  async function createPod(name: string, labels: Record<string, string>) {
    const v1Pod = new V1Pod();
    const v1Metadata = new V1ObjectMeta();
    v1Metadata.name = name;
    v1Metadata.namespace = namespace;
    v1Metadata.labels = labels;
    v1Pod.metadata = v1Metadata;
    const v1Container = new V1Container();
    v1Container.name = name;
    v1Container.image = 'alpine:latest';
    v1Container.command = ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'];
    const v1Probe = new V1Probe();
    const v1ExecAction = new V1ExecAction();
    v1ExecAction.command = ['bash', '-c', 'exit 0'];
    v1Probe.exec = v1ExecAction;
    v1Container.startupProbe = v1Probe;
    const v1Spec = new V1PodSpec();
    v1Spec.containers = [v1Container];
    v1Pod.spec = v1Spec;
    try {
      await k8.kubeClient.createNamespacedPod(namespace, v1Pod);
    } catch (e) {
      console.error(e);
      throw new Error('Error creating pod');
    }
  }

  describe('Relays validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateRelays(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_RELAY_LABEL.split('=');
      await createPod(relayName, {[key]: value});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateRelays(components, k8));
    });
  });

  describe('HaProxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateHaProxies(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(haProxyName, {app: haProxyName});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateHaProxies(components, k8));
    });
  });

  describe('Mirror Node Components validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateMirrorNodes(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key1, value1] = constants.SOLO_HEDERA_MIRROR_IMPORTER[0].split('=');
      const [key2, value2] = constants.SOLO_HEDERA_MIRROR_IMPORTER[1].split('=');
      await createPod(mirrorNodeName, {[key1]: value1, [key2]: value2});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateMirrorNodes(components, k8));
    });
  });

  describe('Envoy Proxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateEnvoyProxies(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(envoyProxyName, {app: envoyProxyName});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateEnvoyProxies(components, k8));
    });
  });

  describe('Consensus Nodes validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateConsensusNodes(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(nodeAlias, {app: `network-${nodeAlias}`});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateConsensusNodes(components, k8));
    });
  });

  describe('Mirror Node Explorers validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateMirrorNodeExplorers(components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_HEDERA_EXPLORER_LABEL.split('=');
      await createPod(mirrorNodeExplorerName, {[key]: value});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateMirrorNodeExplorers(components, k8));
    });
  });
});
