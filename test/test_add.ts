/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {describe, it, after} from 'mocha';

import {Flags as flags} from '../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  getNodeAliasesPrivateKeysHash,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG,
} from './test_util.js';
import * as NodeCommandConfigs from '../src/commands/node/configs.js';
import {type NodeAlias} from '../src/types/aliases.js';
import {type NetworkNodeServices} from '../src/core/network_node_services.js';
import {Duration} from '../src/core/time/duration.js';
import {LOCAL_HEDERA_PLATFORM_VERSION} from '../version.js';
import {NamespaceName} from '../src/core/kube/resources/namespace/namespace_name.js';
import {type NetworkNodes} from '../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../src/core/dependency_injection/inject_tokens.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();

export function testNodeAdd(
  localBuildPath: string,
  testDescription = 'Node add should success',
  timeout: number = defaultTimeout,
): void {
  const suffix = localBuildPath.substring(0, 5);
  const namespace = NamespaceName.of(`node-add${suffix}`);
  const argv = getDefaultArgv(namespace);
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
  argv[flags.stakeAmounts.name] = '1500,1';
  argv[flags.generateGossipKeys.name] = true;
  argv[flags.generateTlsKeys.name] = true;
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
  argv[flags.releaseTag.name] =
    !localBuildPath || localBuildPath === '' ? HEDERA_PLATFORM_VERSION_TAG : LOCAL_HEDERA_PLATFORM_VERSION;
  argv[flags.namespace.name] = namespace.name;
  argv[flags.force.name] = true;
  argv[flags.persistentVolumeClaims.name] = true;
  argv[flags.localBuildPath.name] = localBuildPath;
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
      describe(testDescription, async () => {
        const nodeCmd = bootstrapResp.cmd.nodeCmd;
        const accountCmd = bootstrapResp.cmd.accountCmd;
        const networkCmd = bootstrapResp.cmd.networkCmd;
        const k8Factory = bootstrapResp.opts.k8Factory;
        let existingServiceMap: Map<NodeAlias, NetworkNodeServices>;
        let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

        after(async function () {
          this.timeout(Duration.ofMinutes(10).toMillis());

          await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
          await bootstrapResp.opts.accountManager.close();
          await nodeCmd.handlers.stop(argv);
          await networkCmd.destroy(argv);
          await k8Factory.default().namespaces().delete(namespace);
        });

        it('cache current version of private keys', async () => {
          existingServiceMap = await bootstrapResp.opts.accountManager.getNodeServiceMap(
            namespace,
            nodeCmd.getClusterRefs(),
            argv[flags.deployment.name],
          );
          existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
            existingServiceMap,
            k8Factory,
            getTmpDir(),
          );
        }).timeout(defaultTimeout);

        it('should succeed with init command', async () => {
          expect(await accountCmd.init(argv)).to.be.true;
        }).timeout(Duration.ofMinutes(8).toMillis());

        it('should add a new node to the network successfully', async () => {
          await nodeCmd.handlers.add(argv);
          expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.ADD_CONFIGS_NAME)).to.deep.equal([
            flags.devMode.constName,
            flags.force.constName,
            flags.quiet.constName,
            flags.adminKey.constName,
          ]);
          await bootstrapResp.opts.accountManager.close();
        }).timeout(Duration.ofMinutes(12).toMillis());

        balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace);

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
              expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.deep.equal(
                `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
              );
            }
          }
        }).timeout(timeout);
      });
    },
  );
}
