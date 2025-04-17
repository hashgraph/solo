// SPDX-License-Identifier: Apache-2.0

import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type DeploymentName} from '../../../src/core/config/remote/types.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-update-separate');
const updateNodeId = 'node2';
const newAccountId = '0.0.7';
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
argv.setArg(flags.nodeAlias, updateNodeId);
argv.setArg(flags.newAccountNumber, newAccountId);
argv.setArg(
  flags.newAdminKey,
  '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2',
);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.persistentVolumeClaims, true);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, logger, remoteConfigManager, commandInvoker, accountManager, keyManager},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node update via separated commands', async () => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'stop',
        callback: async argv => nodeCmd.handlers.stop(argv),
      });

      await k8Factory.default().namespaces().delete(namespace);
    });

    it('cache current version of private keys', async () => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfigManager.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should succeed with init command', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async argv => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should update a new node property successfully', async () => {
      // generate gossip and tls keys for the updated node
      const temporaryDirectory = getTemporaryDirectory();

      const signingKey = await keyManager.generateSigningKey(updateNodeId);
      const signingKeyFiles = await keyManager.storeSigningKey(updateNodeId, signingKey, temporaryDirectory);
      logger.debug(`generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`);
      argv.setArg(flags.gossipPublicKey, signingKeyFiles.certificateFile);
      argv.setArg(flags.gossipPrivateKey, signingKeyFiles.privateKeyFile);

      const tlsKey = await keyManager.generateGrpcTlsKey(updateNodeId);
      const tlsKeyFiles = await keyManager.storeTLSKey(updateNodeId, tlsKey, temporaryDirectory);
      logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
      argv.setArg(flags.tlsPublicKey, tlsKeyFiles.certificateFile);
      argv.setArg(flags.tlsPrivateKey, tlsKeyFiles.privateKeyFile);

      const temporaryDirectory2 = 'contextDir';
      const argvPrepare = argv.clone();
      argvPrepare.setArg(flags.outputDir, temporaryDirectory2);

      const argvExecute = Argv.getDefaultArgv(namespace);
      argvExecute.setArg(flags.inputDir, temporaryDirectory2);

      await commandInvoker.invoke({
        argv: argvPrepare,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'update-prepare',
        callback: async argv => nodeCmd.handlers.updatePrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'update-submit-transactions',
        callback: async argv => nodeCmd.handlers.updateSubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'update-execute',
        callback: async argv => nodeCmd.handlers.updateExecute(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(30).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger, updateNodeId);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger, updateNodeId);

    it('signing key and tls key should not match previous one', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias);

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
    }).timeout(defaultTimeout);

    it('the consensus nodes accountId should be the newAccountId', async () => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${updateNodeId}`]);
      const accountId: string = pods[0].labels['solo.hedera.com/account-id'];
      expect(accountId).to.equal(newAccountId);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
});
