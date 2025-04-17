// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import * as semver from 'semver';
import {Flags} from '../../../src/commands/flags.js';
import {getTestCacheDirectory, getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {main} from '../../../src/index.js';
import {resetForTest} from '../../test-container.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type DeploymentName,
} from '../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote-config-manager.js';
import {expect} from 'chai';
import fs from 'node:fs';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type LocalConfig} from '../../../src/core/config/local/local-config.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {
  DEFAULT_LOCAL_CONFIG_FILE,
  HEDERA_HAPI_PATH,
  HEDERA_USER_HOME_DIR,
  ROOT_CONTAINER,
} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type ConsensusNodeComponent} from '../../../src/core/config/remote/components/consensus-node-component.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {Templates} from '../../../src/core/templates.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {type SoloWinstonLogger} from '../../../src/core/logging/solo-winston-logger.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import * as constants from '../../../src/core/constants.js';
import {type ExtendedNetServer} from '../../../src/types/index.js';
import http from 'node:http';
import {sleep} from '../../../src/core/helpers.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hashgraph/sdk';
import {type PackageDownloader} from '../../../src/core/package-downloader.js';

const testName: string = 'dual-cluster-full';

describe('Dual Cluster Full E2E Test', async function dualClusterFullEndToEndTest(): Promise<void> {
  this.bail(true);
  const namespace: NamespaceName = NamespaceName.of(testName);
  const deployment: DeploymentName = `${testName}-deployment`;
  const testClusterArray: ClusterReference[] = ['e2e-cluster-alpha', 'e2e-cluster-beta'];
  const soloTestCluster: string = getTestCluster();
  const testCluster: string =
    soloTestCluster.includes('c1') || soloTestCluster.includes('c2') ? soloTestCluster : `${soloTestCluster}-c1`;
  const contexts: string[] = [
    `${testCluster}`,
    `${testCluster.replace(soloTestCluster.includes('-c1') ? '-c1' : '-c2', soloTestCluster.includes('-c1') ? '-c2' : '-c1')}`,
  ];
  const testClusterReferences: ClusterReferences = {};
  testClusterReferences[testClusterArray[0]] = contexts[0];
  testClusterReferences[testClusterArray[1]] = contexts[1];
  const testCacheDirectory: string = getTestCacheDirectory(testName);
  let testLogger: SoloWinstonLogger;
  const createdAccountIds: string[] = [];
  const enableLocalBuildPathTesting: boolean = process.env.SOLO_LOCAL_BUILD_PATH_TESTING?.toLowerCase() === 'true';
  const localBuildPath: string = process.env.SOLO_LOCAL_BUILD_PATH || '../hiero-consensus-node/hedera-node/data';
  const localBuildReleaseTag: string = process.env.SOLO_LOCAL_BUILD_RELEASE_TAG || HEDERA_PLATFORM_VERSION_TAG;

  // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
  before(async (): Promise<void> => {
    fs.rmSync(testCacheDirectory, {recursive: true, force: true});
    try {
      fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {force: true});
    } catch {
      // allowed to fail if the file doesn't exist
    }
    resetForTest(namespace.name, testCacheDirectory, testLogger, false);
    testLogger = container.resolve<SoloWinstonLogger>(InjectTokens.SoloLogger);
    for (const item of contexts) {
      const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
      await k8Client.namespaces().delete(namespace);
    }
    testLogger.info(`${testName}: starting dual cluster full e2e test`);
  }).timeout(Duration.ofMinutes(5).toMillis());

  beforeEach(async (): Promise<void> => {
    testLogger.info(`${testName}: resetting containers for each test`);
    resetForTest(namespace.name, testCacheDirectory, testLogger, false);
    testLogger.info(`${testName}: finished resetting containers for each test`);
  });

  // TODO after all test are done delete the namespace for the next test

  it(`${testName}: solo init`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning solo init`);
    await main(soloInitArgv());
    testLogger.info(`${testName}: finished solo init`);
  });

  it(`${testName}: solo cluster-ref connect`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning solo cluster-ref connect`);
    for (const [index, element] of testClusterArray.entries()) {
      await main(soloClusterReferenceConnectArgv(element, contexts[index]));
    }
    const localConfig: LocalConfig = container.resolve<LocalConfig>(InjectTokens.LocalConfig);
    const clusterReferences: ClusterReferences = localConfig.clusterRefs;
    expect(clusterReferences[testClusterArray[0]]).to.equal(contexts[0]);
    expect(clusterReferences[testClusterArray[1]]).to.equal(contexts[1]);
    testLogger.info(`${testName}: finished solo cluster-ref connect`);
  });

  it(`${testName}: solo deployment create`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning solo deployment create`);
    await main(soloDeploymentCreateArgv(deployment, namespace));
    testLogger.info(`${testName}: finished solo deployment create`);
  });

  it(`${testName}: solo deployment add-cluster`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning solo deployment add-cluster`);
    for (const element of testClusterArray) {
      await main(soloDeploymentAddClusterArgv(deployment, element, 1));
    }
    const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
    expect(remoteConfigManager.isLoaded(), 'remote config manager should be loaded').to.be.true;
    const consensusNodes: Record<string, ConsensusNodeComponent> = remoteConfigManager.components.consensusNodes;
    expect(Object.entries(consensusNodes).length, 'consensus node count should be 2').to.equal(2);
    expect(consensusNodes['node1'].cluster).to.equal(testClusterArray[0]);
    expect(consensusNodes['node2'].cluster).to.equal(testClusterArray[1]);
    testLogger.info(`${testName}: finished solo deployment add-cluster`);
  });

  it(`${testName}: solo cluster-ref setup`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning solo cluster-ref setup`);
    for (const element of testClusterArray) {
      await main(soloClusterReferenceSetup(element));
    }
    testLogger.info(`${testName}: finishing solo cluster-ref setup`);
  });

  it(`${testName}: node keys`, async (): Promise<void> => {
    testLogger.info(`${testName}: beginning node keys command`);
    expect(container.resolve<SoloLogger>(InjectTokens.SoloLogger)).to.equal(testLogger);
    await main(soloNodeKeysArgv(deployment));
    const node1Key: Buffer = fs.readFileSync(
      PathEx.joinWithRealPath(testCacheDirectory, 'keys', 's-private-node1.pem'),
    );
    expect(node1Key).to.not.be.null;
    testLogger.info(`${testName}: finished node keys command`);
  });

  it(`${testName}: network deploy`, async (): Promise<void> => {
    await main(soloNetworkDeployArgv(deployment, enableLocalBuildPathTesting, localBuildReleaseTag));
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    for (const [index, context_] of contexts.entries()) {
      const k8: K8 = k8Factory.getK8(context_);
      expect(await k8.namespaces().has(namespace), `namespace ${namespace} should exist in ${context}`).to.be.true;
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods).to.have.lengthOf(1);
      const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(index + 1);
      expect(pods[0].labels['solo.hedera.com/node-name']).to.equal(nodeAlias);
    }
  }).timeout(Duration.ofMinutes(5).toMillis());

  // TODO node setup still list --node-aliases
  it(`${testName}: node setup`, async (): Promise<void> => {
    await main(soloNodeSetupArgv(deployment, enableLocalBuildPathTesting, localBuildPath, localBuildReleaseTag));
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    for (const context_ of contexts) {
      const k8: K8 = k8Factory.getK8(context_);
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods, 'expect this cluster to have one network node').to.have.lengthOf(1);
      const rootContainer: ContainerReference = ContainerReference.of(
        PodReference.of(namespace, pods[0].podReference.name),
        ROOT_CONTAINER,
      );
      if (!enableLocalBuildPathTesting) {
        expect(
          await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_USER_HOME_DIR}/extract-platform.sh`),
          'expect extract-platform.sh to be present on the pods',
        ).to.be.true;
      }
      expect(await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_HAPI_PATH}/data/apps/HederaNode.jar`)).to
        .be.true;
      expect(
        await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_HAPI_PATH}/data/config/genesis-network.json`),
      ).to.be.true;
      expect(
        await k8
          .containers()
          .readByRef(rootContainer)
          .execContainer(['bash', '-c', `ls -al ${HEDERA_HAPI_PATH} | grep output`]),
      ).to.includes('hedera');
    }
  }).timeout(Duration.ofMinutes(2).toMillis());

  // TODO node start still list --node-aliases
  it(`${testName}: node start`, async (): Promise<void> => {
    await main(soloNodeStartArgv(deployment));
    for (const context_ of contexts) {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(context_);
      const networkNodePod: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(networkNodePod).to.have.lengthOf(1);
      const haProxyPod: Pod[] = await k8
        .pods()
        .waitForReadyStatus(
          namespace,
          [
            `app=haproxy-${Templates.extractNodeAliasFromPodName(networkNodePod[0].podReference.name)}`,
            'solo.hedera.com/type=haproxy',
          ],
          constants.NETWORK_PROXY_MAX_ATTEMPTS,
          constants.NETWORK_PROXY_DELAY,
        );
      expect(haProxyPod).to.have.lengthOf(1);
      createdAccountIds.push(
        await verifyAccountCreateWasSuccessful(namespace, testClusterReferences, deployment),
        await verifyAccountCreateWasSuccessful(namespace, testClusterReferences, deployment),
      );
    }
    // create one more account to make sure that the last one gets pushed to mirror node
    await verifyAccountCreateWasSuccessful(namespace, testClusterReferences, deployment);
  }).timeout(Duration.ofMinutes(5).toMillis());

  it(`${testName}: mirror node deploy`, async (): Promise<void> => {
    await main(soloMirrorNodeDeployArgv(deployment, testClusterArray[1]));
    await verifyMirrorNodeDeployWasSuccessful(
      contexts,
      namespace,
      testLogger,
      createdAccountIds,
      enableLocalBuildPathTesting,
      localBuildReleaseTag,
    );
  }).timeout(Duration.ofMinutes(10).toMillis());

  it(`${testName}: explorer deploy`, async (): Promise<void> => {
    await main(soloExplorerDeployArgv(deployment, testClusterArray[1]));
    await verifyExplorerDeployWasSuccessful(contexts, namespace, createdAccountIds, testLogger);
  }).timeout(Duration.ofMinutes(5).toMillis());

  // TODO json rpc relay deploy
  // TODO json rpc relay destroy
  // TODO explorer destroy
  // TODO mirror node destroy
  // TODO network destroy
  xit(`${testName}: network destroy`, async (): Promise<void> => {
    await main(soloNetworkDestroyArgv(deployment));
  });
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

