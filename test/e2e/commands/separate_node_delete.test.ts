/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import {getTmpDir} from '../../../src/core/helpers.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'fs';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {PodName} from '../../../src/core/kube/pod_name.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../src/core/kube/pod_ref.js';
import {ContainerRef} from '../../../src/core/kube/container_ref.js';
import {NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';

const namespace = NamespaceName.of('node-delete-separate');
const nodeAlias = 'node1' as NodeAlias;
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.nodeAlias.name] = nodeAlias;
argv[flags.stakeAmounts.name] = '1,1000';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.persistentVolumeClaims.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace.name;

const tempDir = 'contextDir';
const argvPrepare = Object.assign({}, argv);
argvPrepare[flags.outputDir.name] = tempDir;

const argvExecute = getDefaultArgv();
argvExecute[flags.inputDir.name] = tempDir;

e2eTestSuite(
  namespace.name,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  true,
  bootstrapResp => {
    describe('Node delete via separated commands', async () => {
      const nodeCmd = bootstrapResp.cmd.nodeCmd;
      const accountCmd = bootstrapResp.cmd.accountCmd;
      const k8 = bootstrapResp.opts.k8;

      after(async function () {
        this.timeout(Duration.ofMinutes(10).toMillis());

        await container.resolve(NetworkNodes).getLogs(namespace);
        await k8.deleteNamespace(namespace);
      });

      it('should succeed with init command', async () => {
        const status = await accountCmd.init(argv);
        expect(status).to.be.ok;
      }).timeout(Duration.ofMinutes(8).toMillis());

      it('should delete a node from the network successfully', async () => {
        await nodeCmd.handlers.deletePrepare(argvPrepare);
        await nodeCmd.handlers.deleteSubmitTransactions(argvExecute);
        await nodeCmd.handlers.deleteExecute(argvExecute);
        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.DELETE_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.force.constName,
          flags.quiet.constName,
          flags.adminKey.constName,
          'freezeAdminPrivateKey',
        ]);

        await bootstrapResp.opts.accountManager.close();
      }).timeout(Duration.ofMinutes(10).toMillis());

      balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, nodeAlias);

      accountCreationShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, nodeAlias);

      it('config.txt should no longer contain removed nodeAlias', async () => {
        // read config.txt file from first node, read config.txt line by line, it should not contain value of nodeAlias
        const pods = await k8.getPodsByLabel(['solo.hedera.com/type=network-node']);
        const podName = PodName.of(pods[0].metadata.name);
        const podRef = PodRef.of(namespace, podName);
        const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
        const tmpDir = getTmpDir();
        await k8.copyFrom(containerRef, `${HEDERA_HAPI_PATH}/config.txt`, tmpDir);
        const configTxt = fs.readFileSync(`${tmpDir}/config.txt`, 'utf8');
        console.log('config.txt:', configTxt);
        expect(configTxt).not.to.contain(nodeAlias);
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  },
);
