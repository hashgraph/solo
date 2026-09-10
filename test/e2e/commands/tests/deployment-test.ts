// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type ClusterReferenceName, type ComponentId, type DeploymentName} from '../../../../src/types/index.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type ConsensusNodeStateSchema} from '../../../../src/data/schema/model/remote/state/consensus-node-state-schema.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import fs from 'node:fs/promises';
import yaml from 'yaml';
import {type AnyObject} from '../../../../src/types/aliases.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

export class DeploymentTest extends BaseCommandTest {
  private static soloDeploymentCreateArgv(
    testName: string,
    deployment: DeploymentName,
    namespace: NamespaceName,
    realm: number,
    shard: number,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_CREATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.namespace),
      namespace.name,
      optionFromFlag(Flags.realm),
      String(realm),
      optionFromFlag(Flags.shard),
      String(shard),
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static create(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, namespace, realm, shard} = options;
    const {soloDeploymentCreateArgv} = DeploymentTest;

    it(`${testName}: solo deployment config create`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment config create`);
      await main(soloDeploymentCreateArgv(testName, deployment, namespace, realm, shard));
      // TODO check that the deployment was created
      testLogger.info(`${testName}: finished solo deployment config create`);
    });
  }

  private static soloDeploymentAddClusterArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    numberOfNodes: number,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_ATTACH,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.numberOfConsensusNodes),
      numberOfNodes.toString(),
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static addCluster(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray, consensusNodesCount} = options;
    const {soloDeploymentAddClusterArgv} = DeploymentTest;

    it(`${testName}: solo deployment cluster attach`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment cluster attach`);

      // Compute distribution
      const clusterCount: number = clusterReferenceNameArray.length;
      const base: number = Math.floor(consensusNodesCount / clusterCount);
      const remainder: number = consensusNodesCount % clusterCount;

      const nodeCountsPerCluster: number[] = clusterReferenceNameArray.map((_, index): number =>
        index < remainder ? base + 1 : base,
      );

      // Now attach clusters with correct node count
      for (const [index, element] of clusterReferenceNameArray.entries()) {
        const nodeCount: number = nodeCountsPerCluster[index];
        await main(soloDeploymentAddClusterArgv(testName, deployment, element, nodeCount));
      }

      const remoteConfig: RemoteConfigRuntimeStateApi = container.resolve(InjectTokens.RemoteConfigRuntimeState);
      expect(remoteConfig.isLoaded(), 'remote config manager should be loaded').to.be.true;
      const consensusNodes: Record<ComponentId, ConsensusNodeStateSchema> =
        remoteConfig.configuration.components.state.consensusNodes;