function soloClusterReferenceConnectArgv(clusterReference: ClusterReference, context: string): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'cluster-ref',
    'connect',
    optionFromFlag(Flags.clusterRef),
    clusterReference,
    optionFromFlag(Flags.context),
    context,
    optionFromFlag(Flags.userEmailAddress),
    'dual.full.cluster.test@host.com',
  );
  argvPushGlobalFlags(argv);
  return argv;
}

function soloDeploymentCreateArgv(deployment: DeploymentName, namespace: NamespaceName): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'deployment',
    'create',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.namespace),
    namespace.name,
  );
  argvPushGlobalFlags(argv);
  return argv;
}

function soloDeploymentAddClusterArgv(
  deployment: DeploymentName,
  clusterReference: ClusterReference,
  numberOfNodes: number,
): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'deployment',
    'add-cluster',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.clusterRef),
    clusterReference,
    optionFromFlag(Flags.numberOfConsensusNodes),
    numberOfNodes.toString(),
  );
  argvPushGlobalFlags(argv);
  return argv;
}

function soloClusterReferenceSetup(clusterReference: ClusterReference): string[] {
  const argv: string[] = newArgv();
  argv.push('cluster-ref', 'setup', optionFromFlag(Flags.clusterRef), clusterReference);
  argvPushGlobalFlags(argv, false, true);
  return argv;
}

