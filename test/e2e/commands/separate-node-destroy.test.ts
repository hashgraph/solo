// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {accountCreationShouldSucceed, balanceQueryShouldSucceed, type BootstrapResponse} from '../test-utility.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {NodeDestroyTest} from './tests/node-destroy-test.js';
import {main} from '../../../src/index.js';

export function testSeparateNodeDelete(argv: Argv, bootstrapResp: BootstrapResponse, namespace: NamespaceName): void {
  const nodeAlias: NodeAlias = 'node1';

  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.nodeAlias, nodeAlias);

  const temporaryDirectory: string = 'contextDir';
  const argvPrepare: Argv = argv.clone();
  argvPrepare.setArg(flags.outputDir, temporaryDirectory);

  const argvExecute: Argv = argv.clone();
  argvExecute.setArg(flags.inputDir, temporaryDirectory);

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger},
  } = bootstrapResp;

  describe('Node delete via separated commands', (): void => {
    it('should delete a node from the network successfully', async (): Promise<void> => {
      await main(
        NodeDestroyTest.soloNodeDeletePrepareArgv(argv.getArg<string>(flags.deployment), temporaryDirectory, nodeAlias),
      );

      await main(
        NodeDestroyTest.soloNodeDeleteSubmitArgv(argv.getArg<string>(flags.deployment), temporaryDirectory, nodeAlias),
      );

      await main(
        NodeDestroyTest.soloNodeDeleteExecuteArgv(
          argv.getArg<string>(flags.deployment),
          temporaryDirectory,
          nodeAlias,
          argv.getArg<string>(flags.cacheDir),
        ),
      );

      await accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    it('deleted consensus node should not be running', async (): Promise<void> => {
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods.length).to.equal(2);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
}