      expect(Object.entries(consensusNodes).length, `consensus node count should be ${consensusNodesCount}`).to.equal(
        consensusNodesCount,
      );
      // Verify each cluster received the expected number of nodes (not a fixed index mapping).
      const nodeCountsByCluster: Map<string, number> = new Map();
      for (const node of Object.values(consensusNodes)) {
        const cluster: string = node.metadata.cluster;
        nodeCountsByCluster.set(cluster, (nodeCountsByCluster.get(cluster) ?? 0) + 1);
      }
      for (const [index, element] of clusterReferenceNameArray.entries()) {
        expect(
          nodeCountsByCluster.get(element) ?? 0,
          `cluster ${element} should have ${nodeCountsPerCluster[index]} node(s)`,
        ).to.equal(nodeCountsPerCluster[index]);
      }
      testLogger.info(`${testName}: finished solo deployment cluster attach`);
    });
  }

  public static soloDeploymentDiagnosticsLogsArgv(deployment: DeploymentName): string[] {
    const {newArgv, optionFromFlag} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTICS_LOGS,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    return argv;
  }

  public static soloDeploymentConfigCreateArgv(deployment: DeploymentName, namespace: NamespaceName): string[] {
    const {newArgv, optionFromFlag} = DeploymentTest;
    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_CREATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.namespace),
      namespace.name,
    );
    return argv;
  }

  public static soloDeploymentClusterAttachArgv(
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    consensusNodesCount: number,
  ): string[] {
    const {newArgv, optionFromFlag} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_ATTACH,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.numberOfConsensusNodes),
      consensusNodesCount.toString(),
    );

    return argv;
  }

  private static soloDeploymentConfigListArgv(testName: string, clusterReference?: ClusterReferenceName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;
    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_LIST,
    );

    if (clusterReference) {
      argv.push(optionFromFlag(Flags.clusterRef), clusterReference);
    }

    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  /**
   * Lists all local deployment configurations or deployments in a specific cluster.
   * Tests both scenarios:
   * 1. Without cluster-ref: Lists all deployments from local configuration
   * 2. With cluster-ref: Lists deployments from the specified Kubernetes cluster
   */
  public static listDeployments(options: BaseTestOptions): void {
    const {testName, testLogger, clusterReferenceNameArray} = options;
    const {soloDeploymentConfigListArgv} = DeploymentTest;

    it(`${testName}: solo deployment config list (without cluster-ref)`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment config list without cluster-ref`);
      await main(soloDeploymentConfigListArgv(testName));
      testLogger.info(`${testName}: finished solo deployment config list without cluster-ref`);
    });

    if (clusterReferenceNameArray && clusterReferenceNameArray.length > 0) {
      it(`${testName}: solo deployment config list (with cluster-ref)`, async (): Promise<void> => {
        testLogger.info(`${testName}: beginning solo deployment config list with cluster-ref`);
        await main(soloDeploymentConfigListArgv(testName, clusterReferenceNameArray[0]));
        testLogger.info(`${testName}: finished solo deployment config list with cluster-ref`);
      });
    }
  }

  private static soloDeploymentConfigInfoArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;
    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_INFO,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static info(options: BaseTestOptions): void {
    const {testName, testLogger, deployment} = options;
    const {soloDeploymentConfigInfoArgv} = DeploymentTest;

    it(`${testName}: solo deployment config info`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment config info`);
      await main(soloDeploymentConfigInfoArgv(testName, deployment));
      testLogger.info(`${testName}: finished solo deployment config info`);
    });
  }

  public static verifyDeploymentConfigInfo(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, namespace} = options;
    const {soloDeploymentConfigInfoArgv, runMainAndCaptureOutputToJson} = DeploymentTest;

    it(`${testName}: verify deployment config info output`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning deployment config info output verification`);

      const {stdout, outputFilePath} = await runMainAndCaptureOutputToJson(
        soloDeploymentConfigInfoArgv(testName, deployment),
        {
          testName,
          outputFileName: 'deployment-config-info-output.json',
          metadata: {
            command: 'deployment config info',
            deployment,
            namespace: namespace.name,
          },
        },
      );

      expect(stdout).to.contain('Deployment:');
      expect(stdout).to.contain(deployment);
      expect(stdout).to.contain('Namespace:');
      expect(stdout).to.contain(namespace.name);

      testLogger.info(`${testName}: deployment config info output saved to ${outputFilePath}`);
      testLogger.info(`${testName}: finished deployment config info output verification`);
    });
  }

  private static soloDeploymentConfigPortsArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    output: 'json' | 'yaml' | 'wide',
    cacheDirectory: string,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;
    const argv: string[] = newArgv();

    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_PORTS,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    if (output) {
      argv.push(optionFromFlag(Flags.output), output);
    }

    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static verifyDeploymentConfigPorts(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray, namespace, testCacheDirectory} = options;
    const {soloDeploymentConfigPortsArgv, runMainAndCaptureOutputToJson, assertPortsFile} = DeploymentTest;

    it(`${testName}: verify deployment config ports output`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning deployment config ports output verification`);

      const clusterReference: ClusterReferenceName = clusterReferenceNameArray[0];
      const outputDirectory: string = PathEx.join(testCacheDirectory, 'output');
      const jsonPortsFile: string = PathEx.join(outputDirectory, 'forwarded-ports.json');
      const yamlPortsFile: string = PathEx.join(outputDirectory, 'forwarded-ports.yaml');

      await fs.rm(jsonPortsFile, {force: true});
      await fs.rm(yamlPortsFile, {force: true});

      console.log(options);

      const wideResult: {stdout: string; outputFilePath: string} = await runMainAndCaptureOutputToJson(
        soloDeploymentConfigPortsArgv(testName, deployment, clusterReference, 'wide', testCacheDirectory),
        {
          testName,
          outputFileName: 'deployment-config-ports-wide-output.json',
          metadata: {
            command: 'deployment config ports',
            deployment,
            namespace: namespace.name,
            clusterReference,
            output: 'wide',
          },
        },
      );

      expect(wideResult.stdout).to.contain('Port-forwards for deployment');
      expect(wideResult.stdout).to.contain(deployment);
      expect(wideResult.stdout).to.contain('Cluster:');
      expect(wideResult.stdout).to.contain(clusterReference);
      expect(wideResult.stdout).to.contain('Namespace:');
      // When one-shot created the Kind cluster itself, the consensus node gRPC, mirror node REST
      // API, relay, and explorer are served via stable Kind NodePort mappings and no port-forwards
      // are registered in the remote config. When the cluster pre-existed (e.g. CI creates it via
      // setup-dual-e2e.sh), one-shot falls back to the legacy kubectl port-forwards.
      if (wideResult.stdout.includes('No port-forwards configured in remote config')) {
        expect(wideResult.stdout).to.not.contain('Consensus node gRPC');
        expect(wideResult.stdout).to.not.contain('Mirror node REST');
        expect(wideResult.stdout).to.not.contain('JSON-RPC relay');
        expect(wideResult.stdout).to.not.contain('Explorer');
      } else {
        expect(wideResult.stdout).to.contain('Consensus node gRPC');
        expect(wideResult.stdout).to.contain('Mirror node REST');
        expect(wideResult.stdout).to.contain('JSON-RPC relay');
        expect(wideResult.stdout).to.contain('Explorer');
      }

      const jsonResult: {stdout: string; outputFilePath: string} = await runMainAndCaptureOutputToJson(
        soloDeploymentConfigPortsArgv(testName, deployment, clusterReference, 'json', testCacheDirectory),
        {
          testName,
          outputFileName: 'deployment-config-ports-json-output.json',
          metadata: {
            command: 'deployment config ports',
            deployment,
            namespace: namespace.name,
            clusterReference,
            output: 'json',
          },
        },
      );

      expect(jsonResult.stdout).to.contain('"deployment"');
      expect(jsonResult.stdout).to.contain(deployment);
      expect(jsonResult.stdout).to.contain('"clusterReference"');
      expect(jsonResult.stdout).to.contain(clusterReference);
      expect(jsonResult.stdout).to.contain('"namespace"');
      expect(jsonResult.stdout).to.contain('"services"');
      expect(jsonResult.stdout).to.contain('"consensusNodeGrpc"');
      expect(jsonResult.stdout).to.contain('"mirrorNodeRest"');
      expect(jsonResult.stdout).to.contain('"jsonRpcRelay"');
      expect(jsonResult.stdout).to.contain('"explorer"');
      expect(jsonResult.stdout).to.contain('"blockNode"');

      await assertPortsFile(jsonPortsFile, 'json', deployment, clusterReference);

      const yamlResult: {stdout: string; outputFilePath: string} = await runMainAndCaptureOutputToJson(
        soloDeploymentConfigPortsArgv(testName, deployment, clusterReference, 'yaml', testCacheDirectory),
        {
          testName,
          outputFileName: 'deployment-config-ports-yaml-output.json',
          metadata: {
            command: 'deployment config ports',
            deployment,
            namespace: namespace.name,
            clusterReference,
            output: 'yaml',
          },
        },
      );

      expect(yamlResult.stdout).to.contain('deployment:');
      expect(yamlResult.stdout).to.contain(deployment);
      expect(yamlResult.stdout).to.contain('clusterReference:');
      expect(yamlResult.stdout).to.contain(clusterReference);
      expect(yamlResult.stdout).to.contain('namespace:');
      expect(yamlResult.stdout).to.contain('services:');
      expect(yamlResult.stdout).to.contain('consensusNodeGrpc:');
      expect(yamlResult.stdout).to.contain('mirrorNodeRest:');
      expect(yamlResult.stdout).to.contain('jsonRpcRelay:');
      expect(yamlResult.stdout).to.contain('explorer:');
      expect(yamlResult.stdout).to.contain('blockNode:');

      await assertPortsFile(yamlPortsFile, 'yaml', deployment, clusterReference);

      testLogger.info(`${testName}: deployment config ports wide output saved to ${wideResult.outputFilePath}`);
      testLogger.info(`${testName}: deployment config ports json output saved to ${jsonResult.outputFilePath}`);
      testLogger.info(`${testName}: deployment config ports yaml output saved to ${yamlResult.outputFilePath}`);
      testLogger.info(`${testName}: finished deployment config ports output verification`);
    });
  }

  private static soloDeploymentPortForwardsStopArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;
    const argv: string[] = newArgv();

    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.PORT_FORWARDS_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.PORT_FORWARDS_STOP,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  /**
   * Verifies `solo deployment port-forwards stop`: it stops every configured port-forward and removes the
   * configuration from the remote config. Afterwards `solo deployment config ports` should report that no
   * port-forwards remain. Run this last — stopping the port-forwards breaks any connectivity-dependent tests.
   */
  public static verifyStopPortForwards(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray, namespace, testCacheDirectory} = options;
    const {soloDeploymentPortForwardsStopArgv, soloDeploymentConfigPortsArgv, runMainAndCaptureOutputToJson} =
      DeploymentTest;

    it(`${testName}: verify deployment port-forwards stop`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning deployment port-forwards stop verification`);

      const clusterReference: ClusterReferenceName = clusterReferenceNameArray[0];

      const stopResult: {stdout: string; outputFilePath: string} = await runMainAndCaptureOutputToJson(
        soloDeploymentPortForwardsStopArgv(testName, deployment),
        {
          testName,
          outputFileName: 'deployment-port-forwards-stop-output.json',
          metadata: {
            command: 'deployment port-forwards stop',
            deployment,
            namespace: namespace.name,
          },
        },
      );

      expect(stopResult.stdout).to.contain('Stopping Port-Forwards');
      // One-shot with a self-created Kind cluster serves via NodePort, so no port-forwards are registered to stop.
      if (stopResult.stdout.includes('No port-forwards configured in this deployment')) {
        expect(stopResult.stdout).to.not.contain('Stopped:');
      } else {
        expect(stopResult.stdout).to.contain('Stopped:');
      }

      // After stopping, the remote config no longer lists any port-forwards, so `config ports` reports none.
      const portsResult: {stdout: string; outputFilePath: string} = await runMainAndCaptureOutputToJson(
        soloDeploymentConfigPortsArgv(testName, deployment, clusterReference, 'wide', testCacheDirectory),
        {
          testName,
          outputFileName: 'deployment-config-ports-after-stop-output.json',
          metadata: {
            command: 'deployment config ports',
            deployment,
            namespace: namespace.name,
            clusterReference,
            output: 'wide',
          },
        },
      );

      expect(portsResult.stdout).to.contain('No port-forwards configured in remote config');

      testLogger.info(`${testName}: deployment port-forwards stop output saved to ${stopResult.outputFilePath}`);
      testLogger.info(`${testName}: finished deployment port-forwards stop verification`);
    });
  }

  private static async assertPortsFile(
    filePath: string,
    format: 'json' | 'yaml',
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): Promise<void> {
    const raw: string = await fs.readFile(filePath, 'utf8');
    const parsed: AnyObject = format === 'json' ? JSON.parse(raw) : yaml.parse(raw);

    expect(parsed.deployment).to.equal(deployment);
    expect(parsed.clusterReference).to.equal(clusterReference);

    expect(parsed.services).to.be.an('object');
    expect(parsed.services).to.have.property('consensusNodeGrpc').that.is.an('array');
    expect(parsed.services).to.have.property('mirrorNodeRest').that.is.an('array');
    expect(parsed.services).to.have.property('jsonRpcRelay').that.is.an('array');
    expect(parsed.services).to.have.property('explorer').that.is.an('array');
    expect(parsed.services).to.have.property('blockNode').that.is.an('array');
  }
}