function soloNodeKeysArgv(deployment: DeploymentName): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'node',
    'keys',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.generateGossipKeys),
    'true',
    optionFromFlag(Flags.generateTlsKeys),
  );
  argvPushGlobalFlags(argv, true);
  return argv;
}

function soloNetworkDeployArgv(
  deployment: DeploymentName,
  enableLocalBuildPathTesting: boolean,
  localBuildReleaseTag: string,
): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'network',
    'deploy',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.loadBalancerEnabled),
  ); // have to enable load balancer to resolve cross cluster in multi-cluster
  if (enableLocalBuildPathTesting) {
    argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
  }
  argvPushGlobalFlags(argv, true, true);
  return argv;
}

function soloNodeSetupArgv(
  deployment: DeploymentName,
  enableLocalBuildPathTesting: boolean,
  localBuildPath: string,
  localBuildReleaseTag: string,
): string[] {
  const argv: string[] = newArgv();
  argv.push('node', 'setup', optionFromFlag(Flags.deployment), deployment);
  if (enableLocalBuildPathTesting) {
    argv.push(
      optionFromFlag(Flags.localBuildPath),
      localBuildPath,
      optionFromFlag(Flags.releaseTag),
      localBuildReleaseTag,
    );
  }
  argvPushGlobalFlags(argv, true);
  return argv;
}

