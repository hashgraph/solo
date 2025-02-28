/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags} from '../../../src/commands/flags.js';
import {getTestCacheDir, TEST_CLUSTER} from '../../test_util.js';
import {getSoloVersion} from '../../../src/core/helpers.js';
import * as constants from '../../../src/core/constants.js';
import {main} from '../../../src/index.js';
import {resetForTest} from '../../test_container.js';
import {type ClusterRef, type DeploymentName} from '../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {type CommandFlag} from '../../../src/types/flag_types.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {expect} from 'chai';
import {type ConfigManager} from '../../../src/core/config_manager.js';
import fs from 'fs';
import path from 'path';

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

function soloNodeKeysArgv(deployment: DeploymentName, nodeAliasesUnparsed: string): any {
  const argv = newArgv();
  argv.push('node');
  argv.push('keys');
  argv.push(optionFromFlag(Flags.cacheDir));
  argv.push(getTestCacheDir());
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.quiet));
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.generateGossipKeys));
  argv.push('true');
  argv.push(optionFromFlag(Flags.generateTlsKeys));
  // TODO remove once solo node keys pulls the node aliases from the remote config
  argv.push(optionFromFlag(Flags.nodeAliasesUnparsed));
  argv.push(nodeAliasesUnparsed);
  return argv;
}

async function manuallyCreateRemoteConfigConfigMap(
  contexts: string[],
  namespace: NamespaceName,
  deployment: string,
  clusterRefs: ClusterRef[],
  nodeAliasesUnparsed: string,
) {
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
}

function soloNetworkDeployArgv(deployment: string, namespace: NamespaceName): any {
  const argv = newArgv();
  argv.push('network');
  argv.push('deploy');
  argv.push(optionFromFlag(Flags.cacheDir));
  argv.push(getTestCacheDir());
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.quiet));
  // TOD add solo chart directory
  // TODO remove once the remote config manager is updated to pull the namespace from the local config
  argv.push(optionFromFlag(Flags.namespace));
  argv.push(namespace.name);
  return argv;
}

function soloNodeSetupArgv(deployment: string): any {
  const argv = newArgv();
  argv.push('node');
  argv.push('setup');
  argv.push(optionFromFlag(Flags.cacheDir));
  argv.push(getTestCacheDir());
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.quiet));
  return argv;
}

function soloNodeStartArgv(deployment: string) {
  const argv = newArgv();
  argv.push('node');
  argv.push('start');
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.quiet));
  return argv;
}

