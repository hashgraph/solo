// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {NodeCommand} from '../../../src/commands/node/index.js';

const namespace = NamespaceName.of('node-delete-separate');
const nodeAlias = 'node1' as NodeAlias;
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.nodeAlias, nodeAlias);
argv.setArg(flags.stakeAmounts, '1,1000');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);

const temporaryDirectory = 'contextDir';
const argvPrepare = argv.clone();
argvPrepare.setArg(flags.outputDir, temporaryDirectory);

const argvExecute = Argv.getDefaultArgv(namespace);
argvExecute.setArg(flags.inputDir, temporaryDirectory);

endToEndTestSuite(namespace.name, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, accountManager, remoteConfigManager, logger, commandInvoker},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node delete via separated commands', async () => {
    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('should succeed with init command', async () => {
      await commandInvoker.invoke({
        argv: argv,
        command: AccountCommand.COMMAND_NAME,
        subcommand: 'init',
        callback: async argv => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should delete a node from the network successfully', async () => {
      await commandInvoker.invoke({
        argv: argvPrepare,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'delete-prepare',
        callback: async argv => nodeCmd.handlers.deletePrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'delete-submit-transactions',
        callback: async argv => nodeCmd.handlers.deleteSubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: NodeCommand.COMMAND_NAME,
        subcommand: 'delete-execute',
        callback: async argv => nodeCmd.handlers.deleteExecute(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger, nodeAlias);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger, nodeAlias);

    it('deleted consensus node should not be running', async () => {
      // read config.txt file from first node, read config.txt line by line, it should not contain value of nodeAlias
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const response = await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, pods[0].podReference.name), ROOT_CONTAINER))
        .execContainer(['bash', '-c', `tail -n 1 ${HEDERA_HAPI_PATH}/output/swirlds.log`]);

      expect(response).to.contain('JVM is shutting down');
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
});
