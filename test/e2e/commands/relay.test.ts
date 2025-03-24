// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-util.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';

const testName = 'relay-cmd-e2e';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.relayReleaseTag, flags.relayReleaseTag.definition.defaultValue);

e2eTestSuite(testName, argv, {}, bootstrapResp => {
  const {
    opts: {k8Factory, logger, commandInvoker},
  } = bootstrapResp;

  describe('RelayCommand', async () => {
    let relayCmd: RelayCommand;

    before(() => {
      relayCmd = container.resolve(InjectTokens.RelayCommand);
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    each(['node1', 'node1,node2']).it('relay deploy and destroy should work with $value', async function (relayNodes) {
      this.timeout(Duration.ofMinutes(5).toMillis());

      argv.setArg(flags.nodeAliasesUnparsed, relayNodes);

      try {
        await commandInvoker.invoke({
          argv: argv,
          command: RelayCommand.COMMAND_NAME,
          subcommand: 'deploy',
          callback: async argv => relayCmd.deploy(argv),
        });
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
      await sleep(Duration.ofMillis(500));

      // test relay destroy
      try {
        await commandInvoker.invoke({
          argv: argv,
          command: RelayCommand.COMMAND_NAME,
          subcommand: 'destroy',
          callback: async argv => relayCmd.destroy(argv),
        });
      } catch (e) {
        logger.showUserError(e);
        expect.fail();
      }
    });
  });
});
