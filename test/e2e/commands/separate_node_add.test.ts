/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  getNodeAliasesPrivateKeysHash,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = 'node-add-separated';
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.stakeAmounts.name] = '1500,1';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace;
argv[flags.force.name] = true;
argv[flags.persistentVolumeClaims.name] = true;
argv[flags.quiet.name] = true;

const argvPrepare = Object.assign({}, argv);

const tempDir = 'contextDir';
argvPrepare[flags.outputDir.name] = tempDir;
argvPrepare[flags.outputDir.constName] = tempDir;

const argvExecute = getDefaultArgv();
argvExecute[flags.inputDir.name] = tempDir;
argvExecute[flags.inputDir.constName] = tempDir;

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('Node add via separated commands should success', async () => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const networkCmd = bootstrapResp.cmd.networkCmd;
    const k8 = bootstrapResp.opts.k8;
    let existingServiceMap;
    let existingNodeIdsPrivateKeysHash;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await k8.getNodeLogs(namespace);
      // @ts-ignore
      await nodeCmd.accountManager.close();
      await nodeCmd.handlers.stop(argv);
      await networkCmd.destroy(argv);
      await k8.deleteNamespace(namespace);
    });

    it('cache current version of private keys', async () => {
      // @ts-ignore
      existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(namespace);
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        namespace,
        k8,
        getTmpDir(),
      );
    }).timeout(defaultTimeout);

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv);
      expect(status).to.be.ok;
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network via the segregated commands successfully', async () => {
      await nodeCmd.handlers.addPrepare(argvPrepare);
      await nodeCmd.handlers.addSubmitTransactions(argvExecute);
      await nodeCmd.handlers.addExecute(argvExecute);
      expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.ADD_CONFIGS_NAME)).to.deep.equal([
        flags.gossipEndpoints.constName,
        flags.grpcEndpoints.constName,
        flags.devMode.constName,
        flags.force.constName,
        flags.quiet.constName,
        'curDate',
        'freezeAdminPrivateKey',
      ]);
      await bootstrapResp.opts.accountManager.close();
    }).timeout(Duration.ofMinutes(12).toMillis());

    // @ts-ignore
    balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace);

    // @ts-ignore
    accountCreationShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace);

    it('existing nodes private keys should not have changed', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        namespace,
        k8,
        getTmpDir(),
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
