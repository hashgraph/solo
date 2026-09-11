// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

import {
  AccountCreateTransaction,
  AccountId,
  type AccountInfo,
  Client,
  Hbar,
  HbarUnit,
  type Key,
  Logger,
  LogLevel,
  PrivateKey,
  Status,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {
  type BootstrapResponse,
  endToEndTestSuite,
  getTestCluster,
  getTestLogger,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {entityId, Helpers} from '../../../src/core/helpers.js';
import {Templates} from '../../../src/core/templates.js';
import * as Base64 from 'js-base64';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DeploymentName, type Realm, type Shard} from '../../../src/types/index.js';
import {type NodeAliases} from '../../../src/types/aliases.js';
import {type Secret} from '../../../src/integration/kube/resources/secret/secret.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

type AccountInfoResult = {
  accountId: string;
  balance: number;
  publicKey: string;
  privateKey?: string;
  accountAlias?: string;
};

const defaultTimeout: number = Duration.ofSeconds(20).toMillis();

const testName: string = 'account-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const testSystemAccounts: number[][] = [[3, 5]];
const argv: Argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.consensusNodeVersion, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.realm, 0);
argv.setArg(flags.shard, 0);

// enable load balancer for e2e tests
// argv.setArg(flags.loadBalancerEnabled, true);

const overrides: InstanceOverrides = new Map<symbol, ValueContainer>([
  [InjectTokens.SystemAccounts, new ValueContainer(InjectTokens.SystemAccounts, testSystemAccounts)],
]);

