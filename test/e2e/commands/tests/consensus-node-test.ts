// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';
import {
  type Context,
  type ClusterReferenceName,
  type ClusterReferences,
  type DeploymentName,
  type SoloListrTaskWrapper,
} from '../../../../src/types/index.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {Flags as flags, Flags} from '../../../../src/commands/flags.js';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {expect} from 'chai';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, HEDERA_USER_HOME_DIR, ROOT_CONTAINER} from '../../../../src/core/constants.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {Templates} from '../../../../src/core/templates.js';
import * as constants from '../../../../src/core/constants.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {
  AccountCreateTransaction,
  AccountId,
  AccountInfoQuery,
  Hbar,
  HbarUnit,
  PrivateKey,
  type AccountInfo,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {type BaseTestOptions} from './base-test-options.js';

import {KeysTest} from './keys-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import {sleep} from '../../../../src/core/helpers.js';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';

import {it} from 'mocha';

import {
  createAccount,
  queryBalance,
  getTemporaryDirectory,
  getTestCacheDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../../test-utility.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {TEST_UPGRADE_FROM_VERSION, TEST_UPGRADE_TO_VERSION} from '../../../../version-test.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {type Container} from '../../../../src/integration/kube/resources/container/container.js';
import {Zippy} from '../../../../src/core/zippy.js';
import {type NetworkNodes} from '../../../../src/core/network-nodes.js';
import {NodeStatusCodes} from '../../../../src/core/enumerations.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

export class ConsensusNodeTest extends BaseCommandTest {
  public static keys(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, testCacheDirectory} = options;
    const {soloKeysConsensusGenerateArgv} = KeysTest;

    it(`${testName}: keys consensus generate`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning keys consensus generate command`);
      await main(soloKeysConsensusGenerateArgv(testName, deployment));
      const node1Key: Buffer = fs.readFileSync(
        PathEx.joinWithRealPath(testCacheDirectory, 'keys', 's-private-node1.pem'),
      );
      expect(node1Key).to.not.be.null;
      testLogger.info(`${testName}: finished keys consensus generate command`);
    });
  }

  private static soloConsensusNodeSetupArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildPath: string,
    localBuildReleaseTag: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_SETUP,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.localBuildPath), localBuildPath);
    }

    // Allow version-pinned setup in E2E tests even when local-build mode is off.
    if (localBuildReleaseTag) {
      argv.push(optionFromFlag(Flags.consensusNodeVersion), localBuildReleaseTag);
    }
    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  public static soloConsensusNodeSetup(
    deployment: DeploymentName,
    cacheDirectory: string,
    localBuildPath?: string,
    app?: string,
    appConfig?: string,
  ): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_SETUP,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );
    if (localBuildPath) {
      argv.push(optionFromFlag(Flags.localBuildPath), localBuildPath);
    }
    if (app) {
      argv.push(optionFromFlag(Flags.app), app);
    }
    if (appConfig) {
      argv.push(optionFromFlag(Flags.appConfig), appConfig);
    }
    return argv;
  }

  private static soloConsensusNodeAddArgv(options: BaseTestOptions, useFqdn: boolean = true): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {testName} = options;

    const firstClusterReference: ClusterReferenceName = [...options.clusterReferences.keys()][0];

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      options.deployment,
      optionFromFlag(flags.persistentVolumeClaims),
      optionFromFlag(Flags.clusterRef),
      firstClusterReference,
      optionFromFlag(flags.generateGossipKeys),
      optionFromFlag(flags.generateTlsKeys),
    );

    if (options.enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        options.localBuildPath,
        optionFromFlag(Flags.consensusNodeVersion),
        options.localBuildReleaseTag,
      );
    }

    if (!useFqdn) {
      argv.push(optionFromFlag(Flags.endpointType), constants.ENDPOINT_TYPE_IP);
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  public static soloConsensusNetworkDeployArgv(
    deployment: DeploymentName,
    nodeAliases: string,
    pvcsEnabled: boolean,
    cacheDirectory: string,
    app?: string,
  ): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DEPLOY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliases,
      optionFromFlag(Flags.persistentVolumeClaims),
      pvcsEnabled ? 'true' : 'false',
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    if (app) {
      argv.push(optionFromFlag(Flags.app), app);
    }
    return argv;
  }

  private static soloConsensusNodeUpdateArgv(options: BaseTestOptions, useFqdn: boolean = true): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {
      testName,
      deployment,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
      consensusNodesCount,
    } = options;

    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(consensusNodesCount + 1);

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_UPDATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      nodeAlias,
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.consensusNodeVersion),
        localBuildReleaseTag,
      );
    }

    if (!useFqdn) {
      argv.push(optionFromFlag(Flags.endpointType), constants.ENDPOINT_TYPE_IP);
    }

    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  private static soloConsensusNodeUpgradeArgv(
    options: BaseTestOptions,
    zipFile?: string,
    applicationPropertiesPath?: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {testName, deployment} = options;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_UPGRADE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
      optionFromFlag(flags.force),
      optionFromFlag(flags.upgradeVersion),
      TEST_UPGRADE_TO_VERSION,
    );

    if (zipFile) {
      argv.push(optionFromFlag(flags.upgradeZipFile), zipFile);
    }

    if (applicationPropertiesPath) {
      argv.push(optionFromFlag(flags.applicationProperties), applicationPropertiesPath);
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloConsensusNodeDestroyArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {
      testName,
      deployment,
      consensusNodesCount,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
    } = options;

    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(consensusNodesCount + 1);

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.nodeAlias),
      nodeAlias,
      optionFromFlag(flags.force),
      optionFromFlag(flags.quiet),
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.consensusNodeVersion),
        localBuildReleaseTag,
      );
    }

    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  private static soloDeploymentDiagnosticsConnectionsArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {testName, deployment} = options;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTICS_CONNECTIONS,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
    );

    argvPushGlobalFlags(argv, testName, false);
    return argv;
  }

  private static soloConsensusNodeRefreshArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {testName, deployment, enableLocalBuildPathTesting, localBuildPath, localBuildReleaseTag} = options;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_REFRESH,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
      optionFromFlag(flags.nodeAliasesUnparsed),
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.consensusNodeVersion),
        localBuildReleaseTag,
      );
    }

    argvPushGlobalFlags(argv, testName, true, true);

    return argv;
  }

  private static soloConsensusNodeStopArgv(options: BaseTestOptions, nodeAlias?: NodeAlias): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;
    const {testName, deployment} = options;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_STOP,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
    );

    if (nodeAlias) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAlias);
    }

    argvPushGlobalFlags(argv, testName, false);
    return argv;
  }

  public static setup(options: BaseTestOptions, version?: string): void {
    const {
      testName,
      deployment,
      namespace,
      contexts,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
      consensusNodesCount,
    } = options;
    const {soloConsensusNodeSetupArgv} = ConsensusNodeTest;

    it(`${testName}: consensus node setup`, async (): Promise<void> => {
      await main(
        soloConsensusNodeSetupArgv(
          testName,
          deployment,
          enableLocalBuildPathTesting,
          localBuildPath,
          version ?? localBuildReleaseTag,
        ),
      );
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

      const clusterCount: number = contexts.length;
      const base: number = Math.floor(consensusNodesCount / clusterCount);
      const remainder: number = consensusNodesCount % clusterCount;

      for (const [index, context_] of contexts.entries()) {
        const expectedNodeCount: number = index < remainder ? base + 1 : base;

        const k8: K8 = k8Factory.getK8(context_);

        const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

        expect(
          pods.length,
          `expect this cluster (${context_}) to have ${expectedNodeCount} network node(s) in namespace ${namespace}`,
        ).to.equal(expectedNodeCount);

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

        expect(await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_HAPI_PATH}/data/apps/HederaNode.jar`))
          .to.be.true;

        expect(
          await k8
            .containers()
            .readByRef(rootContainer)
            .hasFile(`${HEDERA_HAPI_PATH}/data/config/genesis-network.json`),
        ).to.be.true;

        expect(
          await k8
            .containers()
            .readByRef(rootContainer)
            .execContainer(['bash', '-c', `ls -al ${HEDERA_HAPI_PATH} | grep output`]),
        ).to.includes('hedera');
      }
    }).timeout(Duration.ofMinutes(2).toMillis());
  }

  public static readonly alphaClusterGrpcWebAddress: string = 'localhost';
  public static readonly betaClusterGrpcWebAddress: string = 'remote.cluster.address';
  public static readonly baseGrpcWebPort: number = 4444;

  // Legacy aliases kept for external references
  public static readonly firstNodeCustomGrpcWebEndpointAddress: string = ConsensusNodeTest.alphaClusterGrpcWebAddress;
  public static readonly firstNodeCustomGrpcWebEndpointPort: number = ConsensusNodeTest.baseGrpcWebPort;
  public static readonly secondNodeCustomGrpcWebEndpointAddress: string = ConsensusNodeTest.betaClusterGrpcWebAddress;
  public static readonly secondNodeCustomGrpcWebEndpointPort: number = ConsensusNodeTest.baseGrpcWebPort + 1;

  // Returns the 0-based cluster index (0=alpha, 1=beta) for a 1-based node number
  // given N total nodes spread across 2 clusters (ceil(N/2) in alpha, floor(N/2) in beta).
  public static clusterIndexForNodeNumber(nodeNumber: number, totalNodes: number): number {
    return nodeNumber <= Math.ceil(totalNodes / 2) ? 0 : 1;
  }

  // Generates the --grpc-web-endpoints value for all N nodes.
  // Alpha nodes get alphaClusterGrpcWebAddress and beta nodes get betaClusterGrpcWebAddress.
  // Each node gets a unique port starting at baseGrpcWebPort.
  public static grpcWebEndpointsForNodes(consensusNodesCount: number): string {
    const alphaCount: number = Math.ceil(consensusNodesCount / 2);
    const endpoints: string[] = [];
    for (let index: number = 1; index <= consensusNodesCount; index++) {
      const address: string =
        index <= alphaCount
          ? ConsensusNodeTest.alphaClusterGrpcWebAddress
          : ConsensusNodeTest.betaClusterGrpcWebAddress;
      const port: number = ConsensusNodeTest.baseGrpcWebPort + index - 1;
      endpoints.push(`node${index}=${address}:${port}`);
    }
    return endpoints.join(',');
  }

  private static soloNodeStartArgv(
    testName: string,
    deployment: DeploymentName,
    consensusNodesCount: number,
    nodeAliases?: string,
    setCustomGrpcWebAddress?: boolean,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_START,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    if (nodeAliases) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAliases);
    }
    argvPushGlobalFlags(argv, testName);

    if (setCustomGrpcWebAddress) {
      argv.push(
        optionFromFlag(flags.grpcWebEndpoints),
        ConsensusNodeTest.grpcWebEndpointsForNodes(consensusNodesCount),
      );
    }

    return argv;
  }

  public static soloNodeStart(deployment: DeploymentName, nodeAliases: string, app?: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_START,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliases,
    );
    if (app) {
      argv.push(optionFromFlag(Flags.app), app);
    }
    return argv;
  }

  private static async verifyAccountCreateWasSuccessful(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
  ): Promise<string> {
    const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
    try {
      await accountManager.refreshNodeClient(namespace, clusterReferences, deployment);
      expect(accountManager._nodeClient).not.to.be.undefined;
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
      expect(
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards,
        'port forwards should be empty after accountManager.close()',
      ).to.have.lengthOf(0);
    }
  }

  public static start(options: BaseTestOptions, setCustomGrpcWebAddress: boolean = false): void {
    const {testName, deployment, namespace, contexts, createdAccountIds, clusterReferences, consensusNodesCount} =
      options;
    const {soloNodeStartArgv, verifyAccountCreateWasSuccessful} = ConsensusNodeTest;

    it(`${testName}: consensus node start`, async (): Promise<void> => {
      await main(soloNodeStartArgv(testName, deployment, consensusNodesCount, undefined, setCustomGrpcWebAddress));

      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

      const clusterCount: number = contexts.length;
      const base: number = Math.floor(consensusNodesCount / clusterCount);
      const remainder: number = consensusNodesCount % clusterCount;

      for (const [index, context_] of contexts.entries()) {
        const k8: K8 = k8Factory.getK8(context_);
        const expectedNodeCount: number = index < remainder ? base + 1 : base;

        const networkNodePods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

        expect(
          networkNodePods.length,
          `expected ${expectedNodeCount} network-node pod(s) in namespace ${namespace} for context ${context_}`,
        ).to.equal(expectedNodeCount);

        const haProxyPod: Pod[] = await k8
          .pods()
          .waitForReadyStatus(
            namespace,
            [
              `app=haproxy-${Templates.extractNodeAliasFromPodName(networkNodePods[0].podReference.name)}`,
              'solo.hedera.com/type=haproxy',
            ],
            constants.NETWORK_PROXY_MAX_ATTEMPTS,
            constants.NETWORK_PROXY_DELAY,
          );
        expect(haProxyPod).to.have.lengthOf(1);

        createdAccountIds.push(
          await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment),
          await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment),
        );
      }
      // create one more account to make sure that the last one gets pushed to mirror node
      await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static add(options: BaseTestOptions, useFqdn: boolean = true): void {
    const {testName} = options;
    const {soloConsensusNodeAddArgv} = ConsensusNodeTest;

    it(`${testName}: consensus node add`, async (): Promise<void> => {
      await main(soloConsensusNodeAddArgv(options, useFqdn));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static update(options: BaseTestOptions, useFqdn: boolean = true): void {
    const {testName} = options;
    const {soloConsensusNodeUpdateArgv} = ConsensusNodeTest;

    it(`${testName}: consensus node update`, async (): Promise<void> => {
      await main(soloConsensusNodeUpdateArgv(options, useFqdn));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static upgrade(options: BaseTestOptions): void {
    const {testName, namespace, contexts, testLogger: logger, shard, realm} = options;
    const {soloConsensusNodeUpgradeArgv} = ConsensusNodeTest;

    it(`${testName}: consensus node upgrade`, async (): Promise<void> => {
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      await localConfig.load();

      const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
        InjectTokens.RemoteConfigRuntimeState,
      );
      await remoteConfig.load(namespace, contexts[0]);

      await main(soloConsensusNodeUpgradeArgv(options));

      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

      {
        // copy the version.txt file from the pod data/upgrade/current directory
        const temporaryDirectory: string = getTemporaryDirectory();
        const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);

        const containerReference: Container = k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER));

        await containerReference.copyFrom(`${HEDERA_HAPI_PATH}/VERSION`, temporaryDirectory);
        const versionFile: string = fs.readFileSync(`${temporaryDirectory}/VERSION`, 'utf8');

        const versionLine: string = versionFile.split('\n', 1)[0].trim();
        expect(versionLine).to.equal(`VERSION=${TEST_UPGRADE_TO_VERSION.replace('v', '')}`);
      }

      {
        const zipFile: string = 'upgrade.zip';
        const cacheDirectory: string = getTestCacheDirectory(testName);

        // Remove the staging directory to make sure the command works if it doesn't exist
        const stagingDirectory: string = Templates.renderStagingDir(cacheDirectory, HEDERA_PLATFORM_VERSION_TAG);
        fs.rmSync(stagingDirectory, {recursive: true, force: true});

        // Download application.properties from the pod
        const temporaryDirectory: string = getTemporaryDirectory();
        const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
        const container: Container = k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER));
        await container.copyFrom(
          `${HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`,
          temporaryDirectory,
        );

        const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);
        const applicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');
        const updatedContent: string = applicationProperties.replaceAll(
          'contracts.chainId=298',
          'contracts.chainId=299',
        );

        fs.writeFileSync(applicationPropertiesPath, updatedContent);

        // create upgrade.zip file from tmp directory using zippy.ts
        const zipper: Zippy = new Zippy(logger);
        await zipper.zip(temporaryDirectory, zipFile);

        await main(soloConsensusNodeUpgradeArgv(options, zipFile));

        const modifiedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

        await container.copyFrom(
          `${HEDERA_HAPI_PATH}/data/upgrade/current/${constants.APPLICATION_PROPERTIES}`,
          temporaryDirectory,
        );
        const upgradedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

        expect(modifiedApplicationProperties.trimEnd()).to.equal(upgradedApplicationProperties.trimEnd());
      }

      {
        const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
        const response: string = await container
          .resolve<NetworkNodes>(InjectTokens.NetworkNodes)
          .getNetworkNodePodStatus(PodReference.of(namespace, pods[0].podReference.name));

        expect(response).to.not.be.undefined;

        const statusLine: string = response
          .split('\n')
          .find((line): boolean => line.startsWith('platform_PlatformStatus'));

        expect(statusLine).to.not.be.undefined;
        const statusNumber: number = Number.parseInt(statusLine.split(' ').pop());
        expect(statusNumber).to.equal(NodeStatusCodes.ACTIVE, 'All network nodes are running');
      }

      const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);

      await queryBalance(accountManager, namespace, remoteConfig, logger);

      await createAccount(accountManager, namespace, remoteConfig, logger);

      const accountInfo1: AccountInfo = await new AccountInfoQuery()
        .setAccountId(new AccountId(shard, realm, 1001))
        .execute(accountManager._nodeClient);
      expect(accountInfo1).not.to.be.null;

      const accountInfo2: AccountInfo = await new AccountInfoQuery()
        .setAccountId(new AccountId(shard, realm, 1002))
        .execute(accountManager._nodeClient);
      expect(accountInfo2).not.to.be.null;
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static upgradeConfigs(options: BaseTestOptions): void {
    const {testName, namespace, contexts} = options;
    const {soloConsensusNodeUpgradeArgv} = ConsensusNodeTest;
    const temporaryDirectory: string = getTemporaryDirectory();

    it(`${testName}: consensus node upgrade [upgrade configs]`, async (): Promise<void> => {
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      await localConfig.load();

      const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
        InjectTokens.RemoteConfigRuntimeState,
      );
      await remoteConfig.load(namespace, contexts[0]);

      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);

      const containerReference: Container = k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER));

      const applicationPropertiesFilePath: string = `${constants.HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`;

      // prepare temporary application.properties to utilize for argv
      await containerReference.copyFrom(applicationPropertiesFilePath, temporaryDirectory);

      const testApplicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);

      const applicationProperties: string = fs.readFileSync(testApplicationPropertiesPath, 'utf8');

      const updatedContent: string = applicationProperties.replaceAll('contracts.chainId=298', 'contracts.chainId=299');

      fs.writeFileSync(testApplicationPropertiesPath, updatedContent);

      // Set the consensus node version in remote config to TEST_UPGRADE_FROM_VERSION
      // so the downgrade guard allows upgrading to TEST_UPGRADE_TO_VERSION (which must be newer).
      remoteConfig.configuration.versions.consensusNode = new SemanticVersion<string>(TEST_UPGRADE_FROM_VERSION);
      await remoteConfig.persist();

      await main(soloConsensusNodeUpgradeArgv(options, undefined, testApplicationPropertiesPath));

      await containerReference.copyFrom(applicationPropertiesFilePath, temporaryDirectory);

      const upgradedApplicationProperties: string = fs.readFileSync(testApplicationPropertiesPath, 'utf8');

      expect(updatedContent.trimEnd()).to.equal(upgradedApplicationProperties.trimEnd());
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName} = options;
    const {soloConsensusNodeDestroyArgv} = ConsensusNodeTest;

    it(`${testName}: consensus node destroy`, async (): Promise<void> => {
      await main(soloConsensusNodeDestroyArgv(options));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static async refresh(options: BaseTestOptions): Promise<void> {
    const {soloConsensusNodeRefreshArgv} = ConsensusNodeTest;

    await main(soloConsensusNodeRefreshArgv(options));

    await sleep(Duration.ofSeconds(15)); // sleep to wait for node to finish starting
  }

  private static async verifyPodShouldBeRunning(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    context?: Context,
  ): Promise<void> {
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();

    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace, context);

    const podName: string = await container
      .resolve(NodeCommandTasks)
      // @ts-expect-error - TS2341: to access private property
      .checkNetworkNodePod(namespace, nodeAlias)
      .then((pod): string => pod.name.toString());

    expect(podName).to.equal(`network-${nodeAlias}-0`);
  }

  private static async verifyPodShouldNotBeActive(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    context: Context,
  ): Promise<void> {
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();

    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace, context);

    await expect(
      container
        .resolve(NodeCommandTasks)
        .checkNetworkNodeActiveness(
          namespace,
          nodeAlias,
          {title: ''} as SoloListrTaskWrapper<AnyListrContext>,
          '',
          undefined,
          15,
        ),
    ).to.be.rejected;
  }

  public static PemKill(options: BaseTestOptions): void {
    const {namespace, testName, testLogger, consensusNodesCount} = options;
    const {checkNetwork, soloConsensusNodeStopArgv, refresh, verifyPodShouldBeRunning} = ConsensusNodeTest;

    const nodeAlias: NodeAlias = 'node2';

    it(`${testName}: perform PEM kill`, async (): Promise<void> => {
      // Determine which cluster node2 belongs to based on the distribution formula.
      const clusterIndex: number = ConsensusNodeTest.clusterIndexForNodeNumber(2, consensusNodesCount);
      const context: ClusterReferenceName = [...options.clusterReferences.values()][clusterIndex];

      const pods: Pod[] = await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(context)
        .pods()
        .list(namespace, ['solo.hedera.com/type=network-node', `solo.hedera.com/node-name=${nodeAlias}`]);

      await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(context)
        .pods()
        .readByReference(pods[0].podReference)
        .killPod();

      testLogger.showUser('Sleeping for 20 seconds');
      await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs

      await verifyPodShouldBeRunning(namespace, nodeAlias, context);
      // With autostart enabled (0.44.0+), killing a pod causes the platform to
      // auto-restart via the network-node-autostart oneshot when the pod comes back.
      // Stop it explicitly so we can do a controlled Solo-managed refresh below.
      await main(soloConsensusNodeStopArgv(options, nodeAlias));

      await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs

      await refresh(options);

      await checkNetwork(testName, namespace, testLogger);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static PemStop(options: BaseTestOptions): void {
    const {namespace, testName, testLogger, consensusNodesCount, deployment, contexts} = options;
    const {
      checkNetwork,
      refresh,
      verifyPodShouldNotBeActive,
      verifyPodShouldBeRunning,
      soloNodeStartArgv,
      soloConsensusNodeStopArgv,
    } = ConsensusNodeTest;

    const nodeAlias: NodeAlias = 'node2';

    it(`${testName}: perform PEM stop`, async (): Promise<void> => {
      await main(soloConsensusNodeStopArgv(options, nodeAlias));

      await sleep(Duration.ofSeconds(30)); // give time for node to stop and update its logs

      // Only check the stopped node's status on its own cluster context.
      // With N >= 3 nodes the remaining nodes retain quorum and stay ACTIVE.
      const clusterIndex: number = ConsensusNodeTest.clusterIndexForNodeNumber(2, consensusNodesCount);
      const node2Context: string | undefined = contexts ? contexts[clusterIndex] : undefined;
      await verifyPodShouldBeRunning(namespace, nodeAlias, node2Context);
      await verifyPodShouldNotBeActive(namespace, nodeAlias, node2Context);

      await refresh(options);

      await checkNetwork(testName, namespace, testLogger);

      await main(soloNodeStartArgv(testName, deployment, consensusNodesCount, undefined, false));
      testLogger.showUser('Sleeping for 20 seconds');
      await sleep(Duration.ofSeconds(20));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  private static async checkNetwork(testName: string, namespace: NamespaceName, logger: SoloLogger): Promise<void> {
    const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace);

    await queryBalance(accountManager, namespace, remoteConfig, logger);
    await createAccount(accountManager, namespace, remoteConfig, logger);
  }

  // TODO: I think this should be used, but it isn't being called
  public static connections(options: BaseTestOptions): void {
    const {testName} = options;
    const {soloDeploymentDiagnosticsConnectionsArgv} = ConsensusNodeTest;

    it(`${testName}: deployment diagnostics connections`, async (): Promise<void> => {
      await main(soloDeploymentDiagnosticsConnectionsArgv(options));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static soloConsensusNetworkDestroyArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.deletePvcs),
      optionFromFlag(Flags.deleteSecrets),
      optionFromFlag(Flags.force),
    );

    return argv;
  }

  public static soloConsensusNetworkFreezeArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_FREEZE,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    return argv;
  }

  public static soloConsensusStateDownloadArgv(deployment: string, nodeAliasesUnparsed: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.STATE_DOWNLOAD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliasesUnparsed,
    );

    return argv;
  }

  public static soloConsensusNodeRestartArgv(deployment: string, nodeAliasesUnparsed?: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_RESTART,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    if (nodeAliasesUnparsed) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAliasesUnparsed);
    }

    return argv;
  }
}
