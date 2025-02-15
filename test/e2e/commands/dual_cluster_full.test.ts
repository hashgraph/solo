/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags} from '../../../src/commands/flags.js';
import {getTestCacheDir} from '../../test_util.js';
import {getSoloVersion} from '../../../src/core/helpers.js';
import * as constants from '../../../src/core/constants.js';
import {main} from '../../../src/index.js';
import {resetForTest} from '../../test_container.js';
import {type ClusterRef} from '../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {type CommandFlag} from '../../../src/types/flag_types.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {expect} from 'chai';
import {type ConfigManager} from '../../../src/core/config_manager.js';

function newArgv(): string[] {
  return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
}

function optionFromFlag(flag: CommandFlag): string {
  return `--${flag.name}`;
}

function soloInitArgv(): string[] {
  const argv = newArgv();
  argv.push('init');
  argv.push(optionFromFlag(Flags.cacheDir));
  argv.push(getTestCacheDir());
  argv.push(optionFromFlag(Flags.devMode));
  return argv;
}

describe('Dual Cluster Full E2E Test', async function dualClusterFullE2eTest(): Promise<void> {
  this.bail(true);
  const testName: string = 'dual-cluster-full';
  const namespace: NamespaceName = NamespaceName.of(testName);
  const deployment = `${testName}-deployment`;
  const clusterRefs: ClusterRef[] = ['e2e-cluster-1', 'e2e-cluster-2'];
  const contexts: string[] = ['kind-solo-e2e-c1', 'kind-solo-e2e-c2'];
  const nodeAliasesUnparsed = 'node1,node2';
  const nodeAliasesWithClusterRefsUnparsed = 'e2e-cluster-1=node1,e2e-cluster-2=node2';

  beforeEach(async () => {
    // TODO switch to only resetting the test containers and not using the test version of the local config
    resetForTest();
  });

  it(`${testName}: solo init`, async () => {
    main(soloInitArgv());
  });

  // TODO add commands to create local config and use different cache directory
  // TODO replace with proper commands to create a deployment
  it(`${testName}: manually create remote config`, async () => {
    const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
    for (const context of contexts) {
      const k8 = k8Factory.getK8(context);
      if (await k8.namespaces().has(namespace)) {
        await k8.namespaces().delete(namespace);
      }
      await k8.namespaces().create(namespace);

      const data: Record<string, string> = {
        'remote-config-data': `
  metadata:
    namespace: ${namespace.name}
    deploymentName: ${deployment}
    lastUpdatedAt: 2025-02-14T22:10:13.586000Z
    lastUpdateBy: john@doe.com
    soloChartVersion: ""
    hederaPlatformVersion: ""
    hederaMirrorNodeChartVersion: ""
    hederaExplorerChartVersion: ""
    hederaJsonRpcRelayChartVersion: ""
    soloVersion: ${getSoloVersion()} 
  version: 1.0.0
  clusters:
    ${clusterRefs[0]}:
      name: ${clusterRefs[0]}
      namespace: ${namespace.name}
      deployment: ${deployment}
      dnsBaseDomain: cluster.local
      dnsConsensusNodePattern: network-\${nodeAlias}-svc.\${namespace}.svc
    ${clusterRefs[1]}:
      name: ${clusterRefs[1]}
      namespace: ${namespace.name}
      deployment: ${deployment}
      dnsBaseDomain: cluster.local
      dnsConsensusNodePattern: network-\${nodeAlias}-svc.\${namespace}.svc
  components:
    relays: {}
    haProxies: {}
    mirrorNodes: {}
    envoyProxies: {}
    consensusNodes:
      node1:
        name: node1
        cluster: ${clusterRefs[0]}
        namespace: ${namespace.name}
        state: requested
        nodeId: 0
      node2:
        name: node2
        cluster: ${clusterRefs[1]}
        namespace: ${namespace.name}
        state: requested
        nodeId: 1
    mirrorNodeExplorers: {}
  commandHistory:
      - deployment create
  lastExecutedCommand: deployment create
  flags:
    nodeAliasesUnparsed: ${nodeAliasesUnparsed}
`,
      };

      await k8
        .configMaps()
        .create(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME, constants.SOLO_REMOTE_CONFIGMAP_LABELS, data);
    }

    const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
    expect(remoteConfigManager.isLoaded(), 'remote config manager should not be loaded').to.be.false;
    const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
    configManager.setFlag(Flags.namespace, namespace);
    // @ts-ignore
    await remoteConfigManager.load();
    expect(remoteConfigManager.isLoaded(), 'remote config manager should be loaded').to.be.true;
    expect(
      Object.entries(remoteConfigManager.components.consensusNodes).length,
      'consensus node count should be 2',
    ).to.equal(2);
  });
});
