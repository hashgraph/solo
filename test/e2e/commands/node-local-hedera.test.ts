// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getTestCluster} from '../../test-util.js';
import {sleep} from '../../../src/core/helpers.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import path from 'path';
import {expect} from 'chai';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hashgraph/sdk';
import {Duration} from '../../../src/core/time/duration.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../../../version-test.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type DeploymentName} from '../../../src/core/config/remote/types.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {NodeCommand} from '../../../src/commands/node/index.js';

const namespace = NamespaceName.of('local-hedera-app');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());

console.log('Starting local build for Hedera app');
argv.setArg(
  flags.localBuildPath,
  'node1=../hiero-consensus-node/hedera-node/data/,../hiero-consensus-node/hedera-node/data',
);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, TEST_LOCAL_HEDERA_PLATFORM_VERSION);

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node for hedera app should have started successfully', () => {
    const {
      opts: {k8Factory, commandInvoker, remoteConfigManager},
      cmd: {nodeCmd, accountCmd},
      manager: {accountManager},
    } = bootstrapResp;

    it('save the state and restart the node with saved state', async () => {
      // create an account so later we can verify its balance after restart
      await accountManager.loadNodeClient(
        namespace,
        remoteConfigManager.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );
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
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'create',
        callback: async argv => accountCmd.create(argv),
      });

      await sleep(Duration.ofMillis(3));

      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'create',
        callback: async argv => accountCmd.create(argv),
      });

      await sleep(Duration.ofMillis(3));

      // stop network and save the state
      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'stop',
        callback: async argv => nodeCmd.handlers.stop(argv),
      });

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'states',
        callback: async argv => nodeCmd.handlers.states(argv),
      });

      argv.setArg(flags.stateFile, path.join(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip'));

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'start',
        callback: async argv => nodeCmd.handlers.start(argv),
      });

      // check balance of accountInfo.accountId
      await accountManager.loadNodeClient(
        namespace,
        remoteConfigManager.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

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
});