describe('Dual Cluster Full E2E Test', async function dualClusterFullE2eTest(): Promise<void> {
  this.bail(true);
  const testName: string = 'dual-cluster-full';
  const namespace: NamespaceName = NamespaceName.of(testName);
  const deployment = `${testName}-deployment`;
  const clusterRefs: ClusterRef[] = ['e2e-cluster-1', 'e2e-cluster-2'];
  const testCluster = TEST_CLUSTER.includes('c1') ? TEST_CLUSTER : `${TEST_CLUSTER}-c1`;
  const contexts: string[] = [`${testCluster}`, `${testCluster.replace('-c1', '-c2')}`];
  const nodeAliasesUnparsed = 'node1,node2';
  const nodeAliasesWithClusterRefsUnparsed = 'e2e-cluster-1=node1,e2e-cluster-2=node2';
  const testCacheDir = getTestCacheDir();

  // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
  before(async () => {
    fs.rmSync(testCacheDir, {recursive: true, force: true});
    expect(contexts[0].includes('c1'), 'context should include c1').to.be.true;
    expect(contexts[1].includes('c2'), 'context should include c2').to.be.true;
  });

  beforeEach(async () => {
    // TODO switch to only resetting the test containers and not using the test version of the local config
    resetForTest(namespace.name, testCacheDir);
  });

  // TODO after all test are done delete the namespace for the next test

  it(`${testName}: solo init`, async () => {
    await main(soloInitArgv());
  });

  // TODO add commands to create local config and use different cache directory
  // solo cluster-ref connect --cluster-ref(*) --context(#)
  //   1. Add the mapping to the local configuration
  //   2. Verify the connection to the cluster can be established (kubectl get ns)
  //   3. Fail if the connection cannot be established

  // solo cluster-ref connect --cluster-ref e2e-cluster1 --context kind-solo-e2e-c1
  // solo cluster-ref connect --cluster-ref e2e-cluster2 --context kind-solo-e2e-c2

  // solo deployment create --deployment(*) --namespace(#)
  //   1. Create a new deployment with the specified name and namespace in the local configuration
  //   2. Fail if the deployment already exists

  // solo deployment create --deployment dual-cluster-full-deployment --namespace dual-cluster-full

  // solo deployment add-cluster --deployment(*) --cluster-ref(#) --enable-cert-manager
  //  --num-consensus-nodes N --dns-base-domain us-west-2.gcp.charlie.sphere
  //  --dns-consensus-node-pattern "${nodeId}.consensus.prod"
  //   1. Add the specified cluster-ref to the deployment
  //   2. Fail if the cluster-ref does not exist in the local configuration
  //   3. Fail if the deployment does not exist in the local configuration
  //   4. Fail if the cluster-ref is already added to the deployment
  //   5. Verify the connection to the cluster can be established (kubectl get ns)
  //   6. Fail if the connection cannot be established
  //   7. Verify kubernetes cluster & namespace level prerequisites (eg: cert-manager, haproxy, etc)
  //   8. Argument `--num-consensus-nodes` is only valid if the deployment is in a pre-genesis state.
  //   9. Fail if `--num-consensus-nodes` is specified for a deployment that is not in a pre-genesis state.
  //   10. Fail if `--num-consensus-nodes` is not specified for a deployment that is in a pre-genesis state.
  //   11. Saves the Remote Config to the ConfigMap in the namespace of the deployment for each cluster-ref added

  // solo deployment add-cluster --deployment dual-cluster-full-deployment --cluster-ref e2e-cluster1 --enable-cert-manager
  //  --num-consensus-nodes 1 --dns-base-domain cluster.local --dns-consensus-node-pattern network-${nodeAlias}-svc.${namespace}.svc
  // solo deployment add-cluster --deployment dual-cluster-full-deployment --cluster-ref e2e-cluster2 --enable-cert-manager
  //  --num-consensus-nodes 1 --dns-base-domain cluster.local --dns-consensus-node-pattern network-${nodeAlias}-svc.${namespace}.svc

  // TODO replace with proper commands to create a deployment - see above
  it(`${testName}: manually create remote config`, async () => {
    await manuallyCreateRemoteConfigConfigMap(contexts, namespace, deployment, clusterRefs, nodeAliasesUnparsed);

    const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
    expect(remoteConfigManager.isLoaded(), 'remote config manager should not be loaded').to.be.false;
    const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
    configManager.setFlag(Flags.namespace, namespace);
    configManager.setFlag(Flags.deployment, deployment);

    // @ts-ignore
    await remoteConfigManager.load(namespace, contexts[0]);
    expect(remoteConfigManager.isLoaded(), 'remote config manager should be loaded').to.be.true;
    expect(
      Object.entries(remoteConfigManager.components.consensusNodes).length,
      'consensus node count should be 2',
    ).to.equal(2);
  });

  // TODO cluster setup (for right now this is being done by the `setup-dual-e2e.sh` script)

  it(`${testName}: node keys`, async () => {
    // TODO we shouldn't have to pass the nodeAliasesUnparsed
    await main(soloNodeKeysArgv(deployment, nodeAliasesUnparsed));
    const node1Key = fs.readFileSync(path.join(testCacheDir, 'keys', 's-private-node1.pem'));
    expect(node1Key).to.not.be.null;
  });

  // TODO network deploy
  xit(`${testName}: network deploy`, async () => {
    await main(soloNetworkDeployArgv(deployment, namespace));
    const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
    for (const context of contexts) {
      const k8 = k8Factory.getK8(context);
      expect(await k8.namespaces().has(namespace), `namespace ${namespace} should exist in ${context}`).to.be.true;
      expect(await k8.pods().list(namespace, ['solo.hedera.com/type=network-node'])).to.have.lengthOf(1);
    }
  });

  // TODO node setup
  xit(`${testName}: node setup`, async () => {
    await main(soloNodeSetupArgv(deployment));
  });

  // TODO node start
  xit(`${testName}: node start`, async () => {
    await main(soloNodeStartArgv(deployment));
  });

  // TODO mirror node deploy
  // TODO explorer deploy
  // TODO json rpc relay deploy
});
