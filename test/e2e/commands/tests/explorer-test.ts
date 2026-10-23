// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {sleep} from '../../../../src/core/helpers.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {Templates} from '../../../../src/core/templates.js';
import {ExplorerCommandDefinition} from '../../../../src/commands/command-definitions/explorer-command-definition.js';

export class ExplorerTest extends BaseCommandTest {
  private static soloExplorerDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ExplorerTest;

    const argv: string[] = newArgv();
    argv.push(
      ExplorerCommandDefinition.COMMAND_NAME,
      ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME,
      ExplorerCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloExplorerUpgradeArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ExplorerTest;

    const argv: string[] = newArgv();
    argv.push(
      ExplorerCommandDefinition.COMMAND_NAME,
      ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME,
      ExplorerCommandDefinition.NODE_UPGRADE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloExplorerDestroyArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = ExplorerTest;

    const argv: string[] = newArgv();
    argv.push(
      ExplorerCommandDefinition.COMMAND_NAME,
      ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME,
      ExplorerCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.debugMode),
    );
    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  // A mirror node service that owns a route answers it with its own business-specific error shape,
  // and it only produces this exact generic body when the request never matched any registerd route.
  private static isUnroutedNotFoundResponse(status: number, body: unknown): boolean {
    if (status !== 404) {
      return false;
    }
    const messages: Array<Record<string, unknown>> | undefined = (
      body as {_status?: {messages?: Array<Record<string, unknown>>}}
    )?._status?.messages;

    return (
      Array.isArray(messages) &&
      messages.length === 1 &&
      Object.keys(messages[0]).length === 1 &&
      messages[0].message === 'Not found'
    );
  }

  private static readonly requestTimeoutMillis: number = 10_000;

  /**
   * Queries a path through the explorer's nginx proxy, retrying only on connection-level failures
   * rather than on the response content. Each attempt is bounded by its own abort signal, because
   * without this a single bad connection would hang well past the test's own timeout.
   */
  private static async queryExplorerApi(
    baseUrl: string,
    path: string,
    testLogger: SoloLogger,
    init?: RequestInit,
    maxAttempts: number = 5,
  ): Promise<{status: number; body: unknown}> {
    const queryUrl: string = `${baseUrl}${path}`;
    let lastError: Error;

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response: Response = await fetch(queryUrl, {
          cache: 'no-cache' as RequestCache,
          ...init,
          signal: AbortSignal.timeout(ExplorerTest.requestTimeoutMillis),
        });
        const body: unknown = await response.json();
        return {status: response.status, body};
      } catch (error) {
        lastError = error as Error;
        testLogger.debug(
          `explorer proxy not reachable yet at ${path} (attempt ${attempt}/${maxAttempts}): ${lastError.message}`,
          lastError,
        );
        await sleep(Duration.ofSeconds(2));
      }
    }

