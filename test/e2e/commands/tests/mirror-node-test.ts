// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type Context, type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {sleep} from '../../../../src/core/helpers.js';
import http from 'node:http';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {MirrorCommandDefinition} from '../../../../src/commands/command-definitions/mirror-command-definition.js';

import * as constants from '../../../../src/core/constants.js';
import fs from 'node:fs';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {type AnyObject} from '../../../../src/types/aliases.js';
import {ConsensusNodeTest} from './consensus-node-test.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {Repository} from '../../../../src/integration/helm/model/repository.js';
import {Chart} from '../../../../src/integration/helm/model/chart.js';
import {InstallChartOptionsBuilder} from '../../../../src/integration/helm/model/install/install-chart-options-builder.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {type Container} from '../../../../src/integration/kube/resources/container/container.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {MIRROR_NODE_PORT} from '../../../../src/core/constants.js';
import {PortUtilities} from '../../../../src/business/utils/port-utilities.js';

export class MirrorNodeTest extends BaseCommandTest {
  private static _clusterReferenceIndex: number;
  private static soloMirrorNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    pinger: boolean,
    valuesFile?: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = MirrorNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      MirrorCommandDefinition.COMMAND_NAME,
      MirrorCommandDefinition.NODE_SUBCOMMAND_NAME,
      MirrorCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.enableIngress),
    );

    if (pinger) {
      argv.push(optionFromFlag(Flags.pinger));
    }

    if (valuesFile) {
      argv.push(optionFromFlag(Flags.valuesFile), valuesFile);
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloMirrorNodeDestroyArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = MirrorNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      MirrorCommandDefinition.COMMAND_NAME,
      MirrorCommandDefinition.NODE_SUBCOMMAND_NAME,
      MirrorCommandDefinition.NODE_DESTROY,
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

  private static async forwardMirrorIngressServicePort(
    contexts: string[],
    namespace: NamespaceName,
    testName: string,
  ): Promise<number> {
    if (!(await PortUtilities.isPortAvailable(MIRROR_NODE_PORT))) {
      return 0;
    }

    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const lastContext: string = contexts?.length ? contexts[contexts?.length - 1] : undefined;
    const k8: K8 = k8Factory.getK8(lastContext);
    const haproxyPods: Pod[] = await k8.pods().list(namespace, [constants.SOLO_INGRESS_CONTROLLER_NAME_LABEL]);
    const mirrorIngressPod: Pod | undefined = haproxyPods.find(
      (pod: Pod): boolean => !!pod.podReference?.name?.name?.startsWith(`mirror-ingress-controller-${testName}`),
    );
    expect(mirrorIngressPod).to.not.be.undefined;

    const portForwarder: number = await k8
      .pods()
      .readByReference(mirrorIngressPod!.podReference)
      .portForward(MIRROR_NODE_PORT, 80, true);
    await sleep(Duration.ofSeconds(2));
    return portForwarder;
  }

  private static async stopPortForward(contexts: string[], portForwarder: number): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts.at(-1));
    // eslint-disable-next-line unicorn/no-null
    await k8.pods().readByReference(null).stopPortForward(portForwarder);
  }

  private static async verifyMirrorNodeDeployWasSuccessful(
    contexts: string[],
    namespace: NamespaceName,
    testLogger: SoloLogger,
    createdAccountIds: string[],
    consensusNodesCount: number,
    testName: string,
  ): Promise<void> {
    const createdPortForwarder: number = await MirrorNodeTest.forwardMirrorIngressServicePort(
      contexts,
      namespace,
      testName,
    );
    const portForwarder: number = createdPortForwarder || MIRROR_NODE_PORT;
    try {
      const queryUrl: string = `http://localhost:${portForwarder}/api/v1/network/nodes`;

      let received: boolean = false;
      // wait until the transaction reached consensus and retrievable from the mirror node API
      while (!received) {
        const request: http.ClientRequest = http.request(
          queryUrl,
          {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
          (response: http.IncomingMessage): void => {
            response.setEncoding('utf8');

            response.on('data', (chunk): void => {
              testLogger.info(chunk);
              let object: {nodes: {service_endpoints: unknown[]}[]};
              try {
                object = JSON.parse(chunk) as {nodes: {service_endpoints: unknown[]}[]};
              } catch {
                testLogger.warn(`Mirror node returned non-JSON response, will retry: ${chunk}`);
                return;
              }
              expect(
                object.nodes?.length,
                `expect there to be ${consensusNodesCount} nodes in the mirror node's copy of the address book`,
              ).to.equal(consensusNodesCount);

              expect(
                object.nodes[0].service_endpoints?.length,
                'expect there to be at least one service endpoint',
              ).to.be.greaterThan(0);

              received = true;
            });
          },
        );

        request.on('error', (error: Error): void => {
          testLogger.debug(`problem with request: ${error.message}`, error);
        });

        request.end(); // make the request
        await sleep(Duration.ofSeconds(2));
      }

      for (const accountId of createdAccountIds) {
        const accountQueryUrl: string = `http://localhost:${portForwarder}/api/v1/accounts/${accountId}`;

        received = false;
        let attempts: number = 0;
        const maxAttempts: number = 120;
        // wait until the transaction reached consensus and retrievable from the mirror node API
        while (!received && attempts < maxAttempts) {
          attempts += 1;
          const request: http.ClientRequest = http.request(
            accountQueryUrl,
            {method: 'GET', timeout: 100, headers: {Connection: 'close'}},
            (response: http.IncomingMessage): void => {
              response.setEncoding('utf8');

              response.on('data', (chunk): void => {
                let object: {account?: string};
                try {
                  object = JSON.parse(chunk) as {account?: string};
                } catch {
                  testLogger.warn(`Mirror node returned non-JSON response, will retry: ${chunk}`);
                  return;
                }

                if (object.account !== accountId) {
                  testLogger.debug(
                    `Account ${accountId} not visible in mirror yet (attempt ${attempts}/${maxAttempts}), will retry`,
                  );
                  return;
                }

                received = true;
              });
            },
          );

          request.on('error', (error: Error): void => {
            testLogger.debug(`problem with request: ${error.message}`, error);
          });

          request.end(); // make the request
          await sleep(Duration.ofSeconds(2));
        }

        expect(
          received,
          `expected account ${accountId} to become visible in mirror within ${maxAttempts} attempts`,
        ).to.equal(true);

        await sleep(Duration.ofSeconds(1));
      }
    } finally {
      if (createdPortForwarder) {
        await MirrorNodeTest.stopPortForward(contexts, createdPortForwarder);
      }
    }
  }

  private static async verifyPingerStatus(
    contexts: string[],
    namespace: NamespaceName,
    pingerIsEnabled: boolean,
    testName: string,
  ): Promise<void> {
    const createdPortForwarder: number = await MirrorNodeTest.forwardMirrorIngressServicePort(
      contexts,
      namespace,
      testName,
    );
    const portForwarder: number = createdPortForwarder || MIRROR_NODE_PORT;
    try {
      const transactionsEndpoint: string = `http://localhost:${portForwarder}/api/v1/transactions`;
      // force to fetch new data instead of using cache
      const fetchOptions: object = {
        cache: 'no-cache' as RequestCache,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      };

      const firstResponse: Response = await fetch(transactionsEndpoint, fetchOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstData: any = await firstResponse.json();
      await sleep(Duration.ofSeconds(15));
      const secondResponse: Response = await fetch(transactionsEndpoint, fetchOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const secondData: any = await secondResponse.json();
      expect(firstData.transactions).to.not.be.undefined;
      expect(firstData.transactions.length).to.be.gt(0);
      expect(secondData.transactions).to.not.be.undefined;
      expect(secondData.transactions.length).to.be.gt(0);

      if (pingerIsEnabled) {
        // Compare snapshots as sets so the check is resilient when the top row remains the same.
        const firstSnapshotTxIds: Set<string> = new Set(
          firstData.transactions
            .map((transaction: {transaction_id?: string}): string | undefined => transaction?.transaction_id)
            .filter((transactionId: string | undefined): transactionId is string => !!transactionId),
        );
        const secondSnapshotHasNewTx: boolean = secondData.transactions.some(
          (transaction: {transaction_id?: string}): boolean => {
            const transactionId: string | undefined = transaction?.transaction_id;
            return !!transactionId && !firstSnapshotTxIds.has(transactionId);
          },
        );

        expect(
          secondSnapshotHasNewTx,
          'expected second mirror snapshot to include at least one new transaction id when pinger is enabled',
        ).to.equal(true);
      } else {
        expect(firstData.transactions[0]).to.deep.equal(secondData.transactions[0]);
      }
    } finally {
      if (createdPortForwarder) {
        await MirrorNodeTest.stopPortForward(contexts, createdPortForwarder);
      }
    }
  }

  public static add(options: BaseTestOptions, clusterReferenceIndex: number = 1): void {
    MirrorNodeTest._clusterReferenceIndex = clusterReferenceIndex;
    const {
      testName,
      testLogger,
      deployment,
      contexts,
      namespace,
      clusterReferenceNameArray,
      createdAccountIds,
      consensusNodesCount,
      pinger,
      valuesFile,
    } = options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful, verifyPingerStatus} = MirrorNodeTest;
    const targetClusterReference: ClusterReferenceName =
      clusterReferenceNameArray[clusterReferenceIndex] || clusterReferenceNameArray[0];

    it(`${testName}: mirror node add`, async (): Promise<void> => {
      await main(soloMirrorNodeDeployArgv(testName, deployment, targetClusterReference, pinger, valuesFile));
      await verifyMirrorNodeDeployWasSuccessful(
        contexts,
        namespace,
        testLogger,
        createdAccountIds,
        consensusNodesCount,
        testName,
      );
      await verifyPingerStatus(contexts, namespace, pinger, testName);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  /**
   * Fetches the highest block number the mirror node has ingested from the block stream.
   *
   * Returns -1 while the mirror node has not yet ingested any block (e.g. the importer is still
   * catching up), so callers can poll until blocks become available.
   */
  private static async getLatestIngestedBlockNumber(portForwarder: number, testLogger: SoloLogger): Promise<number> {
    const blocksEndpoint: string = `http://localhost:${portForwarder}/api/v1/blocks?limit=1&order=desc`;
    const fetchOptions: object = {
      cache: 'no-cache' as RequestCache,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    };

    try {
      const response: Response = await fetch(blocksEndpoint, fetchOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const blocks: {number: number}[] | undefined = data?.blocks;
      if (!blocks || blocks.length === 0) {
        return -1;
      }
      return blocks[0].number;
    } catch (error) {
      testLogger.debug(`problem querying mirror node blocks endpoint: ${(error as Error).message}`, error as Error);
      return -1;
    }
  }

  /**
   * Confirms WRAPs/TSS is operational by proving the network keeps producing blocks and the mirror
   * node keeps ingesting them: it waits for the first block to appear, then verifies the latest
   * ingested block number advances over time. A network that stalled (e.g. broken TSS signing)
   * would stop producing blocks and fail this check.
   */
  public static verifyBlocksAreBeingProduced(options: BaseTestOptions): void {
    const {testName, testLogger, contexts, namespace} = options;
    const {forwardMirrorIngressServicePort, stopPortForward, getLatestIngestedBlockNumber} = MirrorNodeTest;

    it(`${testName}: verify blocks are produced and ingested by the mirror node`, async (): Promise<void> => {
      const createdPortForwarder: number = await forwardMirrorIngressServicePort(contexts, namespace, testName);
      const portForwarder: number = createdPortForwarder || MIRROR_NODE_PORT;
      try {
        // Wait until the mirror node has ingested at least one block from the block stream.
        let firstBlockNumber: number = -1;
        const maxAttempts: number = 60;
        for (let attempt: number = 0; firstBlockNumber < 0 && attempt < maxAttempts; attempt++) {
          firstBlockNumber = await getLatestIngestedBlockNumber(portForwarder, testLogger);
          if (firstBlockNumber < 0) {
            await sleep(Duration.ofSeconds(2));
          }
        }
        expect(firstBlockNumber, 'expected the mirror node to ingest at least one block').to.be.greaterThanOrEqual(0);

        // Give the network time to produce more blocks, then confirm the ingested block number advanced.
        let secondBlockNumber: number = firstBlockNumber;
        for (let attempt: number = 0; secondBlockNumber <= firstBlockNumber && attempt < maxAttempts; attempt++) {
          await sleep(Duration.ofSeconds(2));
          secondBlockNumber = await getLatestIngestedBlockNumber(portForwarder, testLogger);
        }

        expect(
          secondBlockNumber,
          `expected the latest ingested block number to advance beyond ${firstBlockNumber}, confirming WRAPs/TSS-signed blocks keep flowing to the mirror node`,
        ).to.be.greaterThan(firstBlockNumber);
      } finally {
        if (createdPortForwarder) {
          await stopPortForward(contexts, createdPortForwarder);
        }
      }
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloMirrorNodeDestroyArgv} = MirrorNodeTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];

    it(`${testName}: mirror node destroy`, async (): Promise<void> => {
      await main(soloMirrorNodeDestroyArgv(testName, deployment, targetClusterReference));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static postgresPassword: string = 'XXXXXXX';
  private static postgresUsername: string = 'postgres';

  private static postgresReadonlyUsername: string = 'readonlyuser';
  private static postgresReadonlyPassword: string = 'XXXXXXXX';
  private static postgresHostFqdn: string = 'my-postgresql.database.svc.cluster.local';

  private static nameSpace: string = 'database';
  private static postgresName: string = 'my-postgresql';
  private static postgresContainerName: string = `${this.postgresName}-0`;
  private static postgresMirrorNodeDatabaseName: string = 'mirror_node';

  private static getPostgresContainer(k8: K8): Container {
    return k8
      .containers()
      .readByRef(
        ContainerReference.of(
          PodReference.of(NamespaceName.of(this.nameSpace), PodName.of(this.postgresContainerName)),
          ContainerName.of('postgresql'),
        ),
      );
  }

  /**
   * Grants the readonly role to mirror_rest so the REST service can SELECT from tables
   * created by Flyway migrations after V1.0.
   *
   * The importer's V1.0__Init.sql creates mirror_rest without the readonly role, so it
   * has no access to any table added after that migration.  The init.sh script sets default
   * privileges that automatically grant SELECT on new tables to the readonly role; granting
   * readonly to mirror_rest propagates those privileges.
   *
   * This must be called after main() returns (importer pod ready = migrations complete =
   * mirror_rest exists) and before verifyMirrorNodeDeployWasSuccessful.
   */
  private static async grantReadonlyRoleToMirrorRestUser(k8: K8): Promise<void> {
    // Use a dollar-quoted block so the grant is safe even if mirror_rest already has the role.
    const grantSql: string =
      "DO $grant$ BEGIN IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly') " +
      "AND EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mirror_rest') " +
      'THEN GRANT readonly TO mirror_rest; END IF; END $grant$;';
    const postgresContainer: Container = MirrorNodeTest.getPostgresContainer(k8);
    await postgresContainer.execContainer([
      'env',
      `PGPASSWORD=${MirrorNodeTest.postgresPassword}`,
      'psql',
      '-U',
      MirrorNodeTest.postgresUsername,
      '-d',
      MirrorNodeTest.postgresMirrorNodeDatabaseName,
      '-c',
      grantSql,
    ]);
  }

  public static deployWithExternalDatabase(options: BaseTestOptions): void {
    const {
      testName,
      testLogger,
      deployment,
      contexts,
      namespace,
      clusterReferenceNameArray,
      createdAccountIds,
      consensusNodesCount,
      pinger,
      valuesFile,
    } = options;
    const {soloMirrorNodeDeployArgv, verifyMirrorNodeDeployWasSuccessful, verifyPingerStatus, optionFromFlag} =
      MirrorNodeTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];
    const targetContext: Context = contexts[1] || contexts[0];

    it(`${testName}: mirror node deploy with external database`, async (): Promise<void> => {
      const argv: string[] = soloMirrorNodeDeployArgv(testName, deployment, targetClusterReference, pinger, valuesFile);

      process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME = 'true';

      // Add external database flags
      argv.push(
        optionFromFlag(Flags.enableIngress),
        optionFromFlag(Flags.useExternalDatabase),
        optionFromFlag(Flags.externalDatabaseHost),
        this.postgresHostFqdn,
        optionFromFlag(Flags.externalDatabaseOwnerUsername),
        this.postgresUsername,
        optionFromFlag(Flags.externalDatabaseOwnerPassword),
        this.postgresPassword,
        optionFromFlag(Flags.externalDatabaseReadonlyUsername),
        this.postgresReadonlyUsername,
        optionFromFlag(Flags.externalDatabaseReadonlyPassword),
        this.postgresReadonlyPassword,
      );

      await main(argv);

      // The importer's V1.0__Init.sql migration creates the mirror_rest user without the readonly
      // role, so it lacks SELECT on tables created after V1.0 (e.g. entity, transaction, node).
      // Grant the readonly role now (after importer pod is ready = migrations are complete).
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(targetContext);
      await MirrorNodeTest.grantReadonlyRoleToMirrorRestUser(k8);

      await verifyMirrorNodeDeployWasSuccessful(
        contexts,
        namespace,
        testLogger,
        createdAccountIds,
        consensusNodesCount,
        testName,
      );
      await verifyPingerStatus(contexts, namespace, pinger, testName);
    }).timeout(Duration.ofMinutes(10).toMillis());

    it('Enable port-forward for mirror node gRPC', async (): Promise<void> => {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const k8: K8 = k8Factory.getK8(contexts[1]);
      const mirrorNodePods: Pod[] = await k8
        .pods()
        .list(namespace, ['app.kubernetes.io/name=grpc', 'app.kubernetes.io/component=grpc']);
      const mirrorNodePod: Pod = mirrorNodePods[0];
      await k8.pods().readByReference(mirrorNodePod.podReference).portForward(5600, 5600);
    });
  }

  public static installPostgres(options: BaseTestOptions): void {
    const {contexts} = options;
    it('should install postgres chart', async (): Promise<void> => {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      k8Factory.getK8(contexts[1]).contexts().updateCurrent(contexts[1]);
      const helm: HelmClient = container.resolve<HelmClient>(InjectTokens.Helm);
      await helm.addRepository(new Repository('postgresql-helm', 'https://leverages.github.io/helm'));
      await helm.installChart(
        'my-postgresql',
        new Chart('postgresql', 'postgresql-helm'),
        InstallChartOptionsBuilder.builder()
          .valueArguments(
            new HelmChartValues()
              .set('deploymentType', 'local')
              .set('postgresql.auth.password', this.postgresPassword)
              .toArguments(),
          )
          .namespace(this.nameSpace)
          .createNamespace(true)
          .kubeContext(contexts[1])
          .build(),
      );

      const k8: K8 = k8Factory.getK8(contexts[1]);
      await k8
        .pods()
        .waitForReadyStatus(
          NamespaceName.of(this.nameSpace),
          ['app.kubernetes.io/name=postgresql'],
          constants.PODS_READY_MAX_ATTEMPTS,
          constants.PODS_READY_DELAY,
        );

      const initScriptPath: string = 'scripts/external-database/init.sh';

      // check if initScriptPath exist, otherwise throw error
      if (!fs.existsSync(initScriptPath)) {
        throw new Error(`Init script not found at path: ${initScriptPath}`);
      }

      const postgresContainer: Container = MirrorNodeTest.getPostgresContainer(k8);

      await postgresContainer.copyTo(initScriptPath, '/tmp');
      await postgresContainer.execContainer(['chmod', '+x', '/tmp/init.sh']);
      await postgresContainer.execContainer([
        '/bin/bash',
        '/tmp/init.sh',
        this.postgresUsername,
        this.postgresReadonlyUsername,
        this.postgresReadonlyPassword,
      ]);
    }).timeout(Duration.ofMinutes(2).toMillis());
  }

  public static pullAddressBook(options: BaseTestOptions): void {
    const {consensusNodesCount} = options;
    it('should pull address book from mirror node', async (): Promise<void> => {
      const createdSrv: number = await MirrorNodeTest.forwardMirrorIngressServicePort(
        options.contexts,
        options.namespace,
        options.testName,
      );
      const srv: number = createdSrv || MIRROR_NODE_PORT;

      const stdOut: string[] = await new ShellRunner().run('curl', [`http://localhost:${srv}/api/v1/network/nodes`]);

      const addressBook: AnyObject = JSON.parse(stdOut.join(''));

      expect(addressBook.nodes.length).to.be.greaterThan(0);

      // Validate first alpha node (always node1, node_id=0).
      const alphaNode: AnyObject = addressBook.nodes.find((node: AnyObject): boolean => node.node_id === 0);
      expect(alphaNode.grpc_proxy_endpoint.domain_name).to.equal(ConsensusNodeTest.alphaClusterGrpcWebAddress);
      expect(alphaNode.grpc_proxy_endpoint.port).to.equal(ConsensusNodeTest.baseGrpcWebPort);

      // Validate first beta node (node_id = ceil(N/2), i.e. the first node in cluster-beta).
      const alphaCount: number = Math.ceil(consensusNodesCount / 2);
      const betaNode: AnyObject = addressBook.nodes.find((node: AnyObject): boolean => node.node_id === alphaCount);
      expect(betaNode.grpc_proxy_endpoint.domain_name).to.equal(ConsensusNodeTest.betaClusterGrpcWebAddress);
      expect(betaNode.grpc_proxy_endpoint.port).to.equal(ConsensusNodeTest.baseGrpcWebPort + alphaCount);

      if (createdSrv) {
        await MirrorNodeTest.stopPortForward(options.contexts, createdSrv);
      }
    });
  }
}