function soloNodeStartArgv(deployment: DeploymentName): string[] {
  const argv: string[] = newArgv();
  argv.push('node', 'start', optionFromFlag(Flags.deployment), deployment);
  argvPushGlobalFlags(argv);
  return argv;
}

async function verifyAccountCreateWasSuccessful(
  namespace: NamespaceName,
  clusterReferences: ClusterReferences,
  deployment: DeploymentName,
): Promise<string> {
  const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
  try {
    await accountManager.refreshNodeClient(namespace, clusterReferences, undefined, deployment);
    expect(accountManager._nodeClient).not.to.be.null;
    const privateKey: PrivateKey = PrivateKey.generate();
    const amount: number = 777;

    const newAccount: TransactionResponse = await new AccountCreateTransaction()
      .setKeyWithoutAlias(privateKey)
      .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
      .execute(accountManager._nodeClient);

    // Get the new account ID
    const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
    const accountInfo: {accountId: string; privateKey: string; balance: number; publicKey: string} = {
      accountId: getReceipt.accountId.toString(),
      privateKey: privateKey.toString(),
      publicKey: privateKey.publicKey.toString(),
      balance: amount,
    };

    expect(accountInfo.accountId).not.to.be.null;
    expect(accountInfo.balance).to.equal(amount);

    return accountInfo.accountId;
  } finally {
    await accountManager.close();
    // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
    expect(accountManager._portForwards, 'port forwards should be empty after accountManager.close()').to.have.lengthOf(
      0,
    );
  }
}

function soloMirrorNodeDeployArgv(deployment: DeploymentName, clusterReference: ClusterReference): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'mirror-node',
    'deploy',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.clusterRef),
    clusterReference,
    optionFromFlag(Flags.pinger),
  );
  argvPushGlobalFlags(argv, true, true);
  return argv;
}

