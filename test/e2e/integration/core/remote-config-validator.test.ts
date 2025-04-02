// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {Templates} from '../../../../src/core/templates.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {RemoteConfigValidator} from '../../../../src/core/config/remote/remote-config-validator.js';
import {ConsensusNodeStates} from '../../../../src/core/config/remote/enumerations.js';
import {ComponentsDataWrapper} from '../../../../src/core/config/remote/components-data-wrapper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {RelayComponent} from '../../../../src/core/config/remote/components/relay-component.js';
import {HaProxyComponent} from '../../../../src/core/config/remote/components/ha-proxy-component.js';
import {MirrorNodeComponent} from '../../../../src/core/config/remote/components/mirror-node-component.js';
import {ConsensusNodeComponent} from '../../../../src/core/config/remote/components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from '../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {EnvoyProxyComponent} from '../../../../src/core/config/remote/components/envoy-proxy-component.js';

import {type ArgvStruct, type NodeAlias, type NodeAliases} from '../../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {LocalConfig} from '../../../../src/core/config/local/local-config.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {LocalConfigDataWrapper} from '../../../../src/core/config/local/local-config-data-wrapper.js';

describe('RemoteConfigValidator', () => {
  const namespace = NamespaceName.of('remote-config-validator');

  let configManager: ConfigManager;
  let k8Factory: K8Factory;
  let localConfig: LocalConfig;
  const filePath = `${getTestCacheDirectory('LocalConfig')}/localConfig.yaml`;

  before(async () => {
    configManager = container.resolve(InjectTokens.ConfigManager);
    configManager.update({[flags.namespace.name]: namespace} as ArgvStruct);
    k8Factory = container.resolve(InjectTokens.K8Factory);
    localConfig = new LocalConfig(filePath);
    // @ts-expect-error - TS2341: to mock
    localConfig.localConfigData = new LocalConfigDataWrapper('test@test.com', '0.0.1', {}, {});
    await k8Factory.default().namespaces().create(namespace);
  });

  after(async function () {
    this.timeout(Duration.ofMinutes(5).toMillis());
    await k8Factory.default().namespaces().delete(namespace);
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

  // @ts-expect-error - TS2673: Constructor of class ComponentsDataWrapper is private
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
      await k8Factory
        .default()
        .pods()
        .create(
          PodReference.of(namespace, PodName.of(name)),
          labels,
          ContainerName.of(name),
          'alpine:latest',
          ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'],
          ['bash', '-c', 'exit 0'],
        );
    } catch (error) {
      console.error(error);
      throw new Error('Error creating pod');
    }
  }

  describe('Relays validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-expect-error - TS2341: Property is private
        await Promise.all(RemoteConfigValidator.validateRelays(namespace, components, k8Factory, localConfig));
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_RELAY_LABEL.split('=');
      await createPod(relayName, {[key]: value});

      // @ts-expect-error - TS2341: Property is private
      await Promise.all(RemoteConfigValidator.validateRelays(namespace, components, k8Factory, localConfig));
    });
  });

  describe('HaProxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-expect-error - TS2341: Property is private
        await Promise.all(RemoteConfigValidator.validateHaProxies(namespace, components, k8Factory, localConfig));
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(haProxyName, {app: haProxyName});

      // @ts-expect-error - TS2341: Property is private
      await Promise.all(RemoteConfigValidator.validateHaProxies(namespace, components, k8Factory, localConfig));
    });
  });

  describe('Mirror Node Components validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-expect-error - TS2341: Property is private
        await Promise.all(RemoteConfigValidator.validateMirrorNodes(namespace, components, k8Factory, localConfig));
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key1, value1] = constants.SOLO_HEDERA_MIRROR_IMPORTER[0].split('=');
      const [key2, value2] = constants.SOLO_HEDERA_MIRROR_IMPORTER[1].split('=');
      await createPod(mirrorNodeName, {[key1]: value1, [key2]: value2});

      // @ts-expect-error - TS2341: Property is private
      await Promise.all(RemoteConfigValidator.validateMirrorNodes(namespace, components, k8Factory, localConfig));
    });
  });

  describe('Envoy Proxies validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-expect-error - TS2341: Property is private
        await Promise.all(RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8Factory, localConfig));
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(envoyProxyName, {app: envoyProxyName});

      // @ts-expect-error - TS2341: Property is private
      await Promise.all(RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8Factory, localConfig));
    });
  });

  describe('Consensus Nodes validation', () => {
    it('should fail if component is not present', async () => {
      try {
        // @ts-expect-error - TS2341: Property is private
        await Promise.all(RemoteConfigValidator.validateConsensusNodes(namespace, components, k8Factory, localConfig));
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      await createPod(nodeAlias, {app: `network-${nodeAlias}`});

      // @ts-expect-error - TS2341: Property is private
      await Promise.all(RemoteConfigValidator.validateConsensusNodes(namespace, components, k8Factory, localConfig));
    });
  });

  describe('Mirror Node Explorers validation', () => {
    it('should fail if component is not present', async () => {
      try {
        await Promise.all(
          // @ts-expect-error - TS2341: Property is private
          RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8Factory, localConfig),
        );
        throw new Error();
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    });

    it('should succeed if component is present', async () => {
      const [key, value] = constants.SOLO_HEDERA_EXPLORER_LABEL.split('=');
      await createPod(mirrorNodeExplorerName, {[key]: value});

      await Promise.all(
        // @ts-expect-error - TS2341: Property is private
        RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8Factory, localConfig),
      );
    });
  });
});
