/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {describe} from 'mocha';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, TEST_CLUSTER} from '../../test_util.js';
import {sleep} from '../../../src/core/helpers.js';
import {MINUTES, SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {type K8} from '../../../src/core/k8.js';
import path from 'path';
import {expect} from 'chai';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hashgraph/sdk';

const LOCAL_HEDERA = 'local-hedera-app';
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.quiet.name] = true;

let hederaK8: K8;
console.log('Starting local build for Hedera app');
argv[flags.localBuildPath.name] =
  'node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node3=../hedera-services/hedera-node/data';
argv[flags.namespace.name] = LOCAL_HEDERA;

e2eTestSuite(
  LOCAL_HEDERA,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  true,
  bootstrapResp => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const accountManager = bootstrapResp.manager.accountManager;
    describe('Node for hedera app should have started successfully', () => {
      hederaK8 = bootstrapResp.opts.k8;

      it('save the state and restart the node with saved state', async () => {
        // create an account so later we can verify its balance after restart
        await accountManager.loadNodeClient(LOCAL_HEDERA);
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
        await sleep(3);
        await accountCmd.create(argv);
        await sleep(3);

        // stop network and save the state
        await nodeCmd.handlers.stop(argv);
        await nodeCmd.handlers.states(argv);

        argv[flags.stateFile.name] = path.join(SOLO_LOGS_DIR, LOCAL_HEDERA, 'network-node1-0-state.zip');
        await nodeCmd.handlers.start(argv);

        // check balance of accountInfo.accountId
        await accountManager.loadNodeClient(LOCAL_HEDERA);
        const balance = await new AccountBalanceQuery()
          .setAccountId(accountInfo.accountId)
          .execute(accountManager._nodeClient);

        expect(balance.hbars).to.be.eql(Hbar.from(accountInfo.balance, HbarUnit.Hbar));
      }).timeout(10 * MINUTES);

      it('get the logs and delete the namespace', async () => {
        await hederaK8.getNodeLogs(LOCAL_HEDERA);
        await hederaK8.deleteNamespace(LOCAL_HEDERA);
      }).timeout(10 * MINUTES);
    });
  },
);