async function verifyMirrorNodeDeployWasSuccessful(
  contexts: string[],
  namespace: NamespaceName,
  testLogger: SoloWinstonLogger,
  createdAccountIds: string[],
  enableLocalBuildPathTesting: boolean,
  localBuildReleaseTag: string,
): Promise<void> {
  const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
  const k8: K8 = k8Factory.getK8(contexts[1]);
  const mirrorNodeRestPods: Pod[] = await k8
    .pods()
    .list(namespace, [
      'app.kubernetes.io/instance=mirror',
      'app.kubernetes.io/name=rest',
      'app.kubernetes.io/component=rest',
    ]);
  expect(mirrorNodeRestPods).to.have.lengthOf(1);

  let portForwarder: ExtendedNetServer;
  try {
    portForwarder = await k8.pods().readByReference(mirrorNodeRestPods[0].podReference).portForward(5551, 5551);
    await sleep(Duration.ofSeconds(2));
    const queryUrl: string = 'http://localhost:5551/api/v1/network/nodes';

    let received: boolean = false;
    // wait until the transaction reached consensus and retrievable from the mirror node API
    while (!received) {
      const request: http.ClientRequest = http.request(
        queryUrl,
        {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
        (response: http.IncomingMessage): void => {
          response.setEncoding('utf8');

          response.on('data', (chunk): void => {
            // convert chunk to json object
            const object: {nodes: {service_endpoints: unknown[]}[]} = JSON.parse(chunk);
            expect(
              object.nodes?.length,
              "expect there to be two nodes in the mirror node's copy of the address book",
            ).to.equal(2);

            if (
              (enableLocalBuildPathTesting && semver.gte(localBuildReleaseTag.slice(1), '0.62.0')) ||
              semver.gte(HEDERA_PLATFORM_VERSION_TAG, '0.62.0')
            ) {
              expect(
                object.nodes[0].service_endpoints?.length,
                'expect there to be at least one service endpoint',
              ).to.be.greaterThan(0);
            }

            received = true;
          });
        },
      );

      request.on('error', (error: Error): void => {
        testLogger.debug(`problem with request: ${error.message}`, error);
      });

      request.end(); // make the request
      await sleep(Duration.ofSeconds(2));
    }

    for (const accountId of createdAccountIds) {
      const accountQueryUrl: string = `http://localhost:5551/api/v1/accounts/${accountId}`;

      received = false;
      // wait until the transaction reached consensus and retrievable from the mirror node API
      while (!received) {
        const request: http.ClientRequest = http.request(
          accountQueryUrl,
          {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
          (response: http.IncomingMessage): void => {
            response.setEncoding('utf8');

            response.on('data', (chunk): void => {
              // convert chunk to json object
              const object: {account: string} = JSON.parse(chunk);

              expect(
                object.account,
                'expect the created account to exist in the mirror nodes copy of the accounts',
              ).to.equal(accountId);

              received = true;
            });
          },
        );

        request.on('error', (error: Error): void => {
          testLogger.debug(`problem with request: ${error.message}`, error);
        });

        request.end(); // make the request
        await sleep(Duration.ofSeconds(2));
      }

      await sleep(Duration.ofSeconds(1));
    }
  } finally {
    if (portForwarder) {
      // eslint-disable-next-line unicorn/no-null
      await k8.pods().readByReference(null).stopPortForward(portForwarder);
    }
  }
}

function soloExplorerDeployArgv(deployment: DeploymentName, clusterReference: ClusterReference): string[] {
  const argv: string[] = newArgv();
  argv.push(
    'explorer',
    'deploy',
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.clusterRef),
    clusterReference,
  );
  argvPushGlobalFlags(argv, true, true);
  return argv;
}

async function verifyExplorerDeployWasSuccessful(
  contexts: string[],
  namespace: NamespaceName,
  createdAccountIds: string[],
  testLogger: SoloWinstonLogger,
): Promise<void> {
  const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
  const k8: K8 = k8Factory.getK8(contexts[1]);
  const hederaExplorerPods: Pod[] = await k8
    .pods()
    .list(namespace, [
      'app.kubernetes.io/instance=hedera-explorer',
      'app.kubernetes.io/name=hedera-explorer-chart',
      'app.kubernetes.io/component=hedera-explorer',
    ]);
  expect(hederaExplorerPods).to.have.lengthOf(1);
  let portForwarder: ExtendedNetServer;
  try {
    portForwarder = await k8.pods().readByReference(hederaExplorerPods[0].podReference).portForward(8080, 8080);
    await sleep(Duration.ofSeconds(2));
    const queryUrl: string = 'http://127.0.0.1:8080/api/v1/accounts?limit=15&order=desc';
    const packageDownloader: PackageDownloader = container.resolve<PackageDownloader>(InjectTokens.PackageDownloader);
    expect(await packageDownloader.urlExists(queryUrl), 'the hedera explorer Accounts URL should exist').to.be.true;

    let received: boolean = false;
    // wait until the transaction reached consensus and retrievable from the mirror node API
    while (!received) {
      const request: http.ClientRequest = http.request(
        queryUrl,
        {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
        (response: http.IncomingMessage): void => {
          response.setEncoding('utf8');

          response.on('data', (chunk): void => {
            // convert chunk to json object
            const object: {accounts: {account: string}[]} = JSON.parse(chunk);
            expect(
              object.accounts?.length,
              "expect there to be more than one account in the hedera explorer's call to mirror node",
            ).to.be.greaterThan(1);

            for (const accountId of createdAccountIds) {
              expect(
                object.accounts.some((account: {account: string}): boolean => account.account === accountId),
                `expect ${accountId} to be in the response`,
              ).to.be.true;
            }

            received = true;
          });
        },
      );

      request.on('error', (error: Error): void => {
        testLogger.debug(`problem with request: ${error.message}`, error);
      });

      request.end(); // make the request
      await sleep(Duration.ofSeconds(2));
    }
  } finally {
    if (portForwarder) {
      // eslint-disable-next-line unicorn/no-null
      await k8.pods().readByReference(null).stopPortForward(portForwarder);
    }
  }
}

function soloNetworkDestroyArgv(deployment: DeploymentName): string[] {
  const argv: string[] = newArgv();
  argv.push('network', 'destroy', optionFromFlag(Flags.deployment), deployment);
  argvPushGlobalFlags(argv, false, true);
  return argv;
}

function argvPushGlobalFlags(
  argv: string[],
  shouldSetTestCacheDirectory: boolean = false,
  shouldSetChartDirectory: boolean = false,
): string[] {
  argv.push(optionFromFlag(Flags.devMode), optionFromFlag(Flags.quiet));

  if (shouldSetChartDirectory && process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
    argv.push(optionFromFlag(Flags.chartDirectory), process.env.SOLO_CHARTS_DIR);
  }

  if (shouldSetTestCacheDirectory) {
    argv.push(optionFromFlag(Flags.cacheDir), getTestCacheDirectory(testName));
  }

  return argv;
}
