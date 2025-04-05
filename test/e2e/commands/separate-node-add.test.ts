// SPDX-License-Identifier: Apache-2.0

import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
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
import {AccountCommand} from '../../../src/commands/account.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-add-separated');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.stakeAmounts, '1500,1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.force, true);
argv.setArg(flags.persistentVolumeClaims, true);

const argvPrepare = argv.clone();

const temporaryDirectory = 'contextDir';
argvPrepare.setArg(flags.outputDir, temporaryDirectory);
argvPrepare.setArg(flags.outputDir, temporaryDirectory);

const argvExecute = Argv.getDefaultArgv(namespace);
argvExecute.setArg(flags.inputDir, temporaryDirectory);
argvExecute.setArg(flags.inputDir, temporaryDirectory);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, accountManager, remoteConfigManager, logger},
    cmd: {nodeCmd, accountCmd, networkCmd},
  } = bootstrapResp;

  describe('Node add via separated commands should success', async () => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await accountManager.close();

      await commandInvoker.invoke({
        argv: argv,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'stop',
        callback: async argv => nodeCmd.handlers.stop(argv),
      });

      await commandInvoker.invoke({
        argv: argv,
        command: NetworkCommand.COMMAND_NAME,
        subcommand: 'destroy',
        callback: async argv => networkCmd.destroy(argv),
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
    }).timeout(defaultTimeout);

    it('should succeed with init command', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async argv => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network via the segregated commands successfully', async () => {
      await commandInvoker.invoke({
        argv: argvPrepare,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'add-prepare',
        callback: async argv => nodeCmd.handlers.addPrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'add-submit-transactions',
        callback: async argv => nodeCmd.handlers.addSubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'add-execute',
        callback: async argv => nodeCmd.handlers.addExecute(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(12).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

    it('existing nodes private keys should not have changed', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias);

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
            `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
          );
        }
      }
    }).timeout(defaultTimeout);
  }).timeout(Duration.ofMinutes(3).toMillis());
});
