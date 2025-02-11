/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import {type ConfigManager} from '../../../../src/core/config_manager.js';
import {Templates} from '../../../../src/core/templates.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
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

import {type NodeAlias, type NodeAliases} from '../../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../../src/core/kube/resources/pod/pod_ref.js';
import {PodName} from '../../../../src/core/kube/resources/pod/pod_name.js';
import {ContainerName} from '../../../../src/core/kube/resources/container/container_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';
import {type K8} from '../../../../src/core/kube/k8.js';

describe('RemoteConfigValidator', () => {
  const namespace = NamespaceName.of('remote-config-validator');

  let configManager: ConfigManager;
  let k8: K8;

  before(async () => {
    configManager = container.resolve(InjectTokens.ConfigManager);
    configManager.update({[flags.namespace.name]: namespace});
    k8 = container.resolve(InjectTokens.K8);
    await k8.namespaces().create(namespace);
  });

  after(async () => {
    await k8.namespaces().delete(namespace);
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
    {[relayName]: new RelayComponent(relayName, cluster, namespace.name, consensusNodeAliases)},
    {[haProxyName]: new HaProxyComponent(haProxyName, cluster, namespace.name)},
    {[mirrorNodeName]: new MirrorNodeComponent(mirrorNodeName, cluster, namespace.name)},
    {[envoyProxyName]: new EnvoyProxyComponent(envoyProxyName, cluster, namespace.name)},
    {
      [nodeAlias]: new ConsensusNodeComponent(
        nodeAlias,
        cluster,
        namespace.name,
        state,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      ),
    },
    {[mirrorNodeExplorerName]: new MirrorNodeExplorerComponent(mirrorNodeExplorerName, cluster, namespace.name)},
  );

  async function createPod(name: string, labels: Record<string, string>) {
    try {
      await k8
        .pods()
        .create(
          PodRef.of(namespace, PodName.of(name)),
          labels,
          ContainerName.of(name),
          'alpine:latest',
          ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'],
          ['bash', '-c', 'exit 0'],
        );
    } catch (e) {
      console.error(e);
      throw new Error('Error creating pod');
    }
  }

  describe('Relays validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateRelays(namespace, components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_RELAY_LABEL.split('=');
      await createPod(relayName, {[key]: value});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateRelays(namespace, components, k8));
    });
  });

  describe('HaProxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateHaProxies(namespace, components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(haProxyName, {app: haProxyName});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateHaProxies(namespace, components, k8));
    });
  });

  describe('Mirror Node Components validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateMirrorNodes(namespace, components, k8));
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
      await Promise.all(RemoteConfigValidator.validateMirrorNodes(namespace, components, k8));
    });
  });

  describe('Envoy Proxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(envoyProxyName, {app: envoyProxyName});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8));
    });
  });

  describe('Consensus Nodes validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateConsensusNodes(namespace, components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(nodeAlias, {app: `network-${nodeAlias}`});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateConsensusNodes(namespace, components, k8));
    });
  });

  describe('Mirror Node Explorers validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-ignore
        await Promise.all(RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8));
        throw new Error();
      } catch (e) {
        expect(e).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_HEDERA_EXPLORER_LABEL.split('=');
      await createPod(mirrorNodeExplorerName, {[key]: value});

      // @ts-ignore
      await Promise.all(RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8));
    });
  });
});
