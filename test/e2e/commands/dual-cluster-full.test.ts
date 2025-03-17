// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags} from '../../../src/commands/flags.js';
import {getTestCacheDir, getTestCluster} from '../../test-util.js';
import {getSoloVersion} from '../../../src/core/helpers.js';
import * as constants from '../../../src/core/constants.js';
import {main} from '../../../src/index.js';
import {resetForTest} from '../../test-container.js';
import {type ClusterRef, type ClusterRefs, type DeploymentName} from '../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/core/kube/k8-factory.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote-config-manager.js';
import {expect} from 'chai';
import fs from 'fs';
import path from 'path';
import {type SoloLogger} from '../../../src/core/logging.js';
import {type LocalConfig} from '../../../src/core/config/local-config.js';
import {type K8ClientFactory} from '../../../src/core/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/core/kube/k8.js';

const testName: string = 'dual-cluster-full';

describe('Dual Cluster Full E2E Test', async function dualClusterFullE2eTest(): Promise<void> {
  this.bail(true);
  const namespace: NamespaceName = NamespaceName.of(testName);
  const deployment: string = `${testName}-deployment`;
  const testClusterRefs: ClusterRef[] = ['e2e-cluster-alpha', 'e2e-cluster-beta'];
  const soloTestCluster = getTestCluster();
  const testCluster: string =
    soloTestCluster.includes('c1') || soloTestCluster.includes('c2') ? soloTestCluster : `${soloTestCluster}-c1`;
  const contexts: string[] = [
    `${testCluster}`,
    `${testCluster.replace(soloTestCluster.includes('-c1') ? '-c1' : '-c2', soloTestCluster.includes('-c1') ? '-c2' : '-c1')}`,
  ];
  const nodeAliasesUnparsed = 'node1,node2';
  const testCacheDir: string = getTestCacheDir();
  let testLogger: SoloLogger;

  // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
  before(async () => {
    fs.rmSync(testCacheDir, {recursive: true, force: true});
    resetForTest(namespace.name, testCacheDir, testLogger, true);
    testLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    for (let i: number = 0; i < contexts.length; i++) {
      const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(contexts[i]);
      await k8Client.namespaces().delete(namespace);
    }
    testLogger.info(`${testName}: starting dual cluster full e2e test`);
  });

  beforeEach(async () => {
    // TODO switch to only resetting the test containers and not using the test version of the local config
    testLogger.info(`${testName}: resetting containers for each test`);
    resetForTest(namespace.name, testCacheDir, testLogger, false);
    testLogger.info(`${testName}: finished resetting containers for each test`);
  });

  // TODO after all test are done delete the namespace for the next test

  it(`${testName}: solo init`, async () => {
    testLogger.info(`${testName}: beginning solo init`);
    await main(soloInitArgv());
    testLogger.info(`${testName}: finished solo init`);
  });

  it(`${testName}: solo cluster-ref connect`, async () => {
    testLogger.info(`${testName}: beginning solo cluster-ref connect`);
    for (let index = 0; index < testClusterRefs.length; index++) {
      await main(soloClusterRefConnectArgv(testClusterRefs[index], contexts[index]));
    }
    const clusterRefs: ClusterRefs = container.resolve<LocalConfig>(InjectTokens.LocalConfig).clusterRefs;
    expect(clusterRefs[testClusterRefs[0]]).to.equal(contexts[0]);
    expect(clusterRefs[testClusterRefs[1]]).to.equal(contexts[1]);
    testLogger.info(`${testName}: finished solo cluster-ref connect`);
  });

  it(`${testName}: solo deployment create`, async () => {
    testLogger.info(`${testName}: beginning solo deployment create`);
    await main(soloDeploymentCreateArgv(deployment, namespace));
    testLogger.info(`${testName}: finished solo deployment create`);
  });

  it(`${testName}: solo deployment add-cluster`, async () => {
    testLogger.info(`${testName}: beginning solo deployment add-cluster`);
    for (let index = 0; index < testClusterRefs.length; index++) {
      await main(soloDeploymentAddClusterArgv(deployment, testClusterRefs[index], 1));
    }
    const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
    expect(remoteConfigManager.isLoaded(), 'remote config manager should be loaded').to.be.true;
    expect(
      Object.entries(remoteConfigManager.components.consensusNodes).length,
      'consensus node count should be 2',
    ).to.equal(2);
    testLogger.info(`${testName}: finished solo deployment add-cluster`);
  });

  // solo deployment create --deployment(*) --namespace(#)
  //   1. Create a new deployment with the specified name and namespace in the local configuration
  //   2. Fail if the deployment already exists

  // solo deployment create --deployment dual-cluster-full-deployment --namespace dual-cluster-full

  // solo deployment add-cluster --deployment(*) --cluster-ref(#) --enable-cert-manager
  //  --num-consensus-nodes N --dns-base-domain us-west-2.gcp.charlie.sphere
  //  --dns-consensus-node-pattern "{nodeId}.consensus.prod"
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
  //  --num-consensus-nodes 1 --dns-base-domain cluster.local --dns-consensus-node-pattern network-{nodeAlias}-svc.{namespace}.svc
  // solo deployment add-cluster --deployment dual-cluster-full-deployment --cluster-ref e2e-cluster2 --enable-cert-manager
  //  --num-consensus-nodes 1 --dns-base-domain cluster.local --dns-consensus-node-pattern network-{nodeAlias}-svc.{namespace}.svc

  // // TODO replace with proper commands to create a deployment - see above
  // it(`${testName}: manually create remote config`, async () => {
  //   testLogger.info(`${testName}: beginning to manually create the remote config and load it into the two clusters`);
  //   await manuallyCreateRemoteConfigConfigMap(contexts, namespace, deployment, testClusterRefs, nodeAliasesUnparsed);
  //
  //   const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
  //   expect(remoteConfigManager.isLoaded(), 'remote config manager should not be loaded').to.be.false;
  //   const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  //   configManager.setFlag(Flags.namespace, namespace);
  //   configManager.setFlag(Flags.deployment, deployment);
  //
  //   // @ts-ignore
  //   await remoteConfigManager.load(namespace, contexts[0]);
  //   expect(remoteConfigManager.isLoaded(), 'remote config manager should be loaded').to.be.true;
  //   expect(
  //     Object.entries(remoteConfigManager.components.consensusNodes).length,
  //     'consensus node count should be 2',
  //   ).to.equal(2);
  //
  //   testLogger.info(`${testName}: finished manually creating the remote config and loading it into the two clusters`);
  // });

  // TODO cluster setup (for right now this is being done by the `setup-dual-e2e.sh` script)

  it(`${testName}: node keys`, async () => {
    // TODO we shouldn't have to pass the nodeAliasesUnparsed
    testLogger.info(`${testName}: beginning node keys command`);
    expect(container.resolve<SoloLogger>(InjectTokens.SoloLogger)).to.equal(testLogger);
    await main(soloNodeKeysArgv(deployment, nodeAliasesUnparsed));
    const node1Key = fs.readFileSync(path.join(testCacheDir, 'keys', 's-private-node1.pem'));
    expect(node1Key).to.not.be.null;
    testLogger.info(`${testName}: finished node keys command`);
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

function soloClusterRefConnectArgv(clusterRef: ClusterRef, context: string): string[] {
  return [
    ...newArgv(),
    'cluster-ref',
    'connect',
    optionFromFlag(Flags.clusterRef),
    clusterRef,
    optionFromFlag(Flags.context),
    context,
    optionFromFlag(Flags.devMode),
    optionFromFlag(Flags.quiet),
  ];
}

function soloDeploymentCreateArgv(deployment: string, namespace: NamespaceName) {
  return [
    ...newArgv(),
    'deployment',
    'create',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.namespace),
    namespace.name,
    optionFromFlag(Flags.devMode),
    optionFromFlag(Flags.quiet),
  ];
}

function soloDeploymentAddClusterArgv(deployment: string, clusterRef: ClusterRef, numberOfNodes: number) {
  const argv = newArgv();
  argv.push('deployment');
  argv.push('add-cluster');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.clusterRef));
  argv.push(clusterRef);
  argv.push(optionFromFlag(Flags.numberOfConsensusNodes));
  argv.push(numberOfNodes.toString());
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.quiet));
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
  container.resolve<SoloLogger>(InjectTokens.SoloLogger).info(`${testName}: soloNodeKeysArgv: ${argv.join(' ')}`);
  return argv;
}