endToEndTestSuite(testName, argv, {containerOverrides: overrides}, (bootstrapResp: BootstrapResponse): void => {
  describe('AccountCommand', (): void => {
    let accountCmd: AccountCommand;
    let testLogger: SoloLogger;

    const {
      opts: {k8Factory, accountManager, configManager, commandInvoker, remoteConfig},
      cmd: {nodeCmd},
    } = bootstrapResp;

    before(async (): Promise<void> => {
      accountCmd = container.resolve(AccountCommand) as AccountCommand;
      bootstrapResp.cmd.accountCmd = accountCmd;
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      await localConfig.load();
      testLogger = getTestLogger();
    });

    after(async (): Promise<void> => {
      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
      await nodeCmd.close();
    }).timeout(Duration.ofMinutes(3).toMillis());

    describe('node proxies should be UP', (): void => {
      for (const nodeAlias of argv.getArg<string>(flags.nodeAliasesUnparsed).split(',')) {
        it(`proxy should be UP: ${nodeAlias} `, async (): Promise<void> => {
          await k8Factory
            .default()
            .pods()
            .waitForReadyStatus(
              namespace,
              [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
              300,
              Duration.ofSeconds(2).toMillis(),
            );
        }).timeout(Duration.ofSeconds(30).toMillis());
      }
    });

    describe('ledger system init command', (): void => {
      it('should succeed with init command', async (): Promise<void> => {
        await commandInvoker.invoke({
          argv: argv,
          command: LedgerCommandDefinition.COMMAND_NAME,
          subcommand: LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
          action: LedgerCommandDefinition.SYSTEM_INIT,
          callback: async (argv): Promise<boolean> => accountCmd.init(argv),
        });
      }).timeout(Duration.ofMinutes(8).toMillis());

      describe('special accounts should have new keys', (): void => {
        const genesisKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        const realm: Realm = argv.getArg(flags.realm);
        const shard: Shard = argv.getArg(flags.shard);

        before(async (): Promise<void> => {
          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
        }).timeout(Duration.ofSeconds(20).toMillis());

        after(async (): Promise<void> => {
          await accountManager.close();
        }).timeout(Duration.ofSeconds(20).toMillis());

        it('Node admin key should have been updated, not equal to genesis key', async (): Promise<void> => {
          const nodeAliases: NodeAliases = Helpers.parseNodeAliases(
            argv.getArg<string>(flags.nodeAliasesUnparsed),
            bootstrapResp.opts.remoteConfig.getConsensusNodes(),
            bootstrapResp.opts.configManager,
          );
          for (const nodeAlias of nodeAliases) {
            const keyFromK8: Secret = await k8Factory
              .default()
              .secrets()
              .read(namespace, Templates.renderNodeAdminKeyName(nodeAlias));
            const privateKey: string = Base64.decode(keyFromK8.data.privateKey);

            expect(privateKey.toString()).not.to.equal(genesisKey.toString());
          }
        });

        for (const [start, end] of testSystemAccounts) {
          for (let index: number = start; index <= end; index++) {
            it(`account ${index} should not have genesis key`, async (): Promise<void> => {
              expect(accountManager._nodeClient).not.to.be.undefined;

              const accountId: string = entityId(shard, realm, index);
              testLogger.info(`Fetching account keys: accountId ${accountId}`);
              const keys: Key[] = await accountManager.getAccountKeys(accountId);
              testLogger.info(`Fetched account keys: accountId ${accountId}`);

              expect(keys.length).not.to.equal(0);
              expect(keys[0].toString()).not.to.equal(genesisKey.toString());
            }).timeout(Duration.ofSeconds(20).toMillis());
          }
        }
      });
    });

    describe('ledger account create/update command', (): void => {
      let accountId1: string, accountId2: string;

      it('should create account with no options', async (): Promise<void> => {
        try {
          argv.setArg(flags.amount, 200);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_CREATE,
            callback: async (argv): Promise<boolean> => accountCmd.create(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;

          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;

          accountId1 = accountInfo.accountId;

          expect(accountInfo.privateKey).not.to.be.null;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(Duration.ofSeconds(40).toMillis());

      it('should create account with private key and hbar amount options', async (): Promise<void> => {
        try {
          argv.setArg(flags.ed25519PrivateKey, constants.GENESIS_KEY);
          argv.setArg(flags.amount, 777);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_CREATE,
            callback: async (argv): Promise<boolean> => accountCmd.create(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;
          accountId2 = accountInfo.accountId;
          expect(accountInfo.privateKey.toString()).to.equal(constants.GENESIS_KEY);
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-1', async (): Promise<void> => {
        try {
          argv.setArg(flags.amount, 0);
          argv.setArg(flags.accountId, accountId1);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_UPDATE,
            callback: async (argv): Promise<boolean> => accountCmd.update(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(200);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-2 with accountId, amount, new private key, and standard out options', async (): Promise<void> => {
        try {
          argv.setArg(flags.accountId, accountId2);
          argv.setArg(flags.ed25519PrivateKey, constants.GENESIS_KEY);
          argv.setArg(flags.amount, 333);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_UPDATE,
            callback: async (argv): Promise<boolean> => accountCmd.update(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(1110);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-1', async (): Promise<void> => {
        try {
          argv.setArg(flags.accountId, accountId1);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_INFO,
            callback: async (argv): Promise<boolean> => accountCmd.get(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(200);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-2', async (): Promise<void> => {
        try {
          argv.setArg(flags.accountId, accountId2);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_INFO,
            callback: async (argv): Promise<boolean> => accountCmd.get(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const accountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(1110);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should create account with ecdsa private key and set alias', async (): Promise<void> => {
        const ecdsaPrivateKey: PrivateKey = PrivateKey.generateECDSA();

        try {
          argv.setArg(flags.ecdsaPrivateKey, ecdsaPrivateKey.toString());
          argv.setArg(flags.setAlias, true);

          await commandInvoker.invoke({
            argv: argv,
            command: LedgerCommandDefinition.COMMAND_NAME,
            subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            action: LedgerCommandDefinition.ACCOUNT_CREATE,
            callback: async (argv): Promise<boolean> => accountCmd.create(argv),
          });

          // @ts-expect-error - TS2341: to access private property
          const newAccountInfo: AccountInfoResult = accountCmd.accountInfo;
          expect(newAccountInfo).not.to.be.null;
          expect(newAccountInfo.accountId).not.to.be.null;
          expect(newAccountInfo.privateKey.toString()).to.equal(ecdsaPrivateKey.toString());
          expect(newAccountInfo.publicKey.toString()).to.equal(ecdsaPrivateKey.publicKey.toString());
          expect(newAccountInfo.balance).to.be.greaterThan(0);

          const accountId: AccountId = AccountId.fromString(newAccountInfo.accountId);
          expect(newAccountInfo.accountAlias).to.equal(
            `${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`,
          );

          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
          const accountAliasInfo: AccountInfo = await accountManager.accountInfoQuery(newAccountInfo.accountAlias);
          expect(accountAliasInfo).not.to.be.null;
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);
    });

    describe('Test SDK create account and submit transaction', (): void => {
      let accountInfo: {
        accountId: string;
        privateKey: string;
        publicKey: string;
        balance: number;
      };

      let MY_ACCOUNT_ID: string;
      let MY_PRIVATE_KEY: string;

      it('Create new account', async (): Promise<void> => {
        try {
          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
          const privateKey: PrivateKey = PrivateKey.generate();
          const amount: number = 100;

          const newAccount: TransactionResponse = await new AccountCreateTransaction()
            .setKey(privateKey)
            .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
            .execute(accountManager._nodeClient);

          // Get the new account ID
          const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
          accountInfo = {
            accountId: getReceipt.accountId.toString(),
            privateKey: privateKey.toString(),
            publicKey: privateKey.publicKey.toString(),
            balance: amount,
          };

          MY_ACCOUNT_ID = accountInfo.accountId;
          MY_PRIVATE_KEY = accountInfo.privateKey;

          testLogger.info(`Account created: ${JSON.stringify(accountInfo)}`);
          expect(accountInfo.accountId).not.to.be.null;
          expect(accountInfo.balance).to.equal(amount);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Create client from network config and submit topic/message should succeed', async (): Promise<void> => {
        const maxSubmitAttempts: number = 3;
        let submitReceipt: TransactionReceipt | undefined;
        let lastError: unknown;

        for (let attempt: number = 1; attempt <= maxSubmitAttempts && !submitReceipt; attempt++) {
          let sdkClient: Client | undefined;
          try {
            await accountManager.refreshNodeClient(
              namespace,
              remoteConfig.getClusterRefs(),
              argv.getArg<DeploymentName>(flags.deployment),
              argv.getArg<boolean>(flags.forcePortForward),
            );
            const clientNetwork: Record<string, string | AccountId> = accountManager._nodeClient.network;
            const networkConfig: Record<string, AccountId> = {};
            for (const endpoint of Object.keys(clientNetwork)) {
              networkConfig[endpoint] = AccountId.fromString(clientNetwork[endpoint].toString());
            }

            // Instantiate SDK client
            sdkClient = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
            sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
            sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));
            sdkClient.setMaxAttempts(constants.NODE_CLIENT_MAX_ATTEMPTS);
            sdkClient.setMinBackoff(constants.NODE_CLIENT_MIN_BACKOFF);
            sdkClient.setMaxBackoff(constants.NODE_CLIENT_MAX_BACKOFF);
            sdkClient.setRequestTimeout(Duration.ofMinutes(1).toMillis());

            // Create a new public topic and submit a message
            const txResponse: TransactionResponse = await new TopicCreateTransaction().execute(sdkClient);
            const receipt: TransactionReceipt = await txResponse.getReceipt(sdkClient);

            const submitResponse: TransactionResponse = await new TopicMessageSubmitTransaction({
              topicId: receipt.topicId,
              message: 'Hello, Hedera!',
            }).execute(sdkClient);

            submitReceipt = await submitResponse.getReceipt(sdkClient);
          } catch (error) {
            lastError = error;
            testLogger.showUserError(error);
          } finally {
            sdkClient?.close();
          }
        }

        if (!submitReceipt) {
          testLogger.showUserError(lastError);
          expect.fail(`topic message submit failed after ${maxSubmitAttempts} attempts`);
        }
        expect(submitReceipt.status).to.deep.equal(Status.Success);
      }).timeout(Duration.ofMinutes(5).toMillis());

      it('Enable Envoy proxy port forwarding and create client from network config should succeed', async (): Promise<void> => {
        try {
          // using label `app=envoy-proxy-node1` to find Envoy proxy pod
          const envoyProxyPod: Pod[] = await k8Factory.default().pods().list(namespace, ['app=envoy-proxy-node1']);
          // enable portfroward of Envoy proxy pod
          const portNumber: number = await k8Factory
            .default()
            .pods()
            .readByReference(envoyProxyPod[0].podReference)
            .portForward(10_500, 8080);

          // Setup network configuration
          const networkConfig: Record<string, AccountId> = {['127.0.0.1:10500']: AccountId.fromString('0.0.3')};

          // Instantiate SDK client
          const sdkClient: Client = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
          sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

          // Create a new public topic and submit a message
          const txResponse: TransactionResponse = await new TopicCreateTransaction().execute(sdkClient);
          const receipt: TransactionReceipt = await txResponse.getReceipt(sdkClient);

          const submitResponse: TransactionResponse = await new TopicMessageSubmitTransaction({
            topicId: receipt.topicId,
            message: 'Hello, Hedera!',
          }).execute(sdkClient);

          const submitReceipt: TransactionReceipt = await submitResponse.getReceipt(sdkClient);

          expect(submitReceipt.status).to.deep.equal(Status.Success);

          // stop port forwarding
          await k8Factory.default().pods().readByReference(envoyProxyPod[0].podReference).stopPortForward(portNumber);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      // hitchhiker account test to test node freeze and restart
      it('Freeze and restart all nodes should succeed', async (): Promise<void> => {
        try {
          await commandInvoker.invoke({
            argv: argv,
            command: ConsensusCommandDefinition.COMMAND_NAME,
            subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            action: ConsensusCommandDefinition.NETWORK_FREEZE,
            callback: async (argv): Promise<boolean> => nodeCmd.handlers.freeze(argv),
          });

          await commandInvoker.invoke({
            argv: argv,
            command: ConsensusCommandDefinition.COMMAND_NAME,
            subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
            action: ConsensusCommandDefinition.NODE_RESTART,
            callback: async (argv): Promise<boolean> => nodeCmd.handlers.restart(argv),
          });
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  });
});
