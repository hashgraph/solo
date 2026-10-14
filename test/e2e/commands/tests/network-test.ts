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
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {Templates} from '../../../../src/core/templates.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {type Secret} from '../../../../src/integration/kube/resources/secret/secret.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {proto} from '@hiero-ledger/proto';
import crypto from 'node:crypto';

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

  /**
   * Verifies that address book files 0.0.101 and 0.0.102 list every consensus node with its gRPC service endpoints,
   * the custom domain names from `domainNames` when set, and the hash of its gRPC TLS certificate.
   */
  public static verifyAddressBookFiles(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferences, consensusNodesCount, domainNames} = options;

    it(`${testName}: address book files list the node service endpoints and certificates`, async (): Promise<void> => {
      await container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState).load();
      await container
        .resolve<RemoteConfigRuntimeState>(InjectTokens.RemoteConfigRuntimeState)
        .load(namespace, contexts[0]);

      const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
      try {
        for (const fileNumber of [101, 102]) {
          const contents: string = await accountManager.getFileContents(
            namespace,
            fileNumber,
            clusterReferences,
            deployment,
          );
          const addressBook: proto.NodeAddressBook = proto.NodeAddressBook.decode(Buffer.from(contents, 'hex'));
          expect(addressBook.nodeAddress, `file 0.0.${fileNumber} node count`).to.have.lengthOf(consensusNodesCount);

          for (const nodeAddress of addressBook.nodeAddress) {
            const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(Number(nodeAddress.nodeId.toString()) + 1);
            const label: string = `file 0.0.${fileNumber} ${nodeAlias}`;

            expect(
              nodeAddress.serviceEndpoint.map((endpoint: proto.IServiceEndpoint): number => endpoint.port),
              `${label} service endpoint ports`,
            ).to.deep.equal([constants.GRPC_PORT, constants.GRPCS_PORT]);
            if (domainNames) {
              for (const endpoint of nodeAddress.serviceEndpoint) {
                expect(endpoint.domainName, `${label} service endpoint domain name`).to.equal(domainNames[nodeAlias]);
              }
            }

            const tlsCertificatePem: string = await NetworkTest.readSecretFile(
              contexts,
              namespace,
              constants.NODE_TLS_KEYS_SECRET_NAME,
              Templates.renderTLSPemPublicKeyFile(nodeAlias),
            );
            const expectedCertificateHash: string = crypto
              .createHash('sha384')
              .update(new crypto.X509Certificate(tlsCertificatePem).raw)
              .digest('hex');
            expect(Buffer.from(nodeAddress.nodeCertHash).toString('utf8'), `${label} certificate hash`).to.equal(
              expectedCertificateHash,
            );

            if (fileNumber === 102) {
              const gossipCertificatePem: string = await NetworkTest.readSecretFile(
                contexts,
                namespace,
                Templates.renderGossipKeySecretName(nodeAlias),
                Templates.renderGossipPemPublicKeyFile(nodeAlias),
              );
              const expectedPublicKey: string = (
                new crypto.X509Certificate(gossipCertificatePem).publicKey.export({
                  type: 'spki',
                  format: 'der',
                }) as Buffer
              ).toString('hex');
              expect(nodeAddress.RSA_PubKey, `${label} gossip public key`).to.equal(expectedPublicKey);
            }
          }
        }
      } finally {
        await accountManager.close();
      }
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static async readSecretFile(
    contexts: string[],
    namespace: NamespaceName,
    secretName: string,
    fileName: string,
  ): Promise<string> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    for (const context of contexts) {
      if (!(await k8Factory.getK8(context).secrets().exists(namespace, secretName))) {
        continue;
      }
      const secret: Secret = await k8Factory.getK8(context).secrets().read(namespace, secretName);
      if (secret?.data?.[fileName]) {
        return Buffer.from(secret.data[fileName], 'base64').toString('utf8');
      }
    }
    return expect.fail(`secret ${secretName} with ${fileName} not found in namespace ${namespace.name}`);
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
