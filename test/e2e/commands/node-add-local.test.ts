// SPDX-License-Identifier: Apache-2.0

import {after, describe} from 'mocha';

import {Duration} from '../../../src/core/time/duration.js';
import {testSeparateNodeAdd} from './separate-node-add.test.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {destroyEnabled, endToEndTestSuite, getTestCluster} from '../../test-utility.js';
import {TEST_UPGRADE_FROM_VERSION} from '../../../version-test.js';
import {testSeparateNodeUpdate} from './separate-node-update.test.js';
import {testSeparateNodeDelete} from './separate-node-destroy.test.js';
import {testSeparateNodeUpgrade} from './separate-node-upgrade.test.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {LedgerTest} from './tests/ledger-test.js';
import {main} from '../../../src/index.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('Node add with hedera local build', (): void => {
  const localBuildPath: string = [
    'node1=../hiero-consensus-node/hedera-node/data/',
    '../hiero-consensus-node/hedera-node/data',
    'node3=../hiero-consensus-node/hedera-node/data',
  ].join(',');

  const suffix: string = localBuildPath.slice(0, 5);
  const namespace: NamespaceName = NamespaceName.of(`node-add${suffix}`);
  const argv: Argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.clusterRef, getTestCluster());
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
  argv.setArg(flags.stakeAmounts, '1500,1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.releaseTag, TEST_UPGRADE_FROM_VERSION);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.force, true);
  argv.setArg(flags.persistentVolumeClaims, true);
  argv.setArg(flags.localBuildPath, localBuildPath);
  argv.setArg(flags.forcePortForward, true);

  const timeout: number = Duration.ofMinutes(2).toMillis();

  endToEndTestSuite(namespace.name, argv, {}, (bootstrapResp): void => {
    const {
      opts: {k8Factory, accountManager},
    } = bootstrapResp;

    after(async (): Promise<void> => {
      await accountManager.close();

      if (destroyEnabled()) {
        await main(ConsensusNodeTest.soloConsensusNetworkDestroyArgv(`${namespace.name}-deployment`));

        await k8Factory.default().namespaces().delete(namespace);
      }
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('Should create and update a file', async (): Promise<void> => {
      const testCacheDirectory: string = `./test-cache/${namespace.name}`;

      try {
        // Create a test file
        const testContent: string = 'Hello, Hiero! ' + randomBytes(8).toString('hex');
        const testFilePath: string = PathEx.join(testCacheDirectory, 'test-file.txt');
        await fs.mkdir(path.dirname(testFilePath), {recursive: true});
        await fs.writeFile(testFilePath, testContent, 'utf8');

        // Create file on Hiero
        await main(LedgerTest.soloLedgerFileCreateArgv(`${namespace.name}-deployment`, testFilePath));

        // Update the file with new content
        const updatedContent: string = 'Updated content ' + randomBytes(8).toString('hex');
        const updatedFilePath: string = PathEx.join(testCacheDirectory, 'test-file-updated.txt');
        await fs.writeFile(updatedFilePath, updatedContent, 'utf8');

        await main(LedgerTest.soloLedgerFileUpdateArgv(`${namespace.name}-deployment`, '0.0.1001', updatedFilePath));

        // Clean up test files
        try {
          await Promise.all([
            fs.unlink(testFilePath).catch((): void => {}),
            fs.unlink(updatedFilePath).catch((): void => {}),
          ]);
        } catch {
          // Ignore cleanup errors
        }
      } catch (error) {
        console.error('File operation test failed', error);
        throw error;
      }
    }).timeout(Duration.ofMinutes(5).toMillis());

    testSeparateNodeAdd(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeUpdate(argv.clone(), bootstrapResp, namespace, timeout);
    testSeparateNodeUpgrade(argv.clone(), bootstrapResp, namespace);
    testSeparateNodeDelete(argv.clone(), bootstrapResp, namespace);
  });
}).timeout(Duration.ofMinutes(30).toMillis());
