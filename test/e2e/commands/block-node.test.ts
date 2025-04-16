// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';

const testName: string = 'block-node-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

endToEndTestSuite(testName, argv, {startNodes: false}, bootstrapResp => {
  const {
    opts: {k8Factory, logger, commandInvoker},
  } = bootstrapResp;

  describe('BlockNodeCommand', async () => {
    const blockNodeCommand: BlockNodeCommand = new BlockNodeCommand(bootstrapResp.opts);

    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    it('Should succeed with add command', async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());

      try {
        await commandInvoker.invoke({
          argv: argv,
          command: BlockNodeCommand.COMMAND_NAME,
          subcommand: 'node add',
          // @ts-expect-error to access private property
          callback: async argv => blockNodeCommand.add(argv),
        });
      } catch (error) {
        logger.showUserError(error);
        expect.fail();
      }
    });
  });
});
