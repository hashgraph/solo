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
import {PodName} from '../../../src/core/kube/resources/pod/pod_name.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../src/core/kube/resources/pod/pod_ref.js';
import {ContainerRef} from '../../../src/core/kube/resources/container/container_ref.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {type V1Pod} from '@kubernetes/client-node';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const namespace = NamespaceName.of('node-delete');
const deleteNodeAlias = 'node1';
const argv = getDefaultArgv(namespace);
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.nodeAlias.name] = deleteNodeAlias;
argv[flags.stakeAmounts.name] = '1,1000';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.persistentVolumeClaims.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace.name;
argv[flags.quiet.name] = true;
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
    describe('Node delete', async () => {
      const nodeCmd = bootstrapResp.cmd.nodeCmd;
      const accountCmd = bootstrapResp.cmd.accountCmd;
      const k8Factory = bootstrapResp.opts.k8Factory;

      after(async function () {
        this.timeout(Duration.ofMinutes(10).toMillis());
        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await k8Factory.default().namespaces().delete(namespace);
      });

      it('should succeed with init command', async () => {
        const status = await accountCmd.init(argv);
        expect(status).to.be.ok;
      }).timeout(Duration.ofMinutes(8).toMillis());

      it('should delete a node from the network successfully', async () => {
        await nodeCmd.handlers.delete(argv);
        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.DELETE_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.force.constName,
          flags.quiet.constName,
        ]);

        await bootstrapResp.opts.accountManager.close();
      }).timeout(Duration.ofMinutes(10).toMillis());

      balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, deleteNodeAlias);

      accountCreationShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, deleteNodeAlias);

      it('config.txt should no longer contain removed node alias name', async () => {
        // read config.txt file from first node, read config.txt line by line, it should not contain value of nodeAlias
        const pods: V1Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
        const podName: PodName = PodName.of(pods[0].metadata.name);
        const tmpDir = getTmpDir();
        await k8Factory
          .default()
          .containers()
          .readByRef(ContainerRef.of(PodRef.of(namespace, podName), ROOT_CONTAINER))
          .copyFrom(`${HEDERA_HAPI_PATH}/config.txt`, tmpDir);
        const configTxt = fs.readFileSync(`${tmpDir}/config.txt`, 'utf8');
        console.log('config.txt:', configTxt);
        expect(configTxt).not.to.contain(deleteNodeAlias);
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  },
);
