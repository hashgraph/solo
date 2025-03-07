/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, TEST_CLUSTER} from '../../test_util.js';
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
import {type ClusterRefs, type DeploymentName} from '../../../src/core/config/remote/types.js';
import {Argv} from '../../helpers/argv_wrapper.js';

const namespace = NamespaceName.of('local-hedera-app');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, TEST_CLUSTER);
argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
argv.setArg(flags.quiet, true);

let k8Factory: K8Factory;
console.log('Starting local build for Hedera app');
argv.setArg(flags.localBuildPath, 'node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data');
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, LOCAL_HEDERA_PLATFORM_VERSION);

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
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
      const clusterRefs: ClusterRefs = nodeCmd.getRemoteConfigManager().getClusterRefs();
      await accountManager.loadNodeClient(
        namespace,
        clusterRefs,
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
      await accountCmd.create(argv.build());
      await sleep(Duration.ofMillis(3));
      await accountCmd.create(argv.build());
      await sleep(Duration.ofMillis(3));

      // stop network and save the state
      await nodeCmd.handlers.stop(argv.build());
      await nodeCmd.handlers.states(argv.build());

      argv.setArg(flags.stateFile, path.join(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip'));
      await nodeCmd.handlers.start(argv.build());

      // check balance of accountInfo.accountId
      await accountManager.loadNodeClient(
        namespace,
        clusterRefs,
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
