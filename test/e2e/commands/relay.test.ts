// SPDX-License-Identifier: Apache-2.0

import {after, describe} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  type BootstrapResponse,
  endToEndTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

const testName: string = 'relay-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.relayReleaseTag, flags.relayReleaseTag.definition.defaultValue);

endToEndTestSuite(testName, argv, {}, (bootstrapResp: BootstrapResponse): void => {
  const {
    opts: {k8Factory, logger, commandInvoker},
  } = bootstrapResp;

  describe('RelayCommand', async (): Promise<void> => {
    const relayCmd: RelayCommand = new RelayCommand(bootstrapResp.opts);
    const testLogger: SoloLogger = container.resolve(InjectTokens.SoloLogger);

    afterEach(async (): Promise<void> => {
      // wait for k8s to finish destroying containers from relay destroy
      await sleep(Duration.ofMillis(5));
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());
      // await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      // await k8Factory.default().namespaces().delete(namespace);
    });

    each(['node1', 'node1,node2']).describe(
      'relay and deploy and destroy for each',
      async (relayNodes: string): Promise<void> => {
        it(`relay deploy and destroy should work with ${relayNodes}`, async function (): Promise<void> {
          testLogger.info(`#### Running relay deploy for: ${relayNodes} ####`);
          this.timeout(Duration.ofMinutes(5).toMillis());

          argv.setArg(flags.nodeAliasesUnparsed, relayNodes);

          try {
            await commandInvoker.invoke({
              argv: argv,
              command: RelayCommand.COMMAND_NAME,
              subcommand: 'deploy',
              // @ts-expect-error to access private property
              callback: async (argv: ArgvStruct): Promise<boolean> => relayCmd.deploy(argv),
            });
          } catch (error) {
            logger.showUserError(error);
            expect.fail();
          }
          await sleep(Duration.ofMillis(500));

          testLogger.info(`#### Running relay destroy for: ${relayNodes} ####`);
          try {
            await commandInvoker.invoke({
              argv: argv,
              command: RelayCommand.COMMAND_NAME,
              subcommand: 'destroy',
              // @ts-expect-error to access private modifier
              callback: async (argv: ArgvStruct): Promise<boolean> => relayCmd.destroy(argv),
            });
          } catch (error) {
            logger.showUserError(error);
            expect.fail();
          }
          testLogger.info(`#### Finished relay deploy and destroy for: ${relayNodes} ####`);
        });
      },
    );
  });
});
