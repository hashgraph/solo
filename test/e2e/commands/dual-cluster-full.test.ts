// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags} from '../../../src/commands/flags.js';
import {getTestCacheDir, getTestCluster} from '../../test-util.js';
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
import {type SoloLogger} from '../../../src/core/logging.js';
import {type LocalConfig} from '../../../src/core/config/local/local-config.js';
import {type K8ClientFactory} from '../../../src/core/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/core/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type ConsensusNodeComponent} from '../../../src/core/config/remote/components/consensus-node-component.js';
import {type Pod} from '../../../src/core/kube/resources/pod/pod.js';
import {Templates} from '../../../src/core/templates.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

const testName: string = 'dual-cluster-full';

describe('Dual Cluster Full E2E Test', async function dualClusterFullE2eTest(): Promise<void> {
  this.bail(true);
  const namespace: NamespaceName = NamespaceName.of(testName);
  const deployment: string = `${testName}-deployment`;
  const testClusterRefs: ClusterRef[] = ['e2e-cluster-alpha', 'e2e-cluster-beta'];
  const soloTestCluster: string = getTestCluster();
  const testCluster: string =
    soloTestCluster.includes('c1') || soloTestCluster.includes('c2') ? soloTestCluster : `${soloTestCluster}-c1`;
  const contexts: string[] = [
    `${testCluster}`,
    `${testCluster.replace(soloTestCluster.includes('-c1') ? '-c1' : '-c2', soloTestCluster.includes('-c1') ? '-c2' : '-c1')}`,
  ];
  const testCacheDir: string = getTestCacheDir(testName);
  let testLogger: SoloLogger;

  // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
  before(async () => {
    fs.rmSync(testCacheDir, {recursive: true, force: true});
    try {
      fs.rmSync(PathEx.joinWithRealPath(testCacheDir, '..', DEFAULT_LOCAL_CONFIG_FILE), {force: true});
    } catch {
      // allowed to fail if the file doesn't exist
    }
    resetForTest(namespace.name, testCacheDir, testLogger, false);
    testLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    for (let i: number = 0; i < contexts.length; i++) {
      const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(contexts[i]);
      await k8Client.namespaces().delete(namespace);
    }
    testLogger.info(`${testName}: starting dual cluster full e2e test`);
  }).timeout(Duration.ofMinutes(5).toMillis());

  beforeEach(async () => {
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
    const localConfig: LocalConfig = container.resolve<LocalConfig>(InjectTokens.LocalConfig);
    const clusterRefs: ClusterRefs = localConfig.clusterRefs;
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
    const consensusNodes: Record<string, ConsensusNodeComponent> = remoteConfigManager.components.consensusNodes;
    expect(Object.entries(consensusNodes).length, 'consensus node count should be 2').to.equal(2);
    expect(consensusNodes['node1'].cluster).to.equal(testClusterRefs[0]);
    expect(consensusNodes['node2'].cluster).to.equal(testClusterRefs[1]);
    testLogger.info(`${testName}: finished solo deployment add-cluster`);
  });

  it(`${testName}: solo cluster-ref setup`, async () => {
    testLogger.info(`${testName}: beginning solo cluster-ref setup`);
    for (let index = 0; index < testClusterRefs.length; index++) {
      await main(soloClusterRefSetup(testClusterRefs[index]));
    }
    testLogger.info(`${testName}: finishing solo cluster-ref setup`);
  });

  it(`${testName}: node keys`, async () => {
    testLogger.info(`${testName}: beginning node keys command`);
    expect(container.resolve<SoloLogger>(InjectTokens.SoloLogger)).to.equal(testLogger);
    await main(soloNodeKeysArgv(deployment));
    const node1Key: Buffer<ArrayBufferLike> = fs.readFileSync(
      PathEx.joinWithRealPath(testCacheDir, 'keys', 's-private-node1.pem'),
    );
    expect(node1Key).to.not.be.null;
    testLogger.info(`${testName}: finished node keys command`);
  });

  it(`${testName}: network deploy`, async () => {
    await main(soloNetworkDeployArgv(deployment));
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    for (let index: number = 0; index < contexts.length; index++) {
      const k8: K8 = k8Factory.getK8(contexts[index]);
      expect(await k8.namespaces().has(namespace), `namespace ${namespace} should exist in ${context}`).to.be.true;
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods).to.have.lengthOf(1);
      const nodeAlias = Templates.renderNodeAliasFromNumber(index + 1);
      expect(pods[0].labels['solo.hedera.com/node-name']).to.equal(nodeAlias);
    }
  }).timeout(Duration.ofMinutes(5).toMillis());

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
  const argv: string[] = newArgv();
  argv.push('init');
  argvPushGlobalFlags(argv, true);
  return argv;
}

