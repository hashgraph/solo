// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
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
import {
  type DeploymentName,
  type NodeKeyObject,
  type PrivateKeyAndCertificateObject,
} from '../../../src/types/index.js';
import {NodeUpdateTest} from './tests/node-update-test.js';
import {main} from '../../../src/index.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  AccountId,
  type TransactionResponse,
  type TransactionReceipt,
} from '@hiero-ledger/sdk';

export function testSeparateNodeUpdate(
  argv: Argv,
  bootstrapResp: BootstrapResponse,
  namespace: NamespaceName,
  timeout: number,
): void {
  const updateNodeId: NodeAlias = 'node2';
  let newAccountId: string = '';
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.nodeAlias, updateNodeId);
  argv.setArg(flags.newAccountNumber, newAccountId);
  argv.setArg(
    flags.newAdminKey,
    '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2',
  );

  const {
    opts: {k8Factory, logger, remoteConfig, accountManager, keyManager},
  } = bootstrapResp;

  describe('Node update via separated commands', async (): Promise<void> => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    it('should create a new account for the updated node', async (): Promise<void> => {
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );
      const privateKey: PrivateKey = PrivateKey.generateED25519();
      const amount: number = 100;

      const newAccount: TransactionResponse = await new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountId: string = getReceipt.accountId.toString();
      logger.info(`New account created for updated node: ${accountId}`);
      argv.setArg(flags.newAccountNumber, accountId);
      newAccountId = accountId;

      // save to k8 secret for later use
      await accountManager.createOrReplaceAccountKeySecret(
        privateKey,
        AccountId.fromString(accountId),
        false,
        namespace,
      );
    }).timeout(Duration.ofMinutes(2).toMillis());

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
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should update a new node property successfully', async (): Promise<void> => {
      // generate gossip and tls keys for the updated node
      const temporaryDirectory: string = getTemporaryDirectory();

      const signingKey: NodeKeyObject = await keyManager.generateSigningKey(updateNodeId);
      const signingKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeSigningKey(
        updateNodeId,
        signingKey,
        temporaryDirectory,
      );

      logger.debug(`generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`);
      argv.setArg(flags.gossipPublicKey, signingKeyFiles.certificateFile);
      argv.setArg(flags.gossipPrivateKey, signingKeyFiles.privateKeyFile);

      const tlsKey: NodeKeyObject = await keyManager.generateGrpcTlsKey(updateNodeId);
      const tlsKeyFiles: PrivateKeyAndCertificateObject = await keyManager.storeTLSKey(
        updateNodeId,
        tlsKey,
        temporaryDirectory,
      );

      logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
      argv.setArg(flags.tlsPublicKey, tlsKeyFiles.certificateFile);
      argv.setArg(flags.tlsPrivateKey, tlsKeyFiles.privateKeyFile);

      const temporaryDirectory2: string = 'contextDir';

      await main(
        NodeUpdateTest.soloNodeUpdatePrepareArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory2,
          argv.getArg<string>(flags.cacheDir),
          {
            nodeAlias: updateNodeId,
            newAdminKey: argv.getArg<string>(flags.newAdminKey),
            newAccountNumber: argv.getArg<string>(flags.newAccountNumber),
            tlsPublicKey: argv.getArg<string>(flags.tlsPublicKey),
            tlsPrivateKey: argv.getArg<string>(flags.tlsPrivateKey),
            gossipPublicKey: argv.getArg<string>(flags.gossipPublicKey),
            gossipPrivateKey: argv.getArg<string>(flags.gossipPrivateKey),
          },
        ),
      );

      await main(
        NodeUpdateTest.soloNodeUpdateSubmitArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory2,
          argv.getArg<string>(flags.cacheDir),
        ),
      );

      await main(
        NodeUpdateTest.soloNodeUpdateExecuteArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory2,
          argv.getArg<string>(flags.cacheDir),
        ),
      );

      await accountManager.close();
    }).timeout(Duration.ofMinutes(30).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, updateNodeId);

    it('signing key and tls key should not match previous one', async (): Promise<void> => {
      const currentNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>> = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap: Map<string, string> = currentNodeIdsPrivateKeysHash.get(nodeAlias);

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          if (
            nodeAlias === updateNodeId &&
            (keyFileName.startsWith(constants.SIGNING_KEY_PREFIX) || keyFileName.startsWith('hedera'))
          ) {
            expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).not.to.equal(
              `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
            );
          } else {
            expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
              `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
            );
          }
        }
      }
    }).timeout(timeout);

    it('the consensus nodes accountId should be the newAccountId', async (): Promise<void> => {
      // the account-id label on the first node's pod should reflect the newAccountId
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
      const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
      expect(accountId).to.equal(newAccountId);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
}
