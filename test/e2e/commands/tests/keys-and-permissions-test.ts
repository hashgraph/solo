// SPDX-License-Identifier: Apache-2.0

import {it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {container} from 'tsyringe-neo';

import {type BaseTestOptions} from './base-test-options.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type Secret} from '../../../../src/integration/kube/resources/secret/secret.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {Templates} from '../../../../src/core/templates.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {getTemporaryDirectory} from '../../../test-utility.js';
import * as constants from '../../../../src/core/constants.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

/**
 * End-to-end verifications for the SOLO_HOME key/permission hardening:
 * - every file solo writes under SOLO_HOME is restricted to 0750 or stricter, and
 * - each consensus node's on-disk gossip keys match the material stored in the cluster secret.
 */
export class KeysAndPermissionsTest {
  /**
   * Returns true if the file basename is a private key (gossip signing or gRPC TLS private key).
   * @param fileName - the file basename to classify
   */
  private static isPrivateKeyFile(fileName: string): boolean {
    return fileName.endsWith('.key') || (fileName.startsWith('s-private-') && fileName.endsWith('.pem'));
  }

  /**
   * Assert that every file written under SOLO_HOME (the test cache directory) is restricted to owner
   * access with at most group-read, i.e. no group-write and no "other" access (<= 0750), and that any
   * private key files are owner-only (0600). Skipped on Windows, which does not use POSIX mode bits.
   * @param options - the shared e2e test options
   */
  public static verifySoloHomeFilePermissions(options: BaseTestOptions): void {
    const {testName, testLogger, testCacheDirectory} = options;

    it(`${testName}: verify SOLO_HOME file permissions are 0750 or stricter`, (): void => {
      if (process.platform === 'win32') {
        testLogger.info(`${testName}: skipping file-permission check on Windows (POSIX mode bits not used)`);
        return;
      }

      expect(fs.existsSync(testCacheDirectory), `cache directory ${testCacheDirectory} should exist`).to.be.true;

      const looseFiles: string[] = [];
      const looselyProtectedPrivateKeys: string[] = [];

      for (const relativePath of fs.readdirSync(testCacheDirectory, {recursive: true}) as string[]) {
        const fullPath: string = PathEx.join(testCacheDirectory, relativePath);
        let stats: fs.Stats;
        try {
          stats = fs.lstatSync(fullPath);
        } catch {
          // best-effort: a transient staging file may have been removed between listing and stat — ignore
          continue;
        }
        if (!stats.isFile()) {
          continue;
        }

        const mode: number = stats.mode & 0o777;
        // reject any group-write (0o020) or "other" (0o007) access.
        if ((mode & 0o027) !== 0) {
          looseFiles.push(`${relativePath} (0${mode.toString(8)})`);
        }

        const fileName: string = relativePath.split(/[/\\]/).pop() as string;
        if (KeysAndPermissionsTest.isPrivateKeyFile(fileName) && mode !== 0o600) {
          looselyProtectedPrivateKeys.push(`${relativePath} (0${mode.toString(8)})`);
        }
      }

      expect(
        looseFiles,
        `files under SOLO_HOME with permissions looser than 0750:\n${looseFiles.join('\n')}`,
      ).to.have.lengthOf(0);
      expect(
        looselyProtectedPrivateKeys,
        `private key files that are not owner-only (0600):\n${looselyProtectedPrivateKeys.join('\n')}`,
      ).to.have.lengthOf(0);
    });
  }

  /**
   * Assert that each running consensus node's gossip keys on disk (mounted from the cluster secret)
   * are byte-identical to the material stored in that node's `network-<node>-keys-secrets` secret.
   * @param options - the shared e2e test options
   * @param namespaceOverride - namespace to inspect when it differs from options.namespace (e.g. one-shot)
   */
  public static verifyConsensusNodeKeysMatchSecrets(
    options: BaseTestOptions,
    namespaceOverride?: NamespaceName,
    useDefaultContext: boolean = false,
  ): void {
    const {testName, testLogger, contexts, namespace} = options;
    const targetNamespace: NamespaceName = namespaceOverride ?? namespace;

    it(`${testName}: verify consensus node gossip keys match cluster secrets`, async (): Promise<void> => {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      let verifiedNodeCount: number = 0;

      // one-shot deploys to a single cluster whose context is the current kube-config context, which
      // does not necessarily match the SOLO_TEST_CLUSTER-derived names in options.contexts (the Podman
      // one-shot job uses the default "kind-kind" context). Use the default context in that case.
      const k8List: K8[] = useDefaultContext
        ? [k8Factory.default()]
        : contexts.map((context_: string): K8 => k8Factory.getK8(context_));

      for (const k8 of k8List) {
        const pods: Pod[] = await k8.pods().list(targetNamespace, ['solo.hedera.com/type=network-node']);

        for (const pod of pods) {
          const nodeAlias: NodeAlias = Templates.extractNodeAliasFromPodName(pod.podReference.name);
          const secret: Secret = await k8
            .secrets()
            .read(targetNamespace, Templates.renderGossipKeySecretName(nodeAlias));
          expect(secret?.data, `gossip secret for ${nodeAlias} has no data`).to.exist;

          const containerReference: ContainerReference = ContainerReference.of(
            PodReference.of(targetNamespace, pod.podReference.name),
            constants.ROOT_CONTAINER,
          );
          const temporaryDirectory: string = getTemporaryDirectory();

          for (const fileName of [
            Templates.renderGossipPemPrivateKeyFile(nodeAlias),
            Templates.renderGossipPemPublicKeyFile(nodeAlias),
          ]) {
            await k8
              .containers()
              .readByRef(containerReference)
              .copyFrom(`${constants.HEDERA_HAPI_PATH}/data/keys/${fileName}`, temporaryDirectory);

            const inNodeContent: string = fs.readFileSync(PathEx.join(temporaryDirectory, fileName), 'utf8');
            const secretContent: string = Buffer.from(secret.data[fileName] ?? '', 'base64').toString('utf8');
            const secretName: string = Templates.renderGossipKeySecretName(nodeAlias);
            const mismatchMessage: string = `node ${nodeAlias} file ${fileName} does not match secret ${secretName}`;

            expect(secretContent, `secret ${secretName} is missing ${fileName}`).to.not.be.empty;
            expect(inNodeContent, mismatchMessage).to.equal(secretContent);
          }

          verifiedNodeCount++;
        }
      }

      testLogger.info(`${testName}: verified gossip keys match secrets for ${verifiedNodeCount} consensus node(s)`);
      expect(verifiedNodeCount, 'expected at least one consensus node to verify').to.be.greaterThan(0);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
