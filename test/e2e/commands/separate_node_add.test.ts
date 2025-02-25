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
  getNodeAliasesPrivateKeysHash,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type NetworkNodeServices} from '../../../src/core/network_node_services.js';
import {type DeploymentName} from '../../../src/core/config/remote/types.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-add-separated');
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.stakeAmounts, '1500,1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.force, true);
argv.setArg(flags.persistentVolumeClaims, true);
argv.setArg(flags.quiet, true);

const argvPrepare = argv.clone();

const tempDir = 'contextDir';
argvPrepare.setArg(flags.outputDir, tempDir);
argvPrepare.setArg(flags.outputDir, tempDir);

const argvExecute = Argv.getDefaultArgv(namespace);
argvExecute.setArg(flags.inputDir, tempDir);
argvExecute.setArg(flags.inputDir, tempDir);

e2eTestSuite(namespace.name, argv, {}, bootstrapResp => {
  describe('Node add via separated commands should success', async () => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const networkCmd = bootstrapResp.cmd.networkCmd;
    const k8Factory = bootstrapResp.opts.k8Factory;
    let existingServiceMap: Map<NodeAlias, NetworkNodeServices>;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    after(async function () {
      this.timeout(Duration.ofMinutes(10).toMillis());

      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      // @ts-expect-error - TS2341: to access private property
      await nodeCmd.accountManager.close();
      await nodeCmd.handlers.stop(argv.build());
      await networkCmd.destroy(argv.build());
      await k8Factory.default().namespaces().delete(namespace);
    });

    it('cache current version of private keys', async () => {
      // @ts-expect-error - TS2341: to access private property
      existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(
        namespace,
        nodeCmd.getRemoteConfigManager().getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(existingServiceMap, k8Factory, getTmpDir());
    }).timeout(defaultTimeout);

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv.build());
      expect(status).to.be.ok;
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network via the segregated commands successfully', async () => {
      await nodeCmd.handlers.addPrepare(argvPrepare.build());
      await nodeCmd.handlers.addSubmitTransactions(argvExecute.build());
      await nodeCmd.handlers.addExecute(argvExecute.build());
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
        k8Factory,
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
