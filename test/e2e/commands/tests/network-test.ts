// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {expect} from 'chai';
import {type Context, type DeploymentName} from '../../../../src/types/index.js';
import {Flags as flags, Flags} from '../../../../src/commands/flags.js';
import {type BaseTestOptions} from './base-test-options.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {it} from 'mocha';
import {sleep} from '../../../../src/core/helpers.js';
import * as constants from '../../../../src/core/constants.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';

export class NetworkTest extends BaseCommandTest {
  private static soloNetworkDeployArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
    loadBalancerEnabled: boolean,
    tssEnabled: boolean,
    wrapsEnabled: boolean,
    releaseTagOverride?: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NetworkTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DEPLOY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.persistentVolumeClaims),
      optionFromFlag(Flags.serviceMonitor),
      optionFromFlag(Flags.podLog),
    );

    // have to enable load balancer to resolve cross cluster in multi-cluster
    if (loadBalancerEnabled) {
      argv.push(optionFromFlag(Flags.loadBalancerEnabled));
    }

    if (!tssEnabled) {
      argv.push(`--no-${Flags.tssEnabled.name}`);
    }

    // TSS is enabled by default; enabling WRAPs exercises recursive hinTS/TSS aggregation (CN >= v0.74).
    if (wrapsEnabled) {
      argv.push(optionFromFlag(Flags.wrapsEnabled));
    }

    if (releaseTagOverride) {
      argv.push(optionFromFlag(Flags.releaseTag), releaseTagOverride);
    } else if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  public static deploy(options: BaseTestOptions, releaseTagOverride?: string): void {
    const {
      testName,
      deployment,
      namespace,
      contexts,
      enableLocalBuildPathTesting,
      localBuildReleaseTag,
      loadBalancerEnabled,
      tssEnabled,
      wrapsEnabled,
      clusterReferenceNameArray,
      consensusNodesCount,
    } = options;
    const {soloNetworkDeployArgv} = NetworkTest;

    it(`${testName}: consensus network deploy`, async (): Promise<void> => {
      await main(
        soloNetworkDeployArgv(
          testName,
          deployment,
          enableLocalBuildPathTesting,
          localBuildReleaseTag,
          loadBalancerEnabled,
          tssEnabled,
          wrapsEnabled,
          releaseTagOverride,
        ),
      );
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

      const clusterCount: number = clusterReferenceNameArray.length;
      const base: number = Math.floor(consensusNodesCount / clusterCount);
      const remainder: number = consensusNodesCount % clusterCount;

      const nodeCountsPerCluster: number[] = clusterReferenceNameArray.map((_, index): number =>
        index < remainder ? base + 1 : base,
      );

      for (const [index, context_] of contexts.entries()) {
        const nodeCount: number = nodeCountsPerCluster[index];

        const namespaceExists: boolean = await k8Factory.getK8(context_).namespaces().has(namespace);
        expect(namespaceExists, `namespace ${namespace} should exist in ${context_}`).to.be.true;

        const pods: Pod[] = await k8Factory
          .getK8(context_)
          .pods()
          .list(namespace, ['solo.hedera.com/type=network-node']);

        expect(
          pods.length,
          `expected exactly ${nodeCount} network-node pod in namespace ${namespace} for context ${context_}`,
        ).to.equal(nodeCount);
      }
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static soloConsensusNetworkDestroyArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NetworkTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.deletePvcs),
      optionFromFlag(Flags.deleteSecrets),
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
    );
    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment} = options;
    const {soloConsensusNetworkDestroyArgv} = NetworkTest;

    it(`${testName}: consensus network destroy`, async (): Promise<void> => {
      await main(soloConsensusNetworkDestroyArgv(testName, deployment));
    }).timeout(Duration.ofMinutes(10).toMillis());

    it(`${testName}: consensus network destroy should success`, async (): Promise<void> => {
      const {namespace, contexts: contextRecord, testLogger: logger} = options;

      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);

      const contexts: string[] = [...contextRecord.values()]; // get all contexts

      async function getPodsCountInMultipleNamespaces(label: string[]): Promise<number> {
        return await Promise.all(
          contexts.map((context: Context): Promise<Pod[]> => k8Factory.getK8(context).pods().list(namespace, label)),
        ).then((results): number => results.flat().length);
      }

      async function waitUntilPodsGone(label: string[]): Promise<void> {
        logger.showUser(`Waiting for pod ${label} to be gone`);
        while (true) {
          const podsCount: number = await getPodsCountInMultipleNamespaces(label);
          if (podsCount === 0) {
            break;
          }

          await sleep(Duration.ofSeconds(3));
        }
      }

      await waitUntilPodsGone(['solo.hedera.com/type=network-node']);
      await waitUntilPodsGone(['app=minio']);

      const isChartInstalled: boolean = await chartManager.isChartInstalled(namespace, constants.SOLO_DEPLOYMENT_CHART);

      expect(isChartInstalled).to.be.false;

      await expect(
        k8Factory.getK8(contexts[0]).pvcs().list(namespace, []),
        'PVCs should be deleted in cluster[0]',
      ).eventually.to.have.lengthOf(0);

      await expect(
        k8Factory.getK8(contexts[1]).pvcs().list(namespace, []),
        'PVCs should be deleted in cluster[1]',
      ).eventually.to.have.lengthOf(0);

      await expect(
        k8Factory.getK8(contexts[0]).secrets().list(namespace),
        'Secrets should be deleted in cluster[0]',
      ).eventually.to.have.lengthOf(0);

      await expect(
        k8Factory.getK8(contexts[1]).secrets().list(namespace),
        'Secrets should be deleted in cluster[1]',
      ).eventually.to.have.lengthOf(0);
    }).timeout(Duration.ofMinutes(4).toMillis());
  }
}
