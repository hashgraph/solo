/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  Logger,
  LogLevel,
  PrivateKey,
  Status,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {e2eTestSuite, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER, testLogger} from '../../test_util.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import {type AccountManager} from '../../../src/core/account_manager.js';
import {type ConfigManager} from '../../../src/core/config_manager.js';
import {type NodeCommand} from '../../../src/commands/node/index.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const testName = 'account-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const testSystemAccounts = [[3, 5]];
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace.name;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterRef.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;

e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('AccountCommand', async () => {
    let accountCmd: AccountCommand;
    let k8Factory: K8Factory;
    let accountManager: AccountManager;
    let configManager: ConfigManager;
    let nodeCmd: NodeCommand;

    before(() => {
      accountCmd = new AccountCommand(bootstrapResp.opts, testSystemAccounts);
      bootstrapResp.cmd.accountCmd = accountCmd;
      k8Factory = bootstrapResp.opts.k8Factory;
      accountManager = bootstrapResp.opts.accountManager;
      configManager = bootstrapResp.opts.configManager;
      nodeCmd = bootstrapResp.cmd.nodeCmd;
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
      await nodeCmd.close();
    });

    describe('node proxies should be UP', () => {
      for (const nodeAlias of argv[flags.nodeAliasesUnparsed.name].split(',')) {
        it(`proxy should be UP: ${nodeAlias} `, async () => {
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

    describe('account init command', () => {
      it('should succeed with init command', async () => {
        const status = await accountCmd.init(argv);
        expect(status).to.be.ok;
      }).timeout(Duration.ofMinutes(3).toMillis());

      describe('special accounts should have new keys', () => {
        const genesisKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm;
        const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard;

        before(async function () {
          this.timeout(Duration.ofSeconds(20).toMillis());
          await accountManager.loadNodeClient(namespace);
        });

        after(async function () {
          this.timeout(Duration.ofSeconds(20).toMillis());
          await accountManager.close();
        });

        for (const [start, end] of testSystemAccounts) {
          for (let i = start; i <= end; i++) {
            it(`account ${i} should not have genesis key`, async () => {
              expect(accountManager._nodeClient).not.to.be.null;

              const accountId = `${realm}.${shard}.${i}`;
              nodeCmd.logger.info(`Fetching account keys: accountId ${accountId}`);
              const keys = await accountManager.getAccountKeys(accountId);
              nodeCmd.logger.info(`Fetched account keys: accountId ${accountId}`);

              expect(keys.length).not.to.equal(0);
              expect(keys[0].toString()).not.to.equal(genesisKey.toString());
            }).timeout(Duration.ofSeconds(20).toMillis());
          }
        }
      });
    });

    describe('account create/update command', () => {
      let accountId1: string, accountId2: string;

      it('should create account with no options', async () => {
        try {
          argv[flags.amount.name] = 200;
          expect(await accountCmd.create(argv)).to.be.true;

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;

          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;

          accountId1 = accountInfo.accountId;

          expect(accountInfo.privateKey).not.to.be.null;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(Duration.ofSeconds(40).toMillis());

      it('should create account with private key and hbar amount options', async () => {
        try {
          argv[flags.ed25519PrivateKey.name] = constants.GENESIS_KEY;
          argv[flags.amount.name] = 777;
          configManager.update(argv);

          expect(await accountCmd.create(argv)).to.be.true;

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;
          accountId2 = accountInfo.accountId;
          expect(accountInfo.privateKey.toString()).to.equal(constants.GENESIS_KEY);
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-1', async () => {
        try {
          argv[flags.amount.name] = 0;
          argv[flags.accountId.name] = accountId1;
          configManager.update(argv);

          expect(await accountCmd.update(argv)).to.be.true;

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name]);
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(200);
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-2 with accountId, amount, new private key, and standard out options', async () => {
        try {
          argv[flags.accountId.name] = accountId2;
          argv[flags.ed25519PrivateKey.name] = constants.GENESIS_KEY;
          argv[flags.amount.name] = 333;
          configManager.update(argv);

          expect(await accountCmd.update(argv)).to.be.true;

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name]);
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(1_110);
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-1', async () => {
        try {
          argv[flags.accountId.name] = accountId1;
          configManager.update(argv);

          expect(await accountCmd.get(argv)).to.be.true;
          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name]);
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(200);
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-2', async () => {
        try {
          argv[flags.accountId.name] = accountId2;
          configManager.update(argv);

          expect(await accountCmd.get(argv)).to.be.true;
          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name]);
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(1_110);
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should create account with ecdsa private key and set alias', async () => {
        const ecdsaPrivateKey = PrivateKey.generateECDSA();

        try {
          argv[flags.ecdsaPrivateKey.name] = ecdsaPrivateKey.toString();
          argv[flags.setAlias.name] = true;
          configManager.update(argv);

          expect(await accountCmd.create(argv)).to.be.true;

          // @ts-ignore to access the private property
          const newAccountInfo = accountCmd.accountInfo;
          expect(newAccountInfo).not.to.be.null;
          expect(newAccountInfo.accountId).not.to.be.null;
          expect(newAccountInfo.privateKey.toString()).to.equal(ecdsaPrivateKey.toString());
          expect(newAccountInfo.publicKey.toString()).to.equal(ecdsaPrivateKey.publicKey.toString());
          expect(newAccountInfo.balance).to.be.greaterThan(0);

          const accountId = AccountId.fromString(newAccountInfo.accountId);
          expect(newAccountInfo.accountAlias).to.equal(
            `${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`,
          );

          await accountManager.loadNodeClient(namespace);
          const accountAliasInfo = await accountManager.accountInfoQuery(newAccountInfo.accountAlias);
          expect(accountAliasInfo).not.to.be.null;
        } catch (e) {
          testLogger.showUserError(e);
          expect.fail();
        }
      }).timeout(defaultTimeout);
    });

    describe('Test SDK create account and submit transaction', () => {
      const accountManager = bootstrapResp.opts.accountManager;
      const networkCmd = bootstrapResp.cmd.networkCmd;

      let accountInfo: {
        accountId: string;
        privateKey: string;
        publicKey: string;
        balance: number;
      };

      let MY_ACCOUNT_ID: string;
      let MY_PRIVATE_KEY: string;

      it('Create new account', async () => {
        try {
          await accountManager.loadNodeClient(namespace);
          const privateKey = PrivateKey.generate();
          const amount = 100;

          const newAccount = await new AccountCreateTransaction()
            .setKey(privateKey)
            .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
            .execute(accountManager._nodeClient);

          // Get the new account ID
          const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
          accountInfo = {
            accountId: getReceipt.accountId.toString(),
            privateKey: privateKey.toString(),
            publicKey: privateKey.publicKey.toString(),
            balance: amount,
          };

          MY_ACCOUNT_ID = accountInfo.accountId;
          MY_PRIVATE_KEY = accountInfo.privateKey;

          networkCmd.logger.info(`Account created: ${JSON.stringify(accountInfo)}`);
          expect(accountInfo.accountId).not.to.be.null;
          expect(accountInfo.balance).to.equal(amount);
        } catch (e) {
          networkCmd.logger.showUserError(e);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Create client from network config and submit topic/message should succeed', async () => {
        try {
          // Setup network configuration
          const networkConfig = {};
          networkConfig['127.0.0.1:30212'] = AccountId.fromString('0.0.3');
          networkConfig['127.0.0.1:30213'] = AccountId.fromString('0.0.4');

          // Instantiate SDK client
          const sdkClient = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
          sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
          sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));

          // Create a new public topic and submit a message
          const txResponse = await new TopicCreateTransaction().execute(sdkClient);
          const receipt = await txResponse.getReceipt(sdkClient);

          const submitResponse = await new TopicMessageSubmitTransaction({
            topicId: receipt.topicId,
            message: 'Hello, Hedera!',
          }).execute(sdkClient);

          const submitReceipt = await submitResponse.getReceipt(sdkClient);

          expect(submitReceipt.status).to.deep.equal(Status.Success);
        } catch (e) {
          networkCmd.logger.showUserError(e);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());
    });
  });
});
