// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  type BootstrapResponse,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type DeploymentName} from '../../../src/types/index.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {
  AccountCreateTransaction,
  type AccountInfo,
  AccountInfoQuery,
  Hbar,
  HbarUnit,
  PrivateKey,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {sleep} from '../../../src/core/helpers.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {LedgerTest} from './tests/ledger-test.js';
import {ConsensusNodeAddTest} from './tests/consensus-node-add-test.js';
import {main} from '../../../src/index.js';

export function testSeparateNodeAdd(
  argv: Argv,
  bootstrapResp: BootstrapResponse,
  namespace: NamespaceName,
  timeout: number,
): void {
  const temporaryDirectory: string = 'contextDir';

  const argvPrepare: Argv = argv.clone();
  argvPrepare.setArg(flags.outputDir, temporaryDirectory);

  const argvExecute: Argv = argv.clone();
  argvExecute.setArg(flags.inputDir, temporaryDirectory);

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger},
  } = bootstrapResp;

  describe('Node add via separated commands should success', async (): Promise<void> => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    it('cache current version of private keys', async (): Promise<void> => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );
    }).timeout(timeout);

    it('should succeed with init command', async (): Promise<void> => {
      await main(
        LedgerTest.soloLedgerSystemInitArgv(
          argv.getArg<string>(flags.deployment),
          argv.getArg<string>(flags.nodeAliasesUnparsed),
          argv.getArg<string>(flags.clusterRef),
        ),
      );
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network successfully', async (): Promise<void> => {
      await main(
        ConsensusNodeAddTest.soloConsensusNodeAddPrepareArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory,
          argv.getArg<string>(flags.cacheDir),
          {
            persistentVolumeClaims: true,
            generateGossipKeys: true,
            generateTlsKeys: true,
          },
        ),
      );

      await main(
        ConsensusNodeAddTest.soloConsensusNodeAddSubmitArgv(argv.getArg<string>(flags.deployment), temporaryDirectory),
      );

      await main(
        ConsensusNodeAddTest.soloConsensusNodeAddExecuteArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory,
          argv.getArg<string>(flags.cacheDir),
        ),
      );

      await accountManager.close();
      argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
    }).timeout(Duration.ofMinutes(20).toMillis());

    it('should be able to create account after a separated consensus node add commands', async (): Promise<void> => {
      await main(LedgerTest.soloLedgerAccountCreateArgv(argv.getArg<string>(flags.deployment)));
    });

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);

    it('existing nodes private keys should not have changed', async (): Promise<void> => {
      const currentNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>> = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap: Map<string, string> = currentNodeIdsPrivateKeysHash.get(nodeAlias);

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
            `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
          );
        }
      }
    }).timeout(timeout);

    it('should save the state, restart node, and preserve account balances', async (): Promise<void> => {
      // create account before stopping
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

      const privateKey: PrivateKey = PrivateKey.generate();
      // get random integer between 100 and 1000
      const amount: number = Math.floor(Math.random() * (1000 - 100) + 100);

      const newAccount: TransactionResponse = await new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      // Get the new account ID
      const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountInfo: {accountId: string; balance: number} = {
        accountId: getReceipt.accountId.toString(),
        balance: amount,
      };

      // create more transactions to save more round of states
      await main(LedgerTest.soloLedgerAccountCreateArgv(argv.getArg<string>(flags.deployment)));

      await sleep(Duration.ofSeconds(1));

      await main(LedgerTest.soloLedgerAccountCreateArgv(argv.getArg<string>(flags.deployment)));

      await main(ConsensusNodeTest.soloConsensusNetworkFreezeArgv(argv.getArg<string>(flags.deployment)));

      await main(
        ConsensusNodeTest.soloConsensusStateDownloadArgv(
          argv.getArg<string>(flags.deployment),
          argv.getArg<string>(flags.nodeAliasesUnparsed),
        ),
      );

      await main(ConsensusNodeTest.soloConsensusNodeRestartArgv(argv.getArg<string>(flags.deployment)));

      argv.setArg(flags.stateFile, PathEx.joinWithRealPath(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip'));

      // check balance of accountInfo.accountId
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

      const accountInfoAfterRestart: AccountInfo = await new AccountInfoQuery()
        .setAccountId(accountInfo.accountId)
        .execute(accountManager._nodeClient);

      expect(accountInfoAfterRestart.balance).to.be.eql(Hbar.from(accountInfo.balance, HbarUnit.Hbar));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }).timeout(Duration.ofMinutes(20).toMillis());
}