    throw lastError!;
  }

  // Asserts that a path is handled by whichever mirror node service EXPLORER_VALUES_FILE's
  // proxyPass table routes it to, rather than falling through to the generic unrouted body.
  private static async expectRouteIsHandled(
    baseUrl: string,
    path: string,
    testLogger: SoloLogger,
    init?: RequestInit,
    maxAttempts?: number,
  ): Promise<void> {
    const {status, body} = await ExplorerTest.queryExplorerApi(baseUrl, path, testLogger, init, maxAttempts);
    expect(
      ExplorerTest.isUnroutedNotFoundResponse(status, body),
      `expected ${path} to be routed to a mirror node service, got status ${status} with body ${JSON.stringify(body)}`,
    ).to.equal(false);
  }

  // Arbitrary, unreserved starting point handed to `portForward`; it auto-picks another free port if taken.
  private static readonly preferredLocalPort: number = 38_080;

  /**
   * Opens a dedicated port-forward to the current explorer pod, runs `callback` against its local
   * base URL, then tears the tunnel back down -- centralizes the "find the pod, forward to it, clean
   * up afterward" dance so each route-group check doesn't have to repeat it. Establishes its own
   * tunnel rather than trusting whatever local port solo's own CLI-managed tunnel (or, in one-shot, a
   * static Kind NodePort mapping) happens to be using at the moment: that assumption breaks whenever
   * the pod is replaced (rolling upgrade) or the port it depended on stops having a live backend (e.g.
   * the mirror ingress controller is torn down), leaving requests to hang against a stale target
   * instead of failing fast.
   */
  private static async withExplorerProxyBaseUrl<T>(
    k8: K8,
    namespace: NamespaceName,
    callback: (baseUrl: string) => Promise<T>,
  ): Promise<T> {
    const explorerPods: Pod[] = await k8.pods().list(namespace, Templates.renderExplorerLabels(1));
    expect(explorerPods).to.have.lengthOf(1);

    const explorerPod: Pod = k8.pods().readByReference(explorerPods[0].podReference);
    const localPort: number = await explorerPod.portForward(ExplorerTest.preferredLocalPort, 8080, false);
    const baseUrl: string = `http://127.0.0.1:${localPort}`;

    try {
      return await callback(baseUrl);
    } finally {
      await explorerPod.stopPortForward(localPort);
    }
  }

  // Verifies that the explorer's nginx proxy routes every proxyPass entry in EXPLORER_VALUES_FILE
  // to a live mirror node service.
  public static async verifyExplorerDeployWasSuccessful(
    k8: K8,
    namespace: NamespaceName,
    existingAccountId: string,
    testLogger: SoloLogger,
    maxAttempts?: number,
  ): Promise<void> {
    const {expectRouteIsHandled, withExplorerProxyBaseUrl} = ExplorerTest;

    await withExplorerProxyBaseUrl(k8, namespace, async (baseUrl: string): Promise<void> => {
      // "/api" catch-all -> rest. A nonexistent account id would also 404 with the generic shape, so
      // this must be a real account to prove the request reached the rest service at all.
      await expectRouteIsHandled(baseUrl, `/api/v1/accounts/${existingAccountId}`, testLogger, undefined, maxAttempts);

      // "/api/v1/network/" -> restjava.
      await expectRouteIsHandled(baseUrl, '/api/v1/network/nodes', testLogger, undefined, maxAttempts);

      // "~ ^/api/v1/topics/...$" -> restjava. A nonexistent-but-well-formed topic id still gets
      // restjava's own "Topic not found" body, distinct from the generic unrouted shape.
      await expectRouteIsHandled(baseUrl, '/api/v1/topics/0.0.999999999', testLogger, undefined, maxAttempts);

      // "~ .../accounts/.../allowances/nfts" -> restjava.
      await expectRouteIsHandled(
        baseUrl,
        `/api/v1/accounts/${existingAccountId}/allowances/nfts`,
        testLogger,
        undefined,
        maxAttempts,
      );

      // "~ .../accounts/.../airdrops" -> restjava.
      await expectRouteIsHandled(
        baseUrl,
        `/api/v1/accounts/${existingAccountId}/airdrops/outstanding`,
        testLogger,
        undefined,
        maxAttempts,
      );

      // "/api/v1/contracts/call" -> web3. An empty body is invalid, but restjava never sees it: web3
      // answers with its own business error instead of the generic unrouted shape.
      await expectRouteIsHandled(
        baseUrl,
        '/api/v1/contracts/call',
        testLogger,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({}),
        },
        maxAttempts,
      );

      // "~ .../contracts/results/.../opcodes" -> web3.
      await expectRouteIsHandled(
        baseUrl,
        `/api/v1/contracts/results/0x${'0'.repeat(64)}/opcodes`,
        testLogger,
        undefined,
        maxAttempts,
      );

      /**
       * TODO: hooks are not implemented by the mirror node REST API yet, so an unrouted request and
       * a correctly-routed one are both indistinguishable generic 404s. Enable once that endpoint exists.
       */
      // "~ .../accounts/.../(allowances/nfts|airdrops|hooks)" and ".../hooks/{hookId}/storage" -> restjava
      // await expectRouteIsHandled(
      //   baseUrl,
      //   `/api/v1/accounts/${existingAccountId}/hooks`,
      //   testLogger,
      //   undefined,
      //   maxAttempts,
      // );
      //
      // await expectRouteIsHandled(
      //   baseUrl,
      //   `/api/v1/accounts/${existingAccountId}/hooks/0/storage`,
      //   testLogger,
      //   undefined,
      //   maxAttempts,
      // );
    });
  }

  public static add(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray, createdAccountIds, testLogger} =
      options;
    const {soloExplorerDeployArgv, verifyExplorerDeployWasSuccessful} = ExplorerTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];
    const targetContext: string = contexts[1] || contexts[0];

    it(`${testName}: explorer node add`, async (): Promise<void> => {
      await main(soloExplorerDeployArgv(testName, deployment, targetClusterReference));

      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(targetContext);
      await verifyExplorerDeployWasSuccessful(k8, namespace, createdAccountIds[0], testLogger);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloExplorerDestroyArgv} = ExplorerTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];

    it(`${testName}: explorer node destroy`, async (): Promise<void> => {
      await main(soloExplorerDestroyArgv(testName, deployment, targetClusterReference));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  /**
   * Re-runs `explorer node upgrade`, which re-resolves mirrorNodeServices the same way `add` does
   * (prepareHederaExplorerChartValues is shared by both). Does not verify on its own: the caller picks
   * which account id and retry budget make sense for whatever changed on the mirror node side.
   */
  public static upgrade(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloExplorerUpgradeArgv} = ExplorerTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];

    it(`${testName}: explorer node upgrade`, async (): Promise<void> => {
      await main(soloExplorerUpgradeArgv(testName, deployment, targetClusterReference));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
