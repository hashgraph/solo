/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../test_util.js';
import {sleep} from '../../../src/core/helpers.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import path from 'path';
import {expect} from 'chai';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hashgraph/sdk';
import {Duration} from '../../../src/core/time/duration.js';
import {type NodeCommand} from '../../../src/commands/node/index.js';
import {type AccountCommand} from '../../../src/commands/account.js';
import {type AccountManager} from '../../../src/core/account_manager.js';
import {LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const namespace = NamespaceName.of('local-hedera-app');
const argv = getDefaultArgv(namespace);
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterRef.name] = TEST_CLUSTER;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.quiet.name] = true;

let k8Factory: K8Factory;
console.log('Starting local build for Hedera app');
argv[flags.localBuildPath.name] = 'node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data';
argv[flags.namespace.name] = namespace.name;
argv[flags.releaseTag.name] = LOCAL_HEDERA_PLATFORM_VERSION;

e2eTestSuite(
  namespace.name,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  true,
  bootstrapResp => {
    describe('Node for hedera app should have started successfully', () => {
      let nodeCmd: NodeCommand;
      let accountCmd: AccountCommand;
      let accountManager: AccountManager;

      before(() => {
        nodeCmd = bootstrapResp.cmd.nodeCmd;
        accountCmd = bootstrapResp.cmd.accountCmd;
        accountManager = bootstrapResp.manager.accountManager;
        k8Factory = bootstrapResp.opts.k8Factory;
      });

      it('save the state and restart the node with saved state', async () => {
        // create an account so later we can verify its balance after restart
        await accountManager.loadNodeClient(namespace);
        const privateKey = PrivateKey.generate();
        // get random integer between 100 and 1000
        const amount = Math.floor(Math.random() * (1000 - 100) + 100);

        const newAccount = await new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
          .execute(accountManager._nodeClient);

        // Get the new account ID
        const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
        const accountInfo = {
          accountId: getReceipt.accountId.toString(),
          balance: amount,
        };

        // create more transactions to save more round of states
        await accountCmd.create(argv);
        await sleep(Duration.ofMillis(3));
        await accountCmd.create(argv);
        await sleep(Duration.ofMillis(3));

        // stop network and save the state
        await nodeCmd.handlers.stop(argv);
        await nodeCmd.handlers.states(argv);

        argv[flags.stateFile.name] = path.join(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip');
        await nodeCmd.handlers.start(argv);

        // check balance of accountInfo.accountId
        await accountManager.loadNodeClient(namespace);
        const balance = await new AccountBalanceQuery()
          .setAccountId(accountInfo.accountId)
          .execute(accountManager._nodeClient);

        expect(balance.hbars).to.be.eql(Hbar.from(accountInfo.balance, HbarUnit.Hbar));
      }).timeout(Duration.ofMinutes(10).toMillis());

      it('get the logs and delete the namespace', async () => {
        await accountManager.close();
        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await k8Factory.default().namespaces().delete(namespace);
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  },
);