function soloClusterRefConnectArgv(clusterRef: ClusterRef, context: string): string[] {
  const argv: string[] = newArgv();
  argv.push('cluster-ref');
  argv.push('connect');
  argv.push(optionFromFlag(Flags.clusterRef));
  argv.push(clusterRef);
  argv.push(optionFromFlag(Flags.context));
  argv.push(context);
  argv.push(optionFromFlag(Flags.userEmailAddress));
  argv.push('dual.full.cluster.test@host.com');
  argvPushGlobalFlags(argv);
  return argv;
}

function soloDeploymentCreateArgv(deployment: string, namespace: NamespaceName): string[] {
  const argv: string[] = newArgv();
  argv.push('deployment');
  argv.push('create');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.namespace));
  argv.push(namespace.name);
  argvPushGlobalFlags(argv);
  return argv;
}

function soloDeploymentAddClusterArgv(deployment: string, clusterRef: ClusterRef, numberOfNodes: number): string[] {
  const argv: string[] = newArgv();
  argv.push('deployment');
  argv.push('add-cluster');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.clusterRef));
  argv.push(clusterRef);
  argv.push(optionFromFlag(Flags.numberOfConsensusNodes));
  argv.push(numberOfNodes.toString());
  argvPushGlobalFlags(argv);
  return argv;
}

function soloClusterRefSetup(clusterRef: ClusterRef) {
  const argv: string[] = newArgv();
  argv.push('cluster-ref');
  argv.push('setup');
  argv.push(optionFromFlag(Flags.clusterRef));
  argv.push(clusterRef);
  argvPushGlobalFlags(argv, false, true);
  return argv;
}

function soloNodeKeysArgv(deployment: DeploymentName): string[] {
  const argv: string[] = newArgv();
  argv.push('node');
  argv.push('keys');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argv.push(optionFromFlag(Flags.generateGossipKeys));
  argv.push('true');
  argv.push(optionFromFlag(Flags.generateTlsKeys));
  argvPushGlobalFlags(argv, true);
  return argv;
}

function soloNetworkDeployArgv(deployment: string): string[] {
  const argv: string[] = newArgv();
  argv.push('network');
  argv.push('deploy');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argvPushGlobalFlags(argv, true, true);
  return argv;
}

function soloNodeSetupArgv(deployment: string): string[] {
  const argv: string[] = newArgv();
  argv.push('node');
  argv.push('setup');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argvPushGlobalFlags(argv, true);
  return argv;
}

function soloNodeStartArgv(deployment: string): string[] {
  const argv: string[] = newArgv();
  argv.push('node');
  argv.push('start');
  argv.push(optionFromFlag(Flags.deployment));
  argv.push(deployment);
  argvPushGlobalFlags(argv);
  return argv;
}

function argvPushGlobalFlags(
  argv: string[],
  shouldSetTestCacheDir: boolean = false,
  shouldSetChartDir: boolean = false,
): string[] {
  argv.push(optionFromFlag(Flags.devMode));
  argv.push(optionFromFlag(Flags.quiet));

  if (shouldSetChartDir && process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
    argv.push(optionFromFlag(Flags.chartDirectory));
    argv.push(process.env.SOLO_CHARTS_DIR);
  }

  if (shouldSetTestCacheDir) {
    argv.push(optionFromFlag(Flags.cacheDir));
    argv.push(getTestCacheDir(testName));
  }

  return argv;
}