async function manuallyCreateRemoteConfigConfigMap(
  contexts: string[],
  namespace: NamespaceName,
  deployment: string,
  testClusterRefs: ClusterRef[],
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
    state: "post-genesis"
    soloChartVersion: ""
    hederaPlatformVersion: ""
    hederaMirrorNodeChartVersion: ""
    hederaExplorerChartVersion: ""
    hederaJsonRpcRelayChartVersion: ""
    soloVersion: ${getSoloVersion()} 
  version: 1.0.0
  clusters:
    ${testClusterRefs[0]}:
      name: ${testClusterRefs[0]}
      namespace: ${namespace.name}
      deployment: ${deployment}
      dnsBaseDomain: cluster.local
      dnsConsensusNodePattern: network-{nodeAlias}-svc.{namespace}.svc
    ${testClusterRefs[1]}:
      name: ${testClusterRefs[1]}
      namespace: ${namespace.name}
      deployment: ${deployment}
      dnsBaseDomain: cluster.local
      dnsConsensusNodePattern: network-{nodeAlias}-svc.{namespace}.svc
  components:
    relays: {}
    haProxies: {}
    mirrorNodes: {}
    envoyProxies: {}
    consensusNodes:
      node1:
        name: node1
        cluster: ${testClusterRefs[0]}
        namespace: ${namespace.name}
        state: requested
        nodeId: 0
      node2:
        name: node2
        cluster: ${testClusterRefs[1]}
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
  // TODO add solo chart directory
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
