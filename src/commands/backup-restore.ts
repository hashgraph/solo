// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {injectable, container} from 'tsyringe-neo';
import {type ArgvStruct, NodeAlias, type AnyListrContext} from '../types/aliases.js';
import {type CommandFlags} from '../types/flag-types.js';
import chalk from 'chalk';
import yaml from 'yaml';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {type K8} from '../integration/kube/k8.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {SoloError} from '../core/errors/solo-error.js';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {
  type Context,
  type ClusterReferences,
  type SoloListrTask,
  type SoloListr,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {NetworkNodes} from '../core/network-nodes.js';
import {extractContextFromConsensusNodes, sleep} from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {plainToInstance} from 'class-transformer';
import {RemoteConfigSchema} from '../data/schema/model/remote/remote-config-schema.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {type DeploymentStateSchema} from '../data/schema/model/remote/deployment-state-schema.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type ConsensusNodeStateSchema} from '../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {type DeploymentName} from '../types/index.js';
import {type ApplicationVersionsSchema} from '../data/schema/model/common/application-versions-schema.js';
import {KeysCommandDefinition} from './command-definitions/keys-command-definition.js';
import {ConsensusCommandDefinition} from './command-definitions/consensus-command-definition.js';
import {BlockCommandDefinition} from './command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from './command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from './command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from './command-definitions/relay-command-definition.js';
import {ClusterReferenceCommandDefinition} from './command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from './command-definitions/deployment-command-definition.js';
import {CommandHelpers, invokeSoloCommand, optionFromFlag, subTaskSoloCommand} from './command-helpers.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {KindClient} from '../integration/kind/kind-client.js';
import {type ClusterCreateResponse} from '../integration/kind/model/create-cluster/cluster-create-response.js';
import {ShellRunner} from '../core/shell-runner.js';
import {SubprocessCommandProfile} from '../core/subprocess-command-profile.js';
import {PathEx} from '../business/utils/path-ex.js';
import {Chart} from '../integration/helm/model/chart.js';
import {Repository} from '../integration/helm/model/repository.js';
import {InstallChartOptionsBuilder} from '../integration/helm/model/install/install-chart-options-builder.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {BLOCK_NODE_VERSION, METALLB_CHART_VERSION} from '../../version.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Container} from '../integration/kube/resources/container/container.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {type Service} from '../integration/kube/resources/service/service.js';
import {Templates} from '../core/templates.js';
import * as Base64 from 'js-base64';
import {K8Helper} from '../business/utils/k8-helper.js';

interface ExpectedLbIpAssignment {
  context: Context;
  serviceName: string;
  expectedIp: string;
}

interface LoadBalancerIpConflict {
  context: Context;
  serviceName: string;
  conflictingIp: string;
  replacementIp: string;
}

interface ExternalDatabaseParameters {
  context: Context;
  namespace: string;
  podName: string;
  containerName: string;
  databaseName: string;
  ownerUsername: string;
  ownerPassword: string;
}

type ComponentOptionName = 'consensus' | 'block' | 'mirror' | 'relay' | 'explorer';
type ComponentOptions = Partial<Record<ComponentOptionName, string[]>>;
type JsonObject = Record<string, unknown>;
type ZstdDecompress = (buffer: Buffer) => Buffer;
type SoloSubTaskResult = SoloListr<AnyListrContext> | SoloListr<AnyListrContext>[];

// eslint-disable-next-line unicorn/no-null -- Kubernetes JSON merge patches use null to remove fields.
const JSON_MERGE_PATCH_DELETE_VALUE: null = null;

const helpers: {
  sleep: typeof sleep;
  extractContextFromConsensusNodes: typeof extractContextFromConsensusNodes;
} = {
  sleep,
  extractContextFromConsensusNodes,
};

@injectable()
export class BackupRestoreCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.KubectlInstallationDirectory) private readonly kubectlInstallationDirectory: string,
  ) {
    super();
    this.kubectlInstallationDirectory = patchInject(
      kubectlInstallationDirectory,
      InjectTokens.KubectlInstallationDirectory,
      BackupRestoreCommand.name,
    );
  }

  public async close(): Promise<void> {
    // No resources to close for this command
  }

  private static isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== JSON_MERGE_PATCH_DELETE_VALUE && !Array.isArray(value);
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private static getError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  public static BACKUP_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.quiet,
      flags.outputDir,
      flags.zipPassword,
      flags.zipFile,
      flags.backupExternalDatabase,
      flags.externalDbParamsFile,
    ],
  };

  public static RESTORE_CONFIG_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.quiet, flags.inputDir, flags.externalDbParamsFile],
  };

  public static RESTORE_CLUSTERS_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet, flags.optionsFile, flags.metallbConfig, flags.zipPassword, flags.zipFile],
  };

  public static RESTORE_NETWORK_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet, flags.optionsFile, flags.shard, flags.realm, flags.expectedLbIpsFile, flags.skipIpTracking],
  };

  public static RESTORE_DB_FLAGS_LIST: CommandFlags = {
    required: [flags.inputDir],
    optional: [flags.quiet, flags.externalDbParamsFile],
  };

  public static BRIDGE_IMPORT_GAP_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.quiet, flags.externalDbParamsFile],
  };

  /**
   * Generic export function for Kubernetes resources from multiple clusters
   * @param outputDirectory - directory to export resources to
   * @param resourceType - type of resource ('configmaps' or 'secrets')
   * @returns total number of resources exported across all clusters
   */
  private async exportResources(outputDirectory: string, resourceType: 'configmaps' | 'secrets'): Promise<number> {
    try {
      const namespace: NamespaceName = this.remoteConfig.getNamespace();
      const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nExporting ${resourceType} from namespace: ${namespace.toString()} across ${clusterReferences.size} cluster(s)`,
        ),
      );

      let totalExportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterReference, context] of clusterReferences.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterReference} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);

        // Create output directory using cluster reference (not context)
        const contextDirectory: string = PathEx.join(outputDirectory, clusterReference, resourceType);
        if (!fs.existsSync(contextDirectory)) {
          fs.mkdirSync(contextDirectory, {recursive: true});
        }

        // Fetch resources based on type
        let resources: (ConfigMap | Secret)[];
        let totalCount: number;

        if (resourceType === 'configmaps') {
          resources = await k8.configMaps().list(namespace, []);
          totalCount = resources.length;
        } else {
          // For secrets, filter to only include Opaque type
          const allSecrets: Secret[] = await k8.secrets().list(namespace, []);
          resources = allSecrets.filter((secret: Secret): boolean => secret.type === 'Opaque');
          totalCount = allSecrets.length;
        }

        if (resources.length === 0) {
          const message: string =
            resourceType === 'secrets'
              ? '    No Opaque secrets found in this cluster'
              : `    No ${resourceType} found in this cluster`;
          this.logger.showUser(chalk.yellow(message));
          continue;
        }

        const countMessage: string =
          resourceType === 'secrets' && totalCount !== resources.length
            ? `    Found ${resources.length} Opaque secret(s) (filtered from ${totalCount} total)`
            : `    Found ${resources.length} ${resourceType}`;
        this.logger.showUser(chalk.white(countMessage));

        // Export each resource as YAML
        for (const resource of resources) {
          const fileName: string = `${resource.name}.yaml`;
          const filePath: string = PathEx.join(contextDirectory, fileName);

          // Create a Kubernetes-compatible resource object
          const k8sResource: Record<string, unknown> = {
            apiVersion: 'v1',
            kind: resourceType === 'configmaps' ? 'ConfigMap' : 'Secret',
            metadata: {
              name: resource.name,
              namespace: resource.namespace.toString(),
              labels: resource.labels || {},
              annotations: {
                'solo.hedera.com/cluster-context': context,
              },
            },
            data: resource.data || {},
          };

          // Add type field for secrets
          if (resourceType === 'secrets') {
            k8sResource.type = (resource as Secret).type || 'Opaque';
          }

          // Convert to YAML and write to file
          const yamlContent: string = yaml.stringify(k8sResource, {sortMapEntries: true});
          fs.writeFileSync(filePath, yamlContent, 'utf8');
        }

        this.logger.showUser(chalk.green(`  ✓ Exported ${resources.length} ${resourceType} from context: ${context}`));
        totalExportedCount += resources.length;
      }

      this.logger.showUser(
        chalk.green(
          `\n✓ Total exported: ${totalExportedCount} ${resourceType} from ${clusterReferences.size} cluster(s) to ${outputDirectory}/${resourceType}/`,
        ),
      );
      return totalExportedCount;
    } catch (error) {
      throw new SoloErrors.deployment.backupExportFailed(resourceType, error);
    }
  }

  private async waitForConsensusPods(): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    for (const consensusNode of consensusNodes) {
      const context: Context = extractContextFromConsensusNodes(consensusNode.name, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);
      this.logger.info(
        `Waiting for pod of node ${consensusNode.name} in namespace ${namespace.toString()} (context: ${context})`,
      );
      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
          constants.PODS_RUNNING_MAX_ATTEMPTS,
          constants.PODS_RUNNING_DELAY,
        );
    }
  }

  /**
   * Export all configmaps from the cluster as YAML files
   * @param outputDirectory - directory to export configmaps to
   * @returns number of configmaps exported
   */
  private async exportConfigMaps(outputDirectory: string): Promise<number> {
    return this.exportResources(outputDirectory, 'configmaps');
  }

  /**
   * Export all secrets from the cluster as YAML files
   * @param outputDirectory - directory to export secrets to
   * @returns number of secrets exported
   */
  private async exportSecrets(outputDirectory: string): Promise<number> {
    return this.exportResources(outputDirectory, 'secrets');
  }

  /**
   * Backup all component configurations
   */
  public async backup(argv: ArgvStruct): Promise<boolean> {
    // Load configurations
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv);

    this.configManager.update(argv);

    const outputDirectory: string = this.configManager.getFlag<string>(flags.outputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);
    const shouldBackupExternalDatabase: boolean = this.configManager.getFlag<boolean>(flags.backupExternalDatabase);

    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {recursive: true});
    }

    // Export configmaps and secrets from the cluster
    interface BackupContext {
      configMapCount: number;
      secretCount: number;
      externalDatabaseParameters?: ExternalDatabaseParameters;
      externalDatabaseDumpPath?: string;
      externalDatabaseParamsPath?: string;
    }

    // Get namespace, contexts, and cluster references for backup operations
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    // Note: Network should be frozen before backup
    // Run: solo consensus network freeze --deployment <deployment-name>
    this.logger.showUser(
      chalk.yellow(
        '\n⚠️  Recommendation: Freeze the network before backup for data consistency.\n' +
          `   Run: solo consensus network freeze --deployment ${this.configManager.getFlag(flags.deployment)}\n`,
      ),
    );

    const tasks: SoloListr<BackupContext> = new Listr(
      [
        {
          title: 'Resolve external database parameters',
          skip: (): boolean => !shouldBackupExternalDatabase,
          task: async (context_, task): Promise<void> => {
            context_.externalDatabaseParameters = await this.resolveExternalDatabaseParametersForBackup();
            task.title =
              `Resolve external database parameters: ${context_.externalDatabaseParameters.context}/` +
              `${context_.externalDatabaseParameters.namespace}/${context_.externalDatabaseParameters.podName}`;
          },
        },
        {
          title: 'Wait for consensus node block stream to stabilize',
          skip: (): boolean => !shouldBackupExternalDatabase,
          task: async (_, task): Promise<void> => {
            await helpers.sleep(Duration.ofSeconds(30));
            task.title = 'Wait for consensus node block stream to stabilize: completed';
          },
        },
        {
          title: 'Export ConfigMaps',
          task: async (context_, task): Promise<void> => {
            context_.configMapCount = await this.exportConfigMaps(outputDirectory);
            task.title = `Export ConfigMaps: ${context_.configMapCount} exported`;
          },
        },
        {
          title: 'Export Secrets',
          task: async (context_, task): Promise<void> => {
            context_.secretCount = await this.exportSecrets(outputDirectory);
            task.title = `Export Secrets: ${context_.secretCount} exported`;
          },
        },
        {
          title: 'Download Node Logs',
          task: async (_, task): Promise<void> => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
            for (const [clusterReference, context] of clusterReferences.entries()) {
              const logsDirectory: string = PathEx.join(outputDirectory, clusterReference, 'logs');
              await networkNodes.getLogs(namespace, [context], logsDirectory);
            }
            task.title = `Download Node Logs: ${clusterReferences.size} cluster(s) completed`;
          },
        },
        {
          title: 'Download Node State Files',
          task: async (_, task): Promise<void> => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(InjectTokens.NetworkNodes);
            for (const node of consensusNodes) {
              const nodeAlias: NodeAlias = node.name;
              const context: Context = extractContextFromConsensusNodes(nodeAlias, consensusNodes);
              const clusterReference: string = node.cluster; // Get cluster ref from node metadata
              const statesDirectory: string = PathEx.join(outputDirectory, 'states', clusterReference);
              await networkNodes.getStatesFromPod(namespace, nodeAlias, context, statesDirectory);
            }
            task.title = `Download Node State Files: ${consensusNodes.length} node(s) completed`;
          },
        },
        {
          title: 'Export external database backup artifacts',
          skip: (context_): boolean => !shouldBackupExternalDatabase || !context_.externalDatabaseParameters,
          task: async (context_, task): Promise<void> => {
            context_.externalDatabaseDumpPath = await this.exportExternalDatabaseBackup(
              outputDirectory,
              context_.externalDatabaseParameters,
            );
            context_.externalDatabaseParamsPath = this.writeExternalDatabaseParameters(
              outputDirectory,
              context_.externalDatabaseParameters,
            );
            task.title =
              `Export external database backup artifacts: dump='${context_.externalDatabaseDumpPath}', ` +
              `params='${context_.externalDatabaseParamsPath}'`;
          },
        },
        {
          title: 'Export block node state',
          task: async (_, task): Promise<void> => {
            const blockNodes: object[] =
              (this.remoteConfig.configuration.state as {blockNodes?: object[]}).blockNodes ?? [];
            let exportCount: number = 0;
            for (const blockNode of blockNodes) {
              const bn: {metadata: {id: number | string; cluster: string; namespace: string}} = blockNode as {
                metadata: {id: number | string; cluster: string; namespace: string};
              };
              const blockNodeId: number = Number(bn.metadata.id);
              const blockNodeContext: Context = this.remoteConfig.getClusterRefs().get(bn.metadata.cluster);
              const blockNodeReleaseName: string = Templates.renderBlockNodeName(blockNodeId);
              const blockNodeNamespace: NamespaceName = NamespaceName.of(bn.metadata.namespace);
              const k8: K8 = this.k8Factory.getK8(blockNodeContext);
              const podName: string = `${blockNodeReleaseName}-0`;
              const podReference: PodReference = PodReference.of(blockNodeNamespace, PodName.of(podName));
              const containerReference: ContainerReference = ContainerReference.of(
                podReference,
                constants.BLOCK_NODE_CONTAINER_NAME,
              );
              const blockNodeContainer: Container = k8.containers().readByRef(containerReference);

              const blockNodeBackupDirectory: string = PathEx.join(
                outputDirectory,
                bn.metadata.cluster,
                'blockNodeData',
                podName,
              );
              fs.mkdirSync(blockNodeBackupDirectory, {recursive: true});

              // Export tss-bootstrap-roster.json — written by BlockHasher after block 0 is
              // verified; needed to restore TSS state so CN v0.74 TSS-signed blocks can be
              // verified after cluster recreate.
              const tssSourcePath: string = '/opt/hiero/block-node/application-state/tss-bootstrap-roster.json';
              const hasTssFile: boolean = await blockNodeContainer.hasFile(tssSourcePath).catch((): boolean => false);
              if (hasTssFile) {
                await blockNodeContainer.copyFrom(tssSourcePath, blockNodeBackupDirectory);
                this.logger.info(`Exported tss-bootstrap-roster.json from ${podName}`);
                exportCount++;
              } else {
                this.logger.info(`tss-bootstrap-roster.json not present on ${podName}, skipping`);
              }

              // Export block data archive. applyBlockNodeRestoreFixes() extracts this archive
              // into /opt/hiero/block-node/ on the restored pod so data/live/ already holds
              // blocks 0-N before BN starts. That sets lastVerifiedBlock=N on startup.
              // Without the archive, lastVerifiedBlock=-1 and CN's first post-restore block
              // (~145) parks in ResultOrderingManager waiting for blocks 0-144 that never
              // arrive — bn_tip stays empty and the verify step times out.
              const blockDataArchiveName: string = `${podName}-blockNodeData.tar.gz`;
              const blockDataArchiveInPod: string = `/tmp/${blockDataArchiveName}`;
              const blockNodeDataBackupDirectory: string = PathEx.join(
                outputDirectory,
                bn.metadata.cluster,
                'blockNodeData',
              );
              await blockNodeContainer
                .execContainer([
                  'sh',
                  '-c',
                  `cd /opt/hiero/block-node && tar czf "${blockDataArchiveInPod}" data/ 2>/dev/null && echo ok || echo skip`,
                ])
                .catch((): string => '');
              await blockNodeContainer.copyFrom(blockDataArchiveInPod, blockNodeDataBackupDirectory);
              await blockNodeContainer
                .execContainer(['sh', '-c', `rm -f "${blockDataArchiveInPod}"`])
                .catch((): void => undefined);
              this.logger.info(`Exported block data archive from ${podName}`);
            }
            task.title = `Export block node state: ${blockNodes.length} node(s) processed, ${exportCount} TSS file(s) exported`;
          },
        },
        {
          title: 'Export CN TSS keys',
          task: async (_, task): Promise<void> => {
            // Back up each consensus node's TSS key directory so that applyBlockNodeRestoreFixes
            // can restore it after cluster recreate.  After recreate, KIND PVs are deleted, so CN
            // would run DKG and generate a new wrapsVerificationKey.  BN's backed-up
            // tss-bootstrap-roster.json holds the OLD key → BAD_BLOCK_PROOF for the first WRAPS
            // block.  Restoring these key files makes CN reuse the original DKG material so BN's
            // tss-bootstrap-roster.json remains valid.
            let exportCount: number = 0;
            for (const node of consensusNodes) {
              const context: Context = extractContextFromConsensusNodes(node.name, consensusNodes);
              const cnContainer: Container = await new K8Helper(context).getConsensusNodeRootContainer(
                namespace,
                node.name,
              );
              const nodeDataDirectory: string = PathEx.join(outputDirectory, node.cluster, 'nodeData', node.name);
              fs.mkdirSync(nodeDataDirectory, {recursive: true});
              const tssKeyPath: string = `${constants.HEDERA_HAPI_PATH}/data/keys/tss`;
              const archiveInPod: string = '/tmp/tss-keys.tar.gz';
              await cnContainer
                .execContainer([
                  'sh',
                  '-c',
                  `test -d "${tssKeyPath}" && tar czf "${archiveInPod}" -C "${constants.HEDERA_HAPI_PATH}/data/keys" tss 2>/dev/null || true`,
                ])
                .catch((): string => '');
              const archiveExists: boolean = await cnContainer.hasFile(archiveInPod).catch((): boolean => false);
              if (archiveExists) {
                await cnContainer.copyFrom(archiveInPod, nodeDataDirectory);
                await cnContainer.execContainer(['sh', '-c', `rm -f "${archiveInPod}"`]).catch((): void => undefined);
                exportCount++;
                this.logger.info(`Exported TSS keys for ${node.name}`);
              } else {
                this.logger.info(`No TSS key directory for ${node.name}; CN has not completed DKG`);
              }
            }
            task.title = `Export CN TSS keys: ${exportCount} of ${consensusNodes.length} node(s) exported`;
          },
        },
        {
          title: 'Compress backup directory',
          skip: (): boolean => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            return !zipPassword;
          },
          task: async (): Promise<void> => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            const zipFile: string = this.configManager.getFlag<string>(flags.zipFile);
            const shellRunner: ShellRunner = new ShellRunner(this.logger);
            // Run zip from the output directory (cwd) with an explicit argument array and no shell, so the
            // password and file names cannot be interpreted by a shell.
            await shellRunner.run('zip', ['-rX', '-P', zipPassword, zipFile, '.'], {
              verbose: true,
              workingDirectory: outputDirectory,
            });
            this.logger.showUser(chalk.green(`Backup compressed to ${zipFile}`));
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      const context_: BackupContext = await tasks.run();

      if (!quiet) {
        this.logger.showUser('');
        this.logger.showUser(
          chalk.green(
            `✅ Backup completed: ${context_.configMapCount} configmap(s) and ${context_.secretCount} secret(s) exported`,
          ),
        );
      }
    } catch (error) {
      this.logger.showUser(chalk.red(`❌ Error during backup: ${error.message}`));
      throw error;
    }

    return true;
  }

  /**
   * Generic import function for Kubernetes resources from multiple clusters
   * @param inputDirectory - directory to import resources from
   * @param resourceType - type of resource ('configmaps' or 'secrets')
   * @returns total number of resources imported across all clusters
   */
  private async importResources(inputDirectory: string, resourceType: 'configmaps' | 'secrets'): Promise<number> {
    interface KubernetesResource {
      metadata: {
        name: string;
        labels?: Record<string, string>;
      };
      data?: Record<string, string>;
      type?: string;
    }
    try {
      const namespace: NamespaceName = this.remoteConfig.getNamespace();
      const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

      this.logger.showUser(
        chalk.cyan(
          `\nImporting ${resourceType} to namespace: ${namespace.toString()} across ${clusterReferences.size} cluster(s)`,
        ),
      );

      let totalImportedCount: number = 0;

      // Iterate through each cluster
      for (const [clusterReference, context] of clusterReferences.entries()) {
        this.logger.showUser(chalk.cyan(`\n  Processing cluster: ${clusterReference} (context: ${context})`));

        const k8: K8 = this.k8Factory.getK8(context);
        const contextDirectory: string = PathEx.join(inputDirectory, clusterReference, resourceType);

        // Check if directory exists
        if (!fs.existsSync(contextDirectory)) {
          this.logger.showUser(chalk.yellow(`    No ${resourceType} directory found for context: ${context}`));
          continue;
        }

        // Read all YAML files in the directory
        const files: string[] = fs
          .readdirSync(contextDirectory)
          .filter((file: string): boolean => file.endsWith('.yaml'));

        if (files.length === 0) {
          this.logger.showUser(chalk.yellow(`    No ${resourceType} YAML files found in this cluster`));
          continue;
        }

        this.logger.showUser(chalk.white(`    Found ${files.length} ${resourceType} file(s)`));

        // Import each resource from YAML
        for (const file of files) {
          const filePath: string = PathEx.join(contextDirectory, file);
          const yamlContent: string = fs.readFileSync(filePath, 'utf8');
          const resource: KubernetesResource = yaml.parse(yamlContent) as KubernetesResource;

          try {
            // skip configMap file SOLO_REMOTE_CONFIGMAP_NAME
            if ((resource.metadata?.name as string) === constants.SOLO_REMOTE_CONFIGMAP_NAME) {
              this.logger.showUser(chalk.yellow(`    Skipping ${resourceType} file: ${resource.metadata?.name}`));
              continue;
            }

            if (
              resourceType === 'configmaps' &&
              /^block-node-\d+-config$/.test(resource.metadata?.name as string) &&
              resource.data
            ) {
              // Block-node configmaps carry a VERSION field that the pod's entrypoint uses to
              // locate the app binary: /opt/hiero/block-node/app-${VERSION}/bin/app.
              // If the backup was taken on an older BN release, the backed-up VERSION does not
              // match the currently deployed image → the pod crashes with "No such file or directory".
              // Overwrite VERSION with the currently deployed BLOCK_NODE_VERSION so the entrypoint
              // always resolves to the correct binary path regardless of backup age.
              if (resource.data['VERSION'] !== BLOCK_NODE_VERSION) {
                this.logger.info(
                  `Patching VERSION from ${resource.data['VERSION']} to ${BLOCK_NODE_VERSION} in ${resource.metadata?.name}`,
                );
                resource.data['VERSION'] = BLOCK_NODE_VERSION;
              }
              // After restore, CN's first block is typically ~7 behind BN's lastPersistedBlockNumber
              // (the archive max).  BN's default duplicateBlockSkipWindow=5 sends END_DUPLICATE for
              // blocks more than 5 behind lastPersistedBlockNumber; CN v0.74 cannot recover from
              // DUPLICATE_BLOCK and stops streaming.  Raise the window to the maximum allowed (10)
              // so CN's post-restore blocks receive SKIP (stream stays open) instead of END_DUPLICATE,
              // letting CN fast-forward until BN accepts the first truly new block via streamBeforeEmbOrElse.
              resource.data['PRODUCER_DUPLICATE_BLOCK_SKIP_WINDOW'] = '10';
            }

            await (resourceType === 'configmaps'
              ? k8
                  .configMaps()
                  .createOrReplace(
                    namespace,
                    resource.metadata?.name as string,
                    (resource.metadata?.labels || {}) as Record<string, string>,
                    (resource.data || {}) as Record<string, string>,
                  )
              : k8
                  .secrets()
                  .createOrReplace(
                    namespace,
                    resource.metadata?.name as string,
                    (resource.type || 'Opaque') as SecretType,
                    (resource.data || {}) as Record<string, string>,
                    (resource.metadata?.labels || {}) as Record<string, string>,
                  ));
            this.logger.showUser(chalk.gray(`    ✓ Imported: ${resource.metadata?.name}`));
            totalImportedCount++;
          } catch (error) {
            this.logger.showUser(chalk.red(`    ✗ Failed to import ${file}: ${error.message}`));
          }
        }

        this.logger.showUser(chalk.green(`  ✓ Imported ${resourceType} to context: ${context}`));
      }

      this.logger.showUser(
        chalk.green(
          `\n✓ Total imported: ${totalImportedCount} ${resourceType} to ${clusterReferences.size} cluster(s)`,
        ),
      );
      return totalImportedCount;
    } catch (error) {
      throw new SoloErrors.deployment.backupImportFailed(resourceType, error);
    }
  }

  /**
   * Import all configmaps to the cluster from YAML files
   * @param inputDirectory - directory to import configmaps from
   * @returns number of configmaps imported
   */
  private async importConfigMaps(inputDirectory: string): Promise<number> {
    return this.importResources(inputDirectory, 'configmaps');
  }

  /**
   * Import all secrets to the cluster from YAML files
   * @param inputDirectory - directory to import secrets from
   * @returns number of secrets imported
   */
  private async importSecrets(inputDirectory: string): Promise<number> {
    return this.importResources(inputDirectory, 'secrets');
  }

  /**
   * Restore logs and configs to consensus nodes
   * @param inputDirectory - directory containing logs
   * @returns Promise that resolves when restoration is complete
   */
  private async restoreLogsAndConfigs(inputDirectory: string): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

    for (const [clusterReference, context] of clusterReferences.entries()) {
      const logsDirectory: string = PathEx.join(inputDirectory, clusterReference, 'logs', namespace.toString());

      // Check if logs directory exists
      if (!fs.existsSync(logsDirectory)) {
        this.logger.showUser(chalk.yellow(`  No logs directory found for context: ${context}`));
        continue;
      }

      // Get all log zip files directly from logs directory
      const allFiles: string[] = fs.readdirSync(logsDirectory);
      this.logger.showUser(`Files are found in ${logsDirectory} are : ${allFiles.join(', ')}`);
      const logFiles: string[] = allFiles.filter((file): boolean => file.endsWith(constants.LOG_CONFIG_ZIP_SUFFIX));

      if (logFiles.length === 0) {
        this.logger.showUser(
          chalk.red(`  No log files found in context: ${context} (found ${allFiles.length} file(s))`),
        );
        this.logger.showUser(chalk.gray(`    Available files: ${allFiles.join(', ')}`));
        throw new SoloErrors.validation.backupNoLogFiles(context);
      }

      this.logger.showUser(chalk.white(`  Restoring ${logFiles.length} log file(s) to context: ${context}`));

      // Get all pods in this context
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

      // Upload logs to each pod
      for (const logFile of logFiles) {
        // Extract pod name from log file by removing the suffix
        const podName: string = logFile.replace(constants.LOG_CONFIG_ZIP_SUFFIX, '');
        const pod: Pod | undefined = pods.find((p: Pod): boolean => p.podReference.name.name === podName);

        if (!pod) {
          this.logger.showUser(chalk.yellow(`    No matching pod found for log file: ${logFile}`));
          continue;
        }

        const logFilePath: string = PathEx.join(logsDirectory, logFile);
        const podReference: PodReference = pod.podReference;
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const container: Container = k8.containers().readByRef(containerReference);

        // Upload zipped log file to pod
        this.logger.showUser(chalk.gray(`    Uploading log file: ${logFile}`));
        await container.copyTo(logFilePath, `${constants.HEDERA_HAPI_PATH}`);

        // Wait for file to sync to the file system
        await sleep(Duration.ofSeconds(2));

        // Unzip the log file
        this.logger.showUser(chalk.gray(`    Extracting log file in pod: ${podName}`));
        await container.execContainer([
          'unzip',
          '-o',
          `${constants.HEDERA_HAPI_PATH}/${logFile}`,
          '-d',
          `${constants.HEDERA_HAPI_PATH}`,
        ]);

        // Fix ownership of extracted files to hedera user
        this.logger.showUser(chalk.gray(`    Setting ownership for extracted files in pod: ${podName}`));
        await container.execContainer(['bash', '-c', `chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}`]);

        this.logger.showUser(chalk.green(`    ✓ Restored log for pod: ${podName}`));
      }
    }
  }

  /**
   * Resolve the current consensus pod references by node alias.
   * This is used after pod restarts so later restore steps target live pods.
   */
  private async buildConsensusPodReferences(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    nodeAliases: string[],
  ): Promise<Record<string, PodReference>> {
    const podReferences: Record<string, PodReference> = {};

    for (const nodeAlias of nodeAliases) {
      const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as NodeAlias, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: Pod[] = await k8
        .pods()
        .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

      if (pods.length > 0) {
        podReferences[nodeAlias] = pods[0].podReference;
      }
    }

    return podReferences;
  }

  /**
   * Restart pods by deleting them and waiting for replacement pods to become ready.
   * We use this for components that are easiest to bounce by label selection.
   */
  private async restartPodsMatchingLabels(
    context: Context,
    namespace: NamespaceName,
    labels: string[],
    description: string,
  ): Promise<void> {
    const k8: K8 = this.k8Factory.getK8(context);
    const pods: Pod[] = await k8.pods().list(namespace, labels);
    if (pods.length === 0) {
      this.logger.info(`No pods found for ${description} in context ${context}`);
      return;
    }

    for (const pod of pods) {
      await k8.pods().delete(pod.podReference);
    }

    // No createdAfter filter: Kubernetes sets deletionTimestamp synchronously on delete(),
    // so excludeMarkedForDeletion=true reliably excludes the old pod without a timestamp race.
    await k8
      .pods()
      .waitForReadyStatus(
        namespace,
        labels,
        constants.PODS_READY_MAX_ATTEMPTS,
        constants.PODS_READY_DELAY,
        undefined,
        true,
      );
  }

  /**
   * Resolve mirror release name while supporting legacy release naming.
   * Mirror node id=1 may still be installed under the old fixed release name.
   */
  /**
   * Trigger a deployment rollout by patching a restart annotation.
   * This avoids delete/recreate and keeps restart behavior explicit.
   */
  private async patchDeploymentRestartAnnotation(
    context: Context,
    namespace: NamespaceName,
    deploymentName: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: deploymentName,
          namespace: namespace.name,
        },
        spec: {
          template: {
            metadata: {
              annotations: {
                'solo.hedera.com/restartedAt': new Date().toISOString(),
              },
            },
          },
        },
      });
  }

  /**
   * Restart mirror runtime dependencies that cache state/config.
   * Redis is restarted first so it picks up restored credentials. Once Redis is ready,
   * grpc and importer pods are deleted and recreated so they authenticate to Redis with
   * the restored (old) password rather than the password set during restore-network.
   */
  private async restartMirrorRuntimeDependencies(namespace: NamespaceName): Promise<void> {
    const mirrorNodes: MirrorNodeStateSchema[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const processedContexts: Set<string> = new Set<string>();

    for (const mirrorNode of mirrorNodes) {
      const mirrorContext: Context = clusterReferences.get(mirrorNode.metadata.cluster);
      if (!mirrorContext || processedContexts.has(mirrorContext)) {
        continue;
      }

      processedContexts.add(mirrorContext);

      await this.restartPodsMatchingLabels(
        mirrorContext,
        namespace,
        [constants.SOLO_MIRROR_REDIS_NAME_LABEL],
        'mirror redis',
      );

      // grpc and importer may be in CrashLoopBackOff after Redis restarted with the restored
      // password. Delete their pods now so they start fresh with the restored secret credentials.
      await this.restartPodsMatchingLabels(
        mirrorContext,
        namespace,
        [constants.SOLO_MIRROR_GRPC_NAME_LABEL],
        'mirror grpc',
      );
      await this.restartPodsMatchingLabels(
        mirrorContext,
        namespace,
        [constants.SOLO_MIRROR_IMPORTER_NAME_LABEL],
        'mirror importer',
      );
    }
  }

  /**
   * Read mirror importer DB credentials from the mirror-passwords secret.
   * These credentials are used for database export/restore operations.
   */
  private async resolveMirrorDatabaseCredentials(
    mirrorNamespace: NamespaceName,
    mirrorContext: Context,
  ): Promise<{dbName: string; ownerUsername: string; ownerPassword: string}> {
    const mirrorPasswordsSecret: Secret = await this.k8Factory
      .getK8(mirrorContext)
      .secrets()
      .read(mirrorNamespace, 'mirror-passwords');

    const ownerKey: string | undefined = Object.keys(mirrorPasswordsSecret.data).find((key: string): boolean =>
      key.endsWith('_MIRROR_IMPORTER_DB_OWNER'),
    );
    if (!ownerKey) {
      throw new SoloError('Could not find MIRROR_IMPORTER_DB_OWNER in mirror-passwords secret.');
    }

    const environmentVariablePrefix: string = ownerKey.replace('_MIRROR_IMPORTER_DB_OWNER', '');
    return {
      dbName: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`]),
      ownerUsername: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`]),
      ownerPassword: Base64.decode(
        mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
      ),
    };
  }

  /**
   * Resolve a database pod name in the external DB namespace/context.
   * Backup/restore needs a concrete pod target for pg_dump/psql execution.
   */
  private async resolveExternalDbPodName(databaseNamespace: NamespaceName, databaseContext: Context): Promise<string> {
    const pods: Pod[] = await this.k8Factory.getK8(databaseContext).pods().list(databaseNamespace, []);
    if (pods.length === 0) {
      throw new SoloError(
        `No pods found in external DB namespace ${databaseNamespace.name} (context: ${databaseContext})`,
      );
    }

    return pods[0].podReference.name.toString();
  }

  private resolveExternalDbParamsFilePath(baseDirectory: string): {paramsFilePath: string; fromFlag: boolean} {
    const configuredPath: string = this.configManager.getFlag<string>(flags.externalDbParamsFile);
    if (configuredPath) {
      return {
        paramsFilePath: path.isAbsolute(configuredPath) ? configuredPath : PathEx.resolve(configuredPath),
        fromFlag: true,
      };
    }

    return {
      paramsFilePath: PathEx.join(baseDirectory, 'external-database-params.json'),
      fromFlag: false,
    };
  }

  private readExternalDatabaseParameters(
    baseDirectory: string,
    required: boolean = false,
  ): ExternalDatabaseParameters | undefined {
    const {paramsFilePath, fromFlag} = this.resolveExternalDbParamsFilePath(baseDirectory);
    if (!fs.existsSync(paramsFilePath)) {
      if (fromFlag || required) {
        throw new SoloError(`External database parameters file not found: ${paramsFilePath}`);
      }
      return undefined;
    }

    const parsedPayload: unknown = JSON.parse(fs.readFileSync(paramsFilePath, 'utf8'));
    if (!BackupRestoreCommand.isJsonObject(parsedPayload)) {
      throw new SoloError(`Invalid external database parameters file '${paramsFilePath}'. Expected an object.`);
    }

    const parametersPayload: unknown = parsedPayload.parameters || parsedPayload;
    if (!BackupRestoreCommand.isJsonObject(parametersPayload)) {
      throw new SoloError(`Invalid external database parameters file '${paramsFilePath}'. Expected parameters object.`);
    }
    const parameters: JsonObject = parametersPayload;

    const requiredKeys: string[] = [
      'context',
      'namespace',
      'podName',
      'containerName',
      'databaseName',
      'ownerUsername',
      'ownerPassword',
    ];
    const missingKeys: string[] = requiredKeys.filter(
      (key: string): boolean => !parameters[key] || typeof parameters[key] !== 'string',
    );
    if (missingKeys.length > 0) {
      throw new SoloError(
        `Invalid external database parameters file '${paramsFilePath}'. Missing or invalid keys: ${missingKeys.join(', ')}`,
      );
    }

    return {
      context: parameters.context as string,
      namespace: parameters.namespace as string,
      podName: parameters.podName as string,
      containerName: parameters.containerName as string,
      databaseName: parameters.databaseName as string,
      ownerUsername: parameters.ownerUsername as string,
      ownerPassword: parameters.ownerPassword as string,
    };
  }

  private writeExternalDatabaseParameters(baseDirectory: string, parameters: ExternalDatabaseParameters): string {
    const {paramsFilePath} = this.resolveExternalDbParamsFilePath(baseDirectory);
    const payload: Record<string, unknown> = {
      version: 1,
      createdAt: new Date().toISOString(),
      parameters,
    };
    fs.writeFileSync(paramsFilePath, `${JSON.stringify(payload, undefined, 2)}\n`, 'utf8');
    return paramsFilePath;
  }

  /**
   * Build the external DB parameter set used by backup.
   * Parameters include pod/container location plus DB credentials from mirror secrets.
   */
  private async resolveExternalDatabaseParametersForBackup(): Promise<ExternalDatabaseParameters> {
    const mirrorNodes: MirrorNodeStateSchema[] = this.remoteConfig.configuration.state.mirrorNodes || [];
    if (mirrorNodes.length === 0) {
      throw new SoloError('No mirror node found in deployment state; cannot back up external database.');
    }

    const mirrorNode: MirrorNodeStateSchema = mirrorNodes[0];
    const mirrorContext: Context = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
    const mirrorNamespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);

    const databaseContext: Context = mirrorContext;
    const databaseNamespace: NamespaceName = NamespaceName.of('database');
    const databasePodName: string = await this.resolveExternalDbPodName(databaseNamespace, databaseContext);
    const databaseContainerName: string = 'postgresql';
    const credentials: {dbName: string; ownerUsername: string; ownerPassword: string} =
      await this.resolveMirrorDatabaseCredentials(mirrorNamespace, mirrorContext);

    return {
      context: databaseContext,
      namespace: databaseNamespace.name,
      podName: databasePodName,
      containerName: databaseContainerName,
      databaseName: credentials.dbName,
      ownerUsername: credentials.ownerUsername,
      ownerPassword: credentials.ownerPassword,
    };
  }

  /**
   * Execute pg_dump inside the DB pod and copy the SQL dump to backup output.
   * The output file is later consumed by restore-config.
   */
  private async exportExternalDatabaseBackup(
    outputDirectory: string,
    parameters: ExternalDatabaseParameters,
  ): Promise<string> {
    const databaseNamespace: NamespaceName = NamespaceName.of(parameters.namespace);
    const databasePodReference: PodReference = PodReference.of(databaseNamespace, PodName.of(parameters.podName));
    const databaseContainerReference: ContainerReference = ContainerReference.of(
      databasePodReference,
      ContainerName.of(parameters.containerName),
    );
    const databaseContainer: Container = this.k8Factory
      .getK8(parameters.context)
      .containers()
      .readByRef(databaseContainerReference);

    const dumpPathInContainer: string = '/tmp/database-dump.sql';
    await databaseContainer.execContainer([
      'env',
      `PGPASSWORD=${parameters.ownerPassword}`,
      'pg_dump',
      '-U',
      parameters.ownerUsername,
      '--clean',
      '--if-exists',
      parameters.databaseName,
      '-f',
      dumpPathInContainer,
    ]);
    await databaseContainer.copyFrom(dumpPathInContainer, outputDirectory);
    return PathEx.join(outputDirectory, 'database-dump.sql');
  }

  /**
   * Reset the target database schema before SQL import.
   * Restoring into a clean schema avoids partition/inherited-constraint cleanup failures.
   * Re-granting schema usage keeps mirror readers/writers functional after recreate.
   */
  private async resetExternalDatabaseSchema(
    databaseContainer: Container,
    credentials: {dbName: string; ownerUsername: string; ownerPassword: string},
  ): Promise<void> {
    const quotedOwnerUsername: string = `"${credentials.ownerUsername.replaceAll('"', '""')}"`;
    await databaseContainer.execContainer([
      'psql',
      `postgresql://${credentials.ownerUsername}:${credentials.ownerPassword}@localhost:5432/${credentials.dbName}`,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION ${quotedOwnerUsername}; GRANT USAGE ON SCHEMA public TO PUBLIC;`,
    ]);
  }

  /**
   * Restore an external DB SQL dump directly from the backup params file.
   * Reads external-database-params.json to locate the database pod, resets the schema,
   * and loads the dump. Does NOT scale the mirror importer or restart mirror services —
   * call this standalone (via restore-db) before mirror components are deployed.
   */
  private async restoreDatabaseDump(inputDirectory: string): Promise<void> {
    const databaseDumpPath: string = PathEx.join(inputDirectory, 'database-dump.sql');
    if (!fs.existsSync(databaseDumpPath)) {
      throw new SoloErrors.validation.backupDatabaseDumpNotFound(databaseDumpPath);
    }

    const parametersFromFile: ExternalDatabaseParameters = this.readExternalDatabaseParameters(inputDirectory, true);
    const databaseContext: Context = parametersFromFile.context;
    const databaseNamespace: NamespaceName = NamespaceName.of(parametersFromFile.namespace);
    const databasePodName: string =
      parametersFromFile.podName || (await this.resolveExternalDbPodName(databaseNamespace, databaseContext));
    const databaseContainerName: string = parametersFromFile.containerName || 'postgresql';
    const credentials: {dbName: string; ownerUsername: string; ownerPassword: string} = {
      dbName: parametersFromFile.databaseName,
      ownerUsername: parametersFromFile.ownerUsername,
      ownerPassword: parametersFromFile.ownerPassword,
    };

    const databaseK8: K8 = this.k8Factory.getK8(databaseContext);
    const databasePodReference: PodReference = PodReference.of(databaseNamespace, PodName.of(databasePodName));
    const databaseContainerReference: ContainerReference = ContainerReference.of(
      databasePodReference,
      ContainerName.of(databaseContainerName),
    );
    const databaseContainer: Container = databaseK8.containers().readByRef(databaseContainerReference);

    await this.resetExternalDatabaseSchema(databaseContainer, credentials);

    // pg_dump omits cluster-level roles that component Helm chart Flyway migrations
    // normally create (e.g. mirror_rest). When restore-db runs before those components
    // are deployed the GRANT statements in the dump reference non-existent roles and
    // abort with ON_ERROR_STOP=1. The backup directory contains the component secrets
    // placed there by restore-clusters; we derive each role name and its original
    // password from the USERNAME/PASSWORD key pairs in those secrets and pre-create the
    // roles here. Flyway then finds them already in place when each component deploys
    // (skipping migration re-run because flyway_schema_history is also in the dump),
    // so role passwords remain consistent with the K8s secrets.
    const rolesToCreate: Map<string, string> = this.readRolesFromBackupSecrets(
      inputDirectory,
      credentials.ownerUsername,
    );
    if (rolesToCreate.size > 0) {
      this.logger.info(
        `Pre-creating ${rolesToCreate.size} role(s) from backup secrets: ${[...rolesToCreate.keys()].join(', ')}`,
      );
      const createRolesSQL: string = [...rolesToCreate.entries()]
        .map(([username, password]: [string, string]): string => {
          const safeUsername: string = username.replaceAll('"', '""');
          const safePassword: string = password.replaceAll("'", "''");
          const safeRoleName: string = username.replaceAll("'", "''");
          return (
            `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${safeRoleName}') ` +
            `THEN ALTER ROLE "${safeUsername}" WITH LOGIN PASSWORD '${safePassword}'; ` +
            `ELSE CREATE ROLE "${safeUsername}" WITH LOGIN PASSWORD '${safePassword}'; END IF; END $$;`
          );
        })
        .join('\n');
      await databaseContainer.execContainer([
        'psql',
        `postgresql://${credentials.ownerUsername}:${credentials.ownerPassword}@localhost:5432/${credentials.dbName}`,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        createRolesSQL,
      ]);
    }

    await databaseContainer.copyTo(databaseDumpPath, '/tmp');
    await databaseContainer.execContainer([
      'psql',
      `postgresql://${credentials.ownerUsername}:${credentials.ownerPassword}@localhost:5432/${credentials.dbName}`,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '/tmp/database-dump.sql',
    ]);
  }

  /**
   * Scan backup cluster secret YAML files for USERNAME/PASSWORD key pairs and return a
   * map of role-name → password for roles that are not built-in PostgreSQL accounts.
   * Called before loading the dump so component-managed roles (e.g. mirror_rest) can be
   * pre-created with the correct passwords that match the K8s secrets already restored
   * into the cluster by restore-clusters.
   */
  private readRolesFromBackupSecrets(inputDirectory: string, ownerUsername: string): Map<string, string> {
    const builtInRoles: Set<string> = new Set([
      'postgres',
      ownerUsername.toLowerCase(),
      'readonly',
      'readonlyuser',
      'readwrite',
      'temporary_admin',
    ]);
    const roles: Map<string, string> = new Map();

    let clusterDirectories: string[];
    try {
      clusterDirectories = fs.readdirSync(inputDirectory).filter((name: string): boolean => {
        const fullPath: string = PathEx.join(inputDirectory, name);
        return fs.statSync(fullPath).isDirectory() && name !== 'states';
      });
    } catch {
      // best-effort: return empty map when input directory cannot be listed
      return roles;
    }

    for (const clusterDirectory of clusterDirectories) {
      const secretsDirectory: string = PathEx.join(inputDirectory, clusterDirectory, 'secrets');
      if (!fs.existsSync(secretsDirectory)) {
        continue;
      }

      let secretFiles: string[];
      try {
        secretFiles = fs.readdirSync(secretsDirectory).filter((name: string): boolean => name.endsWith('.yaml'));
      } catch {
        continue;
      }

      for (const secretFile of secretFiles) {
        let secretObject: unknown;
        try {
          secretObject = yaml.parse(fs.readFileSync(PathEx.join(secretsDirectory, secretFile), 'utf8'));
        } catch {
          continue;
        }
        if (
          !secretObject ||
          typeof secretObject !== 'object' ||
          !('data' in secretObject) ||
          typeof (secretObject as Record<string, unknown>).data !== 'object'
        ) {
          continue;
        }
        const data: Record<string, string> = (secretObject as {data: Record<string, string>}).data;

        for (const [key, encodedUsername] of Object.entries(data)) {
          if (!key.toUpperCase().endsWith('USERNAME')) {
            continue;
          }
          const passwordKey: string = key.slice(0, -'USERNAME'.length) + 'PASSWORD';
          const encodedPassword: string | undefined = data[passwordKey];
          if (!encodedPassword) {
            continue;
          }

          let username: string;
          let password: string;
          try {
            username = Buffer.from(encodedUsername, 'base64').toString('utf8').trim();
            password = Buffer.from(encodedPassword, 'base64').toString('utf8').trim();
          } catch {
            continue;
          }

          if (!username || !password) {
            continue;
          }
          if (builtInRoles.has(username.toLowerCase())) {
            continue;
          }
          if (username.toLowerCase().startsWith('pg_')) {
            continue;
          }
          roles.set(username, password);
        }
      }
    }

    return roles;
  }

  /**
   * Restore an external DB SQL dump when backup artifacts are present.
   * Importer is scaled down during restore, then runtime services are restarted.
   * Use this when mirror is already deployed. For pre-deploy restores use restoreDatabaseDump.
   */
  /**
   * Restore the external database dump independently of restore-config.
   * Run this BEFORE restore-network so mirror/relay/explorer deploy against
   * an already-populated database.
   * Command: solo config ops restore-db
   */
  public async restoreDb(argv: ArgvStruct): Promise<boolean> {
    await this.localConfig.load();
    this.configManager.update(argv);
    const inputDirectory: string = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';

    const tasks: SoloListr<Record<string, never>> = new Listr(
      [
        {
          title: 'Restore external database dump',
          task: async (_, task): Promise<void> => {
            await this.restoreDatabaseDump(inputDirectory);
            task.title = 'Restore external database dump: completed';
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error: unknown) {
      throw new SoloError('restore-db failed', error);
    }
    return true;
  }

  /**
   * Public entry point: bridge a record_file ↔ block-node gap, then bounce the importer.
   * Intended to be called from the Taskfile *after* the consensus node has been restarted
   * and started streaming live blocks downstream, so block node has blocks above the gap
   * for us to read `previous_block_root_hash` from.
   *
   * Command: solo config ops bridge-import-gap
   */
  public async bridgeImportGap(argv: ArgvStruct): Promise<boolean> {
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv, false);
    this.configManager.update(argv);

    const bridged: boolean = await this.bridgeBlockGapWithSyntheticRecordFileRows();
    if (bridged) {
      await this.restartMirrorImporter();
      this.logger.showUser(chalk.green('✓ Bridged importer record_file gap and bounced importer'));
    } else {
      this.logger.showUser(chalk.gray('No record_file gap detected; nothing to bridge'));
    }
    return true;
  }

  /**
   * Bridge any gap between importer's record_file MAX(index) and the first contiguous
   * block on block node by inserting synthetic record_file rows. Required because the CN
   * freeze block (and sometimes the block immediately after) never gets sealed and
   * published downstream - mirror node's BlockStreamVerifier strictly checks that an
   * incoming block's `previousHash` (from its BlockFooter) equals record_file[MAX].hash.
   * By inserting rows with the correct `hash` for the boundary, mirror's chain check
   * passes when it reads the first available block above the gap.
   *
   * Returns true when the importer should be bounced to pick up the new rows.
   */
  private async bridgeBlockGapWithSyntheticRecordFileRows(): Promise<boolean> {
    const externalDatabaseParameters: ExternalDatabaseParameters =
      await this.resolveExternalDatabaseParametersForBackup();

    const importerMax: number = await this.queryImporterMaxRecordFileIndex(externalDatabaseParameters);
    if (importerMax < 0) {
      this.logger.info('Bridge synthetic: record_file is empty, nothing to bridge');
      return false;
    }

    const blockNodes: BlockNodeStateSchema[] = this.remoteConfig.configuration?.state?.blockNodes || [];
    if (blockNodes.length === 0) {
      return false;
    }
    const blockNode: BlockNodeStateSchema = blockNodes[0];
    const blockNodeContext: Context = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
    const blockNodeNamespace: NamespaceName = NamespaceName.of(blockNode.metadata.namespace);
    const blockNodeId: number = Number(blockNode.metadata.id);
    const k8: K8 = this.k8Factory.getK8(blockNodeContext);
    const pods: Pod[] = await k8.pods().list(blockNodeNamespace, Templates.renderBlockNodeLabels(blockNodeId));
    if (pods.length === 0) {
      return false;
    }
    const blockNodeContainer: Container = k8
      .containers()
      .readByRef(ContainerReference.of(pods[0].podReference, constants.BLOCK_NODE_CONTAINER_NAME));

    const firstAvailableAbove: number = await this.findLowestAvailableBlockAbove(blockNodeContainer, importerMax);
    if (firstAvailableAbove < 0) {
      // No future blocks available yet; nothing to bridge.
      return false;
    }

    const boundaryHash: string | undefined = await this.extractPreviousBlockRootHash(
      blockNodeContainer,
      firstAvailableAbove,
    );
    if (!boundaryHash) {
      this.logger.showUser(
        chalk.yellow(
          `    ⚠ Could not extract previous_block_root_hash from block ${firstAvailableAbove}; gap bridging skipped`,
        ),
      );
      return false;
    }

    const databaseContainerReference: ContainerReference = ContainerReference.of(
      PodReference.of(
        NamespaceName.of(externalDatabaseParameters.namespace),
        PodName.of(externalDatabaseParameters.podName),
      ),
      ContainerName.of(externalDatabaseParameters.containerName),
    );
    const databaseContainer: Container = this.k8Factory
      .getK8(externalDatabaseParameters.context)
      .containers()
      .readByRef(databaseContainerReference);

    if (firstAvailableAbove === importerMax + 1) {
      // No block gap, but post-restore CN TSS re-keying produces replayed blocks with different
      // hashes from the backup copy in mirror's DB. Block (importerMax+1)'s previousHash diverges
      // from record_file[importerMax].hash, causing HashMismatchException in the importer.
      // Patch the boundary row so the chain check passes when mirror reads the first post-restore block.
      await databaseContainer.execContainer([
        'env',
        `PGPASSWORD=${externalDatabaseParameters.ownerPassword}`,
        'psql',
        '-U',
        externalDatabaseParameters.ownerUsername,
        '-d',
        externalDatabaseParameters.databaseName,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `UPDATE record_file SET hash = '${boundaryHash}' WHERE index = ${importerMax};`,
      ]);
      this.logger.showUser(
        chalk.gray(
          `    Patched record_file[${importerMax}].hash → block ${firstAvailableAbove}'s previousHash (post-restore TSS re-keying)`,
        ),
      );
      return true;
    }

    const placeholderHash: string =
      '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fake';
    const fileHashPlaceholder: string =
      '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fakehash';

    const insertStatements: string[] = [];
    for (let n: number = importerMax + 1; n <= firstAvailableAbove - 1; n++) {
      const isBoundary: boolean = n === firstAvailableAbove - 1;
      const hashValue: string = isBoundary ? boundaryHash : placeholderHash;
      const previousHashValue: string =
        n === importerMax + 1
          ? '(SELECT hash FROM record_file WHERE index = ' + importerMax + ')'
          : `'${placeholderHash}'`;
      const consensusBase: string = `(SELECT consensus_end + ${(n - importerMax) * 2 - 1} FROM record_file WHERE index = ${importerMax})`;
      const consensusEnd: string = `(SELECT consensus_end + ${(n - importerMax) * 2} FROM record_file WHERE index = ${importerMax})`;
      insertStatements.push(
        'INSERT INTO record_file (name, load_start, load_end, hash, prev_hash, consensus_start, consensus_end, count, digest_algorithm, version, file_hash, index, sidecar_count) ' +
          `VALUES ('${n.toString().padStart(19, '0')}.blk', 0, 0, '${hashValue}', ${previousHashValue}, ${consensusBase}, ${consensusEnd}, 0, 0, 7, '${fileHashPlaceholder}', ${n}, 0);`,
      );
    }

    const sql: string = insertStatements.join('\n');
    await databaseContainer.execContainer([
      'env',
      `PGPASSWORD=${externalDatabaseParameters.ownerPassword}`,
      'psql',
      '-U',
      externalDatabaseParameters.ownerUsername,
      '-d',
      externalDatabaseParameters.databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ]);

    this.logger.showUser(
      chalk.gray(
        `    Bridged record_file gap [${importerMax + 1}..${firstAvailableAbove - 1}]; record_file[${firstAvailableAbove - 1}].hash set to block ${firstAvailableAbove}'s previousHash`,
      ),
    );
    return true;
  }

  /**
   * Query the highest index currently in the importer's record_file via psql.
   */
  private async queryImporterMaxRecordFileIndex(parameters: ExternalDatabaseParameters): Promise<number> {
    const databaseContainerReference: ContainerReference = ContainerReference.of(
      PodReference.of(NamespaceName.of(parameters.namespace), PodName.of(parameters.podName)),
      ContainerName.of(parameters.containerName),
    );
    const databaseContainer: Container = this.k8Factory
      .getK8(parameters.context)
      .containers()
      .readByRef(databaseContainerReference);
    try {
      const output: string = await databaseContainer.execContainer([
        'env',
        `PGPASSWORD=${parameters.ownerPassword}`,
        'psql',
        '-U',
        parameters.ownerUsername,
        '-d',
        parameters.databaseName,
        '-tA',
        '-c',
        'SELECT COALESCE(MAX(index), -1) FROM record_file;',
      ]);
      const parsed: number = Number.parseInt((output || '').trim(), 10);
      return Number.isFinite(parsed) ? parsed : -1;
    } catch (error: unknown) {
      this.logger.info(`Failed to read importer record_file MAX: ${BackupRestoreCommand.getErrorMessage(error)}`);
      return -1;
    }
  }

  /**
   * Find the lowest block number on block node strictly above `floor`. Returns -1 if none.
   */
  private async findLowestAvailableBlockAbove(blockNodeContainer: Container, floor: number): Promise<number> {
    const output: string = await blockNodeContainer.execContainer([
      'sh',
      '-c',
      // -size +0c excludes any zero-byte placeholder files
      String.raw`find /opt/hiero/block-node/data -type f -name '*.blk*' -size +0c 2>/dev/null | sed 's|.*/0*\([0-9]\+\)\.blk.*|\1|' | sort -un | awk -v f=${floor} '$1 > f { print $1; exit }'`,
    ]);
    const trimmed: string = (output || '').trim();
    const parsed: number = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : -1;
  }

  /**
   * Decompress block N's .blk.zstd on the block node side (zstd is not in the image, but
   * Node's zlib provides it on the solo side), then scan the resulting bytes for the
   * BlockFooter wire pattern and extract `previous_block_root_hash` (field 1, 48 bytes).
   *
   * Wire format:
   *   - Block: `repeated BlockItem items = 1` → each BlockItem is `0a <varlen> <bytes>`
   *   - BlockItem.block_footer = field 12 (wire type 2) → tag byte `0x62` followed by varlen
   *   - BlockFooter.previous_block_root_hash = field 1 (bytes) → `0a 30 <48 bytes>`
   *
   * The full pattern inside the file: `62 <varlen> 0a 30 <48 bytes hash>`. We find the
   * first BlockFooter tag and the first `0a 30` length-prefix after it.
   */
  private async extractPreviousBlockRootHash(
    blockNodeContainer: Container,
    blockNumber: number,
  ): Promise<string | undefined> {
    const candidatePaths: string[] = [];
    const padded: string = blockNumber.toString().padStart(19, '0');
    const directorySegments: string = `${padded.slice(0, 3)}/${padded.slice(3, 6)}/${padded.slice(6, 9)}/${padded.slice(9, 12)}/${padded.slice(12, 15)}/${padded.slice(15, 16)}`;
    for (const root of ['/opt/hiero/block-node/data/live', '/opt/hiero/block-node/data/historic/staging']) {
      for (const extension of ['.blk.zstd', '.blk']) {
        candidatePaths.push(`${root}/${directorySegments}/${padded}${extension}`);
      }
    }

    let base64Content: string = '';
    let foundPath: string = '';
    for (const path_ of candidatePaths) {
      try {
        const probe: string = await blockNodeContainer.execContainer([
          'sh',
          '-c',
          `if [ -f "${path_}" ]; then echo OK; fi`,
        ]);
        if ((probe || '').trim() === 'OK') {
          base64Content = await blockNodeContainer.execContainer(['sh', '-c', `base64 "${path_}"`]);
          foundPath = path_;
          break;
        }
      } catch {
        // try next path
      }
    }
    if (!base64Content || !foundPath) {
      return undefined;
    }

    const rawCompressed: Buffer = Buffer.from(base64Content.replaceAll(/\s/g, ''), 'base64');
    let rawBytes: Buffer = rawCompressed;
    if (foundPath.endsWith('.blk.zstd')) {
      const zlibWithZstd: Record<string, unknown> = zlib as unknown as Record<string, unknown>;
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const zstdDecompressCandidate: unknown = zlibWithZstd['zstdDecompressSync'];
      if (typeof zstdDecompressCandidate !== 'function') {
        this.logger.info('zstd decompression unavailable in this Node.js runtime; cannot bridge gap');
        return undefined;
      }
      const zstdDecompress: ZstdDecompress = zstdDecompressCandidate as ZstdDecompress;
      rawBytes = zstdDecompress(rawCompressed);
    }

    // Search for the BlockFooter pattern. Tag byte 98 = (field 12 << 3) | wire-type-2.
    // The footer's first field is `previous_block_root_hash` = field 1 (bytes, 48 bytes
    // for SHA-384). Look for `98 <varint length> 10 48 <48 bytes>`. Length varint can be
    // 1 or 2 bytes. Using decimal literals to avoid hex casing rule conflicts.
    const blockFooterTag: number = 98; // (12 << 3) | 2
    const previousHashTag: number = 10; // (1 << 3) | 2
    const previousHashLength: number = 48; // SHA-384 byte length
    const varintHighBit: number = 128;
    for (let index: number = 0; index < rawBytes.length - 52; index++) {
      if (rawBytes[index] !== blockFooterTag) {
        continue;
      }
      // Skip the varint-encoded BlockFooter length
      let varintEnd: number = index + 1;
      while (varintEnd < rawBytes.length && (rawBytes[varintEnd] & varintHighBit) !== 0) {
        varintEnd++;
      }
      varintEnd++; // include the final byte
      if (
        varintEnd + 50 <= rawBytes.length &&
        rawBytes[varintEnd] === previousHashTag &&
        rawBytes[varintEnd + 1] === previousHashLength
      ) {
        return rawBytes.subarray(varintEnd + 2, varintEnd + 2 + previousHashLength).toString('hex');
      }
    }
    return undefined;
  }

  /**
   * Bounce the mirror importer Deployment so it reloads its cached `lastRecordFile`.
   * Mirror caches the head record file in memory; until the importer pod restarts, it
   * keeps requesting the same (already-gapped) block.
   */
  private async restartMirrorImporter(): Promise<void> {
    const mirrorNodes: MirrorNodeStateSchema[] = this.remoteConfig.configuration?.state?.mirrorNodes || [];
    if (mirrorNodes.length === 0) {
      return;
    }
    const mirrorNode: MirrorNodeStateSchema = mirrorNodes[0];
    const mirrorContext: Context = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
    const mirrorNamespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
    const mirrorReleaseName: string = Templates.renderMirrorNodeName(Number(mirrorNode.metadata.id));
    const importerDeploymentName: string = `${mirrorReleaseName}-importer`;
    await this.patchDeploymentRestartAnnotation(mirrorContext, mirrorNamespace, importerDeploymentName);
  }

  /**
   * Restart all consensus node pods so restored ConfigMaps/Secrets are applied.
   * This keeps restore deterministic without reinstalling components.
   */
  private async restartConsensusPods(namespace: NamespaceName, consensusNodes: ConsensusNode[]): Promise<void> {
    for (const consensusNode of consensusNodes) {
      const context: Context = helpers.extractContextFromConsensusNodes(consensusNode.name, consensusNodes);
      await this.restartPodsMatchingLabels(
        context,
        namespace,
        [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
        `consensus ${consensusNode.name}`,
      );
    }
  }

  /**
   * Rebuild relay HEDERA_NETWORK from currently assigned service endpoints.
   * Prefer in-cluster service DNS for same-cluster consensus nodes so relay does not rely on
   * externally-routed LoadBalancer IPs that may be unreachable from pod networking.
   */
  private async patchRelayHederaNetworkFromLiveServices(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
  ): Promise<void> {
    const relayNodes: RelayNodeStateSchema[] = this.remoteConfig.configuration.state.relayNodes || [];
    if (relayNodes.length === 0) {
      return;
    }

    const relayNode: RelayNodeStateSchema = relayNodes[0];
    const relayClusterReference: string = relayNode.metadata.cluster;
    const relayContext: Context = this.remoteConfig.getClusterRefs().get(relayClusterReference);
    const networkMap: Record<string, string> = {};
    for (const consensusNode of consensusNodes) {
      const nodeAlias: string = consensusNode.name;
      const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias as NodeAlias, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);

      const haProxyService: Service = await k8.services().read(namespace, `haproxy-${nodeAlias}-svc`);
      const nodeService: Service = await k8.services().read(namespace, `network-${nodeAlias}-svc`);
      const lbOrClusterEndpoint: string =
        haProxyService.status?.loadBalancer?.ingress?.[0]?.ip || haProxyService.spec?.clusterIP || '';
      const endpointPort: number =
        haProxyService.spec?.ports?.find((port): boolean => port.name === 'non-tls-grpc-client-port')?.port || 50_211;
      const accountId: string = nodeService.metadata?.labels?.['solo.hedera.com/account-id'] || '';
      const isSameClusterAsRelay: boolean = consensusNode.cluster === relayClusterReference;
      const endpointHost: string = isSameClusterAsRelay
        ? `network-${nodeAlias}.${namespace.toString()}.svc.cluster.local`
        : lbOrClusterEndpoint;

      if (!endpointHost || !accountId) {
        continue;
      }
      networkMap[`${endpointHost}:${endpointPort}`] = accountId;
    }

    if (Object.keys(networkMap).length === 0) {
      return;
    }

    const relayId: number = Number(relayNode.metadata.id);
    const relayName: string = Templates.renderRelayName(relayId);
    const relayK8: K8 = this.k8Factory.getK8(relayContext);
    const patchedData: Record<string, string> = {HEDERA_NETWORK: JSON.stringify(networkMap)};

    await relayK8.configMaps().update(namespace, relayName, patchedData);
    try {
      await relayK8.configMaps().update(namespace, `${relayName}-ws`, patchedData);
    } catch (error) {
      this.logger.info(`Skipping optional relay ws patch: ${error.message}`);
    }
  }

  /**
   * Apply block-node-specific restore adjustments after config/state restore.
   * Restore the captured `data/` and `verification/` content (so the new block node's tip
   * matches what existed at backup time), then keep `BLOCK_NODE_EARLIEST_MANAGED_BLOCK`
   * aligned with the configured value. tss-parameters.bin is restored as part of the
   * captured archive when present; if a separate tss-parameters.bin was emitted during
   * backup it is overlaid on top.
   */
  // Scan the captured CN-side block-stream archives for the freeze-time `.pnd` block file.
  // After freeze, each CN halts mid-production of the freeze block as a pending entry
  // (e.g. `000...142.pnd.gz`). The block number is the last 36-digit numeric segment of the
  // entry path. Returns the max block number found across all clusters, or -1 if no `.pnd`
  // entries are present (no freeze gap to bridge).
  /**
   * Resets blockStream.writerMode=FILE_AND_GRPC in every CN's application.properties ConfigMap
   * and pod filesystem.
   *
   * restore-config runs with BLOCK_STREAM_WRITER_MODE=FILE so CN does not stream to block-node
   * while the restore is in progress.  After applyBlockNodeRestoreFixes restores block data and
   * restarts the block-node, CN must stream in FILE_AND_GRPC mode so the freshly-started
   * block-node receives blocks.  consensus node start does NOT call updateBlockNodesJson, so
   * writerMode would remain FILE without this explicit reset.
   */
  private async resetConsensusNodeWriterModeForStreaming(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
  ): Promise<void> {
    const applicationPropertiesFileName: string = constants.APPLICATION_PROPERTIES;
    const applicationPropertiesFilePath: string = `${constants.HEDERA_HAPI_PATH}/data/config/${applicationPropertiesFileName}`;
    const targetDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

    for (const consensusNode of consensusNodes) {
      const context: Context = extractContextFromConsensusNodes(consensusNode.name as NodeAlias, consensusNodes);
      const k8: K8 = this.k8Factory.getK8(context);
      const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(
        namespace,
        consensusNode.name as NodeAlias,
      );

      const original: string = await container.execContainer(`cat ${applicationPropertiesFilePath}`);
      const updated: string = original
        .split('\n')
        .map((line: string): string =>
          line.startsWith('blockStream.writerMode=') ? 'blockStream.writerMode=FILE_AND_GRPC' : line,
        )
        .join('\n');

      if (updated === original) {
        continue;
      }

      await k8.configMaps().update(namespace, 'network-node-data-config-cm', {
        [applicationPropertiesFileName]: updated,
      });

      const temporaryFile: string = path.join(os.tmpdir(), applicationPropertiesFileName);
      fs.writeFileSync(temporaryFile, updated);
      try {
        await container.copyTo(temporaryFile, targetDirectory);
      } finally {
        fs.unlinkSync(temporaryFile);
      }

      this.logger.info(`Reset blockStream.writerMode to FILE_AND_GRPC for ${consensusNode.name}`);
    }
  }

  /**
   * Restores backed-up block data and TSS state to each BN pod so the block-verification
   * plugin initialises correctly after cluster recreate.
   *
   * Two-part fix for the post-restore verification deadlock:
   *
   * Part 1 — block data archive (blockNodeData.tar.gz):
   *   After destroy+restore, new PVCs leave data/ empty.  BlockFileRecentPlugin.init()
   *   scans data/live/ → empty → availableBlocks.max()=-1.  VerificationServicePlugin.start()
   *   sets lastVerifiedBlock=-1; nextExpectedBlock=0.  CN's first post-restore block (~145)
   *   satisfies blockNumber(145) > nextExpectedBlock(0) AND source==PUBLISHER, so
   *   ResultOrderingManager parks it waiting for blocks 0-144 that never arrive.
   *   Fix: extract the backup archive into /opt/hiero/block-node/ so data/live/ holds
   *   blocks 0-158 before BN starts.  On restart lastVerifiedBlock=158; nextExpectedBlock=159.
   *   CN's blocks 145-158 satisfy blockNumber ≤ 158 → no parking → proceed normally.
   *
   * TSS bootstrap file (tss-bootstrap-roster.json):
   *   Post-restore WRAPS blocks (CN v0.74+) must pass TSSVerifier.  TSSVerifier calls
   *   TSS.verifyTSS(tssData.ledgerId(), signature, hash).  BlockNodeApp.loadApplicationState()
   *   reads tss-bootstrap-roster.json on startup and feeds the TssData to all plugins via
   *   onContextUpdate().  Without this file, currentTssData()=null → MISSING_VERIFICATION_DATA
   *   for every WRAPS block.  Block N+1 (the first new block after restore) would fail and
   *   subsequent blocks would park forever waiting for N+1 to succeed.
   *   Fix: copy the backed-up tss-bootstrap-roster.json into application-state/ before
   *   restarting.  See restoreConsensusNodeTssKeys() for why the wrapsVerificationKey in the
   *   file must also match the running CN's DKG output.
   *
   * importConfigMaps() already restored the correct EMB from backup — do NOT overwrite it.
   * importConfigMaps() also sets PRODUCER_DUPLICATE_BLOCK_SKIP_WINDOW=10 so that CN's
   * post-restore blocks (which are typically ~7 behind BN's lastPersistedBlockNumber) receive
   * SKIP instead of END_DUPLICATE — CN v0.74 cannot recover from DUPLICATE_BLOCK and stops
   * streaming.  With the higher window the blocks get SKIP (stream stays open) and CN
   * fast-forwards until BN accepts the first truly new block via streamBeforeEmbOrElse.
   */
  private async applyBlockNodeRestoreFixes(inputDirectory: string): Promise<void> {
    // Discover block nodes from the backup directory rather than remote config state.
    // state.blockNodes may be empty if the in-memory remote config was loaded before
    // restore-network's block node add calls persisted to Kubernetes. The backup directory
    // is the authoritative source: each cluster's blockNodeData/ holds one archive per pod.
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const namespace: NamespaceName = this.remoteConfig.getNamespace();

    for (const [clusterReference, blockNodeContext] of clusterReferences.entries()) {
      const blockNodeDataDirectory: string = PathEx.join(inputDirectory, clusterReference, 'blockNodeData');
      if (!fs.existsSync(blockNodeDataDirectory)) {
        continue;
      }

      const archives: string[] = fs
        .readdirSync(blockNodeDataDirectory)
        .filter((fileName: string): boolean => fileName.endsWith('-blockNodeData.tar.gz'));

      if (archives.length === 0) {
        continue;
      }

      const k8: K8 = this.k8Factory.getK8(blockNodeContext);

      for (const archiveName of archives) {
        // Archive is named {podName}-blockNodeData.tar.gz; the podName encodes the ID.
        const podName: string = archiveName.slice(0, -'-blockNodeData.tar.gz'.length);
        const idMatch: RegExpMatchArray | null = podName.match(/^block-node-(\d+)-\d+$/);
        if (!idMatch) {
          this.logger.info(`Skipping unexpected archive name: ${archiveName}`);
          continue;
        }
        const blockNodeId: number = Number(idMatch[1]);

        const podReference: PodReference = PodReference.of(namespace, PodName.of(podName));
        const containerReference: ContainerReference = ContainerReference.of(
          podReference,
          constants.BLOCK_NODE_CONTAINER_NAME,
        );
        const container: Container = k8.containers().readByRef(containerReference);

        // Stabilizing restart: importConfigMaps may have triggered a rolling pod restart that is
        // still in progress (the configmap checksum annotation races with this code).  Explicitly
        // delete the pod and wait for the replacement to be Ready before touching the container
        // filesystem.  This eliminates a window where copyTo targets a Terminating pod.
        const beforeStabilizingDelete: Date = new Date();
        await k8
          .pods()
          .delete(podReference)
          .catch((): void => {
            // best-effort: pod may not exist; StatefulSet will recreate it
          });
        await k8
          .pods()
          .waitForReadyStatus(
            namespace,
            Templates.renderBlockNodeLabels(blockNodeId),
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
            beforeStabilizingDelete,
          );

        // Copy the backed-up tss-bootstrap-roster.json into application-state/ so
        // BlockNodeApp.loadApplicationState() provides TssData to all plugins on restart.
        // Without this file, TSSVerifier returns MISSING_VERIFICATION_DATA for every WRAPS
        // block and the first new post-restore block (159) can never be written to disk.
        // Archive path: {inputDirectory}/{cluster}/blockNodeData/{podName}/tss-bootstrap-roster.json
        const localTssFilePath: string = PathEx.join(blockNodeDataDirectory, podName, 'tss-bootstrap-roster.json');
        if (fs.existsSync(localTssFilePath)) {
          await container.copyTo(localTssFilePath, '/opt/hiero/block-node/application-state/').catch((): void => {
            // best-effort: tss file copy failed; WRAPS verification may fail but block data restore still helps
            this.logger.info(`TSS file copy failed for ${podName}; WRAPS blocks may not verify`);
          });
          this.logger.info(`Restored tss-bootstrap-roster.json to ${podName}; TSS data will be loaded on restart`);
        } else {
          this.logger.info(`No tss-bootstrap-roster.json found at ${localTssFilePath}; WRAPS blocks may not verify`);
        }

        // Restore the block data archive so BN starts with lastVerifiedBlock=N (the backed-up
        // maximum).  CN's state restore point is typically a few blocks before N; CN will
        // reproduce those blocks first, which BN skips (already present), and then produce block
        // N+1, which BN accepts as the first new block.  Without the archive, lastVerifiedBlock=-1
        // and BN parks every post-restore block waiting for blocks 0 through N-1 that CN can
        // never provide — block streaming never starts.
        // Archive layout: {cluster}/blockNodeData/{podName}-blockNodeData.tar.gz expands to data/.
        // Use -m (--touch) so tar does not try to set mtimes on PVC files, which triggers
        // EPERM on some Kubernetes volume drivers.
        const localArchivePath: string = PathEx.join(blockNodeDataDirectory, archiveName);
        const archiveInPod: string = `/tmp/${archiveName}`;
        await container.copyTo(localArchivePath, '/tmp/');
        await container
          .execContainer([
            'sh',
            '-c',
            `cd /opt/hiero/block-node && tar xzmf "${archiveInPod}" -m 2>/dev/null; rm -f "${archiveInPod}"; true`,
          ])
          .catch((): void => {
            // best-effort: archive may have minor warnings on PVC mounts; block data is likely intact
            this.logger.info(`Block data archive extraction had warnings for ${podName}; continuing`);
          });
        this.logger.info(
          `Restored block data archive to ${podName}; lastVerifiedBlock will initialise to the backed-up maximum`,
        );

        // Restart BN so it loads the restored block data and tss-bootstrap-roster.json.
        const beforeBlockNodeDelete: Date = new Date();
        await k8.pods().delete(podReference);
        await k8
          .pods()
          .waitForReadyStatus(
            namespace,
            Templates.renderBlockNodeLabels(blockNodeId),
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
            beforeBlockNodeDelete,
          );
      }
    }
  }

  /**
   * Copy backed-up CN TSS key archives into each running CN pod (data/keys/tss/) without
   * restarting.  The pod restart is deferred to restartConsensusPods so TSS keys land on the
   * PVC before the pods are cycled, eliminating any race between this restore and Branch B's
   * concurrent pod restart.
   */
  private async restoreConsensusNodeTssKeys(inputDirectory: string): Promise<void> {
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    for (const consensusNode of consensusNodes) {
      const tssArchivePath: string = PathEx.join(
        inputDirectory,
        consensusNode.cluster,
        'nodeData',
        consensusNode.name,
        'tss-keys.tar.gz',
      );
      if (!fs.existsSync(tssArchivePath)) {
        this.logger.info(`No TSS key backup for ${consensusNode.name}; CN will run fresh DKG on start`);
        continue;
      }
      const cnContext: Context = extractContextFromConsensusNodes(consensusNode.name, consensusNodes);
      const cnContainer: Container = await new K8Helper(cnContext).getConsensusNodeRootContainer(
        namespace,
        consensusNode.name,
      );
      const archiveInPod: string = '/tmp/tss-keys.tar.gz';
      const keysDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/keys`;
      await cnContainer.copyTo(tssArchivePath, '/tmp/');
      await cnContainer
        .execContainer([
          'sh',
          '-c',
          `tar xzmf "${archiveInPod}" -C "${keysDirectory}" 2>/dev/null; rm -f "${archiveInPod}"; true`,
        ])
        .catch((): void => {
          // best-effort: keys are likely extracted even with minor utime warnings on PVC mounts
          this.logger.info(`TSS key extraction had warnings for ${consensusNode.name}; continuing`);
        });
      this.logger.info(`Restored TSS keys for ${consensusNode.name} to PVC; pod restart will load them`);
    }
  }

  /**
   * Restore all component configurations
   * Command: solo config ops restore-config
   */
  public async restoreConfig(argv: ArgvStruct): Promise<boolean> {
    // Load configurations
    await this.localConfig.load();
    // Restore can run while some components are temporarily down/missing (for example importer scaled to zero).
    // Load remote config without strict pod validation and let restore tasks reconcile runtime state.
    await this.remoteConfig.loadAndValidate(argv, false);

    this.configManager.update(argv);

    const inputDirectory: string = this.configManager.getFlag<string>(flags.inputDir) || './solo-backup';
    const quiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);
    const deployment: string = this.configManager.getFlag<string>(flags.deployment);
    // Get configuration data
    const namespace: NamespaceName = this.remoteConfig.getNamespace();
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const nodeAliases: string[] = consensusNodes.map((node: ConsensusNode): string => node.name);

    // Restore configmaps, secrets, and state files
    interface RestoreContext {
      configMapCount: number;
      secretCount: number;
      config: Record<string, unknown>;
    }

    const tasks: SoloListr<RestoreContext> = new Listr(
      [
        {
          title: 'Initialize restore configuration',
          task: async (context_, task): Promise<void> => {
            // Build pod references map
            const podReferences: Record<string, PodReference> = {};

            for (const nodeAlias of nodeAliases) {
              const context: Context = extractContextFromConsensusNodes(nodeAlias as NodeAlias, consensusNodes);
              const k8: K8 = this.k8Factory.getK8(context);
              const pods: Pod[] = await k8
                .pods()
                .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

              if (pods.length > 0) {
                podReferences[nodeAlias] = pods[0].podReference;
              }
            }

            // Initialize config object expected by uploadStateFiles
            context_.config = {
              namespace,
              consensusNodes,
              nodeAliases,
              podRefs: podReferences,
              stateFile: inputDirectory, // Not used since we pass stateFileDirectory
            };

            task.title = 'Initialize restore configuration: completed';
          },
        },
        {
          title: 'Freeze network (if running)',
          task: async (context_, task): Promise<void> => {
            try {
              // Use the existing freeze command to freeze the network
              await invokeSoloCommand(
                'Freeze network',
                'consensus network freeze',
                (): string[] => {
                  const argv: string[] = CommandHelpers.newArgv();
                  argv.push('consensus', 'network', 'freeze', '--deployment', deployment);
                  return argv;
                },
                this.taskList,
              ).task(context_, task);

              task.title = 'Freeze network: completed';
            } catch (error: unknown) {
              // Network is not running or already frozen, which is fine for restore
              const errorMessage: string = error instanceof Error ? error.message : String(error);
              this.logger.info(`Network freeze skipped: ${errorMessage}`);
              task.title = 'Freeze network: skipped (network not running)';
            }
          },
        },
        // Phase 2: import ConfigMaps and Secrets in parallel — they target independent
        // cluster resources and have no ordering dependency between them.
        {
          title: 'Import ConfigMaps and Secrets',
          task: (_, tw): SoloListr<AnyListrContext> =>
            tw.newListr(
              [
                {
                  title: 'Import ConfigMaps',
                  task: async (context_, task): Promise<void> => {
                    context_.configMapCount = await this.importConfigMaps(inputDirectory);
                    task.title = `Import ConfigMaps: ${context_.configMapCount} imported`;
                  },
                },
                {
                  title: 'Import Secrets',
                  task: async (context_, task): Promise<void> => {
                    context_.secretCount = await this.importSecrets(inputDirectory);
                    task.title = `Import Secrets: ${context_.secretCount} imported`;
                  },
                },
              ],
              constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY,
            ),
        },
        // Phase 3: three independent branches run in parallel after imports complete.
        //
        // Branch A: restart Redis so it picks up restored secret credentials (~3m41s).
        // Branch B: restore CN TSS keys to PVC → restart CN pods (to mount restored
        //           ConfigMaps/Secrets and pick up TSS keys) → wait → stop → upload state.
        //           TSS key restore runs first so the keys are on the PVC before pod restart,
        //           eliminating any race with Branch C's block-node fixes.
        // Branch C: relay patch + block node fixes — none depend on A or B.
        //
        // Total wall time = max(A, B, C) ≈ Redis restart time, instead of A + B + C.
        {
          title: 'Restore state',
          task: (_, tw): SoloListr<AnyListrContext> =>
            tw.newListr(
              [
                // Branch A: Redis restart
                {
                  title: 'Restart mirror runtime dependencies',
                  task: async (_, task): Promise<void> => {
                    await this.restartMirrorRuntimeDependencies(namespace);
                    task.title = 'Restart mirror runtime dependencies: completed';
                  },
                },
                // Branch B: restore CN TSS keys → CN restart → wait → stop → restore logs → upload state (sequential)
                {
                  title: 'Restore consensus node state',
                  task: (_, tw2): SoloListr<AnyListrContext> =>
                    tw2.newListr(
                      [
                        {
                          title: 'Restore consensus node TSS keys to PVC',
                          task: async (_, task): Promise<void> => {
                            await this.restoreConsensusNodeTssKeys(inputDirectory);
                            task.title = 'Restore consensus node TSS keys to PVC: completed';
                          },
                        },
                        {
                          title: 'Restart consensus pods to pick up restored ConfigMaps/Secrets',
                          task: async (context_, task): Promise<void> => {
                            await this.restartConsensusPods(namespace, consensusNodes);
                            context_.config.podRefs = await this.buildConsensusPodReferences(
                              namespace,
                              consensusNodes,
                              nodeAliases,
                            );
                            task.title = 'Restart consensus pods to pick up restored ConfigMaps/Secrets: completed';
                          },
                        },
                        {
                          title: 'Wait for consensus node pods',
                          task: async (_, task): Promise<void> => {
                            await this.waitForConsensusPods();
                            task.title = 'Wait for consensus node pods: completed';
                          },
                        },
                        {
                          title: 'Stop consensus nodes before restoring state',
                          task: async (context_, task): Promise<void> => {
                            await this.nodeCommandTasks.stopNodes('nodeAliases').task(context_, task);
                            task.title = 'Stop consensus nodes before restoring state: completed';
                          },
                        },
                        {
                          title: 'Restore Logs and Configs',
                          task: async (_, task): Promise<void> => {
                            await this.restoreLogsAndConfigs(inputDirectory);
                            task.title = 'Restore Logs and Configs: completed';
                          },
                        },
                        this.nodeCommandTasks.uploadStateFiles(false, inputDirectory),
                      ],
                      {concurrent: false, rendererOptions: {collapseSubtasks: false}},
                    ),
                },
                // Branch C: relay patch, block node fixes, and DB restore are mutually
                // independent and independent of A and B — run all three in parallel.
                {
                  title: 'Patch components and restore database',
                  task: (_, tw2): SoloListr<AnyListrContext> =>
                    tw2.newListr(
                      [
                        {
                          title: 'Patch relay HEDERA_NETWORK from live services',
                          task: async (_, task): Promise<void> => {
                            await this.patchRelayHederaNetworkFromLiveServices(namespace, consensusNodes);
                            task.title = 'Patch relay HEDERA_NETWORK from live services: completed';
                          },
                        },
                        {
                          title: 'Apply block node restore fixes',
                          task: async (_, task): Promise<void> => {
                            await this.applyBlockNodeRestoreFixes(inputDirectory);
                            task.title = 'Apply block node restore fixes: completed';
                          },
                        },
                      ],
                      constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY,
                    ),
                },
              ],
              constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY,
            ),
        },
        {
          title: 'Reset consensus node blockStream.writerMode to FILE_AND_GRPC',
          task: async (_, task): Promise<void> => {
            await this.resetConsensusNodeWriterModeForStreaming(namespace, consensusNodes);
            task.title = 'Reset consensus node blockStream.writerMode to FILE_AND_GRPC: completed';
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      const context_: RestoreContext = await tasks.run();

      if (!quiet) {
        this.logger.showUser('');
        this.logger.showUser(
          chalk.green(
            `✅ Restore completed: ${context_.configMapCount} configmap(s) and ${context_.secretCount} secret(s) imported`,
          ),
        );
      }
    } catch (error) {
      this.logger.showUser(chalk.red(`❌ Error during restore: ${error.message}`));
      throw error;
    }

    return true;
  }

  /**
   * Read the remote config from a local YAML file
   */
  private async readRemoteConfigFile(configFilePath: string): Promise<Record<string, unknown>> {
    this.logger.showUser(chalk.cyan(`Reading remote config from file: ${configFilePath}`));

    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        throw new SoloErrors.validation.backupConfigNotFound(configFilePath);
      }

      // Read file content
      const fileContent: string = fs.readFileSync(configFilePath, 'utf8');

      // Parse YAML
      const configData: Record<string, unknown> | null = yaml.parse(fileContent);

      if (!configData) {
        throw new SoloErrors.validation.backupConfigInvalid();
      }

      this.logger.showUser(chalk.green('✓ Read config file successfully'));
      return configData as Record<string, unknown>;
    } catch (error) {
      throw new SoloErrors.validation.backupConfigReadFailed(configFilePath, error);
    }
  }

  /**
   * Parse the config data and instantiate RemoteConfig object
   */
  private parseRemoteConfig(configData: Record<string, unknown>): RemoteConfig {
    this.logger.showUser(chalk.cyan('Parsing remote configuration...'));

    try {
      let actualConfigData: Record<string, unknown> = configData;

      // Check if this is a ConfigMap wrapper (has apiVersion, kind, data)
      if (configData.kind === 'ConfigMap' && configData.data) {
        this.logger.showUser(chalk.gray('  Detected ConfigMap format, extracting remote config data...'));

        // Extract the remote config from the ConfigMap data field
        const remoteConfigKey: string = 'remote-config-data';
        const remoteConfigYaml: unknown = (configData.data as Record<string, unknown>)[remoteConfigKey];

        if (!remoteConfigYaml) {
          throw new SoloErrors.validation.backupConfigMapKeyMissing(remoteConfigKey);
        }

        // Parse the YAML string to get the actual config object
        actualConfigData = yaml.parse(remoteConfigYaml as string);
        this.logger.showUser(chalk.gray('  ✓ Extracted remote config from ConfigMap'));
      }

      // Transform to RemoteConfigSchema instance
      const remoteConfigSchema: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, actualConfigData, {
        excludeExtraneousValues: true,
      });

      const remoteConfig: RemoteConfig = new RemoteConfig(remoteConfigSchema);
      this.logger.showUser(chalk.green('✓ Remote configuration parsed successfully'));

      return remoteConfig;
    } catch (error) {
      throw new SoloErrors.validation.backupConfigParseFailed(error);
    }
  }

  private buildDeploymentTasks(): SoloListrTask<AnyListrContext>[] {
    const tasks: SoloListrTask<AnyListrContext>[] = [];

    return [
      ...tasks,
      // Keys generation task
      {
        title: 'Generate consensus node keys',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<SoloSubTaskResult> => {
          return CommandHelpers.subTaskSoloCommand(
            KeysCommandDefinition.KEYS_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.generateGossipKeys),
                CommandHelpers.optionFromFlag(flags.generateTlsKeys),
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment as string,
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases as string,
              );
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      ...this.buildBlockNodeTasks(),
      // Consensus network deploy task
      {
        title: 'Deploy consensus network',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<SoloSubTaskResult> => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.DEPLOY_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();

              // Use options from options file if provided, otherwise use default
              if (context_.componentOptions?.consensus) {
                // Add command name first
                argv.push(
                  ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                  ...context_.componentOptions.consensus,
                );
              } else {
                // Default behavior
                argv.push(
                  ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                  CommandHelpers.optionFromFlag(flags.deployment),
                  context_.deployment as string,
                  CommandHelpers.optionFromFlag(flags.persistentVolumeClaims),
                );

                // Enable load balancer if multiple clusters are detected
                if (context_.clusters && Array.isArray(context_.clusters) && context_.clusters.length > 1) {
                  argv.push(CommandHelpers.optionFromFlag(flags.loadBalancerEnabled));
                  this.logger.info(`Multiple clusters detected (${context_.clusters.length}), enabling load balancer`);
                }

                if (context_.versions?.consensusNode) {
                  argv.push(
                    CommandHelpers.optionFromFlag(flags.consensusNodeVersion),
                    context_.versions.consensusNode.toString(),
                  );
                }
                if (context_.versions?.chart) {
                  argv.push(CommandHelpers.optionFromFlag(flags.soloChartVersion), context_.versions.chart.toString());
                }
              }
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      // Consensus node setup task
      {
        title: 'Setup consensus nodes',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<SoloSubTaskResult> => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.SETUP_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases as string,
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment as string,
              );
              if (context_.versions?.consensusNode) {
                argv.push(
                  CommandHelpers.optionFromFlag(flags.consensusNodeVersion),
                  context_.versions.consensusNode.toString(),
                );
              }
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      // Consensus node start task
      {
        title: 'Start consensus nodes',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.consensusNodes || context_.deploymentState.consensusNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<SoloSubTaskResult> => {
          return CommandHelpers.subTaskSoloCommand(
            ConsensusCommandDefinition.START_COMMAND,
            taskListWrapper,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.START_COMMAND.split(' '),
                CommandHelpers.optionFromFlag(flags.deployment),
                context_.deployment,
                CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                context_.nodeAliases,
              );
              return CommandHelpers.argvPushGlobalFlags(argv);
            },
            this.taskList,
          );
        },
      },
      ...this.buildMirrorNodeTasks(),
      ...this.buildRelayNodeTasks(),
      ...this.buildExplorerTasks(),
    ];
  }

  /**
   * Build block node deployment tasks
   */
  private buildBlockNodeTasks(): SoloListrTask<AnyListrContext>[] {
    return [
      {
        title: 'Deploy block nodes',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.blockNodes || context_.deploymentState.blockNodes.length === 0,
        task: async (context_, taskListWrapper): Promise<SoloListr<AnyListrContext>> => {
          const blockNodeTasks: SoloListrTask<AnyListrContext>[] = [];

          for (const blockNode of context_.deploymentState.blockNodes) {
            blockNodeTasks.push({
              title: `Deploy block node ${blockNode.metadata.id}`,
              task: async (_, subTaskListWrapper): Promise<SoloSubTaskResult> => {
                // Switch to the correct cluster context for this block node
                const clusterReference: string | undefined = blockNode.metadata.cluster;
                if (blockNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${blockNode.metadata.context}' for block node ${blockNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(blockNode.metadata.context);
                  k8.contexts().updateCurrent(blockNode.metadata.context);
                }

                return subTaskSoloCommand(
                  BlockCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.block) {
                      // Add command name first, then the options file args.
                      // Always append the backup state's cluster-ref last so it wins over
                      // any --cluster-ref in the options file (Yargs takes the last value
                      // for a repeated flag). This ensures each block node is deployed on
                      // its original cluster even when the options file hard-codes a cluster.
                      argv.push(
                        ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                        ...context_.componentOptions.block,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                    } else {
                      // Default behavior
                      argv.push(
                        ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.blockNodeChart) {
                        argv.push(optionFromFlag(flags.blockNodeVersion), context_.versions.blockNodeChart.toString());
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(blockNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build mirror node deployment tasks
   */
  private buildMirrorNodeTasks(): SoloListrTask<AnyListrContext>[] {
    return [
      {
        title: 'Deploy mirror nodes',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.mirrorNodes ||
          context_.deploymentState.mirrorNodes.length === 0 ||
          (Array.isArray(context_.componentOptions?.mirror) && context_.componentOptions.mirror.length === 0),
        task: async (context_, taskListWrapper): Promise<SoloListr<AnyListrContext>> => {
          const mirrorNodeTasks: SoloListrTask<AnyListrContext>[] = [];

          for (const mirrorNode of context_.deploymentState.mirrorNodes) {
            mirrorNodeTasks.push({
              title: `Deploy mirror node ${mirrorNode.metadata.id}`,
              task: async (_, subTaskListWrapper): Promise<SoloSubTaskResult> => {
                // Switch to the correct cluster context for this mirror node
                const clusterReference: string | undefined = mirrorNode.metadata.cluster;
                if (mirrorNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${mirrorNode.metadata.context}' for mirror node ${mirrorNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(mirrorNode.metadata.context);
                  k8.contexts().updateCurrent(mirrorNode.metadata.context);
                }

                return subTaskSoloCommand(
                  MirrorCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.mirror) {
                      // Add command name first
                      argv.push(...MirrorCommandDefinition.ADD_COMMAND.split(' '), ...context_.componentOptions.mirror);
                    } else {
                      // Default behavior
                      argv.push(
                        ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.mirrorNodeChart) {
                        argv.push(
                          optionFromFlag(flags.mirrorNodeVersion),
                          context_.versions.mirrorNodeChart.toString(),
                        );
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(mirrorNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build relay node deployment tasks
   */
  private buildRelayNodeTasks(): SoloListrTask<AnyListrContext>[] {
    return [
      {
        title: 'Deploy relay nodes',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.relayNodes ||
          context_.deploymentState.relayNodes.length === 0 ||
          (Array.isArray(context_.componentOptions?.relay) && context_.componentOptions.relay.length === 0),
        task: async (context_, taskListWrapper): Promise<SoloListr<AnyListrContext>> => {
          const relayNodeTasks: SoloListrTask<AnyListrContext>[] = [];

          for (const relayNode of context_.deploymentState.relayNodes) {
            relayNodeTasks.push({
              title: `Deploy relay node ${relayNode.metadata.id}`,
              task: async (_, subTaskListWrapper): Promise<SoloSubTaskResult> => {
                // Switch to the correct cluster context for this relay node
                const clusterReference: string | undefined = relayNode.metadata.cluster;
                if (relayNode.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${relayNode.metadata.context}' for relay node ${relayNode.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(relayNode.metadata.context);
                  k8.contexts().updateCurrent(relayNode.metadata.context);
                }

                return subTaskSoloCommand(
                  RelayCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.relay) {
                      // Add command name first
                      argv.push(...RelayCommandDefinition.ADD_COMMAND.split(' '), ...context_.componentOptions.relay);
                    } else {
                      // Default behavior
                      argv.push(
                        ...RelayCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment,
                        CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                        context_.nodeAliases,
                      );
                      // Add cluster ref if node has cluster metadata
                      if (clusterReference) {
                        argv.push(optionFromFlag(flags.clusterRef), clusterReference);
                      }
                      if (context_.versions?.jsonRpcRelayChart) {
                        argv.push(optionFromFlag(flags.relayVersion), context_.versions.jsonRpcRelayChart.toString());
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(relayNodeTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build explorer deployment tasks
   */
  private buildExplorerTasks(): SoloListrTask<AnyListrContext>[] {
    return [
      {
        title: 'Deploy explorers',
        skip: (context_: AnyListrContext): boolean =>
          !context_.deploymentState?.explorers ||
          context_.deploymentState.explorers.length === 0 ||
          (Array.isArray(context_.componentOptions?.explorer) && context_.componentOptions.explorer.length === 0),
        task: async (context_, taskListWrapper): Promise<SoloListr<AnyListrContext>> => {
          const explorerTasks: SoloListrTask<AnyListrContext>[] = [];

          for (const explorer of context_.deploymentState.explorers) {
            explorerTasks.push({
              title: `Deploy explorer ${explorer.metadata.id}`,
              task: async (_, subTaskListWrapper): Promise<SoloSubTaskResult> => {
                // Switch to the correct cluster context for this explorer
                const clusterReference: string | undefined = explorer.metadata.cluster;
                if (explorer.metadata.context) {
                  this.logger.info(
                    `Switching to cluster '${explorer.metadata.context}' for explorer ${explorer.metadata.id}`,
                  );
                  const k8: K8 = this.k8Factory.getK8(explorer.metadata.context);
                  k8.contexts().updateCurrent(explorer.metadata.context);
                }

                return subTaskSoloCommand(
                  ExplorerCommandDefinition.ADD_COMMAND,
                  subTaskListWrapper,
                  (): string[] => {
                    const argv: string[] = CommandHelpers.newArgv();

                    // Use options from options file if provided, otherwise use default
                    if (context_.componentOptions?.explorer) {
                      // Add command name first
                      argv.push(
                        ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                        ...context_.componentOptions.explorer,
                      );
                    } else {
                      // Default behavior
                      argv.push(
                        ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                        CommandHelpers.optionFromFlag(flags.deployment),
                        context_.deployment as string,
                        optionFromFlag(flags.clusterRef),
                        clusterReference,
                      );
                      if (context_.versions?.explorerChart) {
                        argv.push(optionFromFlag(flags.explorerVersion), context_.versions.explorerChart.toString());
                      }
                    }
                    return CommandHelpers.argvPushGlobalFlags(argv);
                  },
                  this.taskList,
                );
              },
            });
          }

          return taskListWrapper.newListr(explorerTasks, {
            concurrent: false,
            rendererOptions: {collapseSubtasks: false},
          });
        },
      },
    ];
  }

  /**
   * Build scan backup directory task
   */
  private buildScanBackupDirectoryTask(): SoloListrTask<Record<string, unknown>> {
    return {
      title: 'Scan backup directory structure',
      task: async (context_: Record<string, unknown>): Promise<void> => {
        const inputDirectory: string = context_.inputDirectory as string;

        // Verify input directory exists
        if (!fs.existsSync(inputDirectory)) {
          throw new SoloErrors.validation.backupInputDirectoryNotFound(inputDirectory);
        }

        // Read subdirectories
        const entries: fs.Dirent[] = fs.readdirSync(inputDirectory, {withFileTypes: true});
        const clusterReferenceDirectories: string[] = entries
          .filter((entry): boolean => entry.isDirectory())
          .map((entry): string => entry.name);

        if (clusterReferenceDirectories.length === 0) {
          throw new SoloErrors.validation.backupNoClusterDirs(inputDirectory);
        }

        // Store cluster reference directory names for mapping to kubectl contexts later
        context_.contextDirs = clusterReferenceDirectories;

        this.logger.showUser(
          chalk.cyan(
            `\nFound ${clusterReferenceDirectories.length} cluster(s): ${clusterReferenceDirectories.join(', ')}`,
          ),
        );

        // Read solo-remote-config.yaml from the first cluster's configmaps directory
        const firstClusterReference: string = clusterReferenceDirectories[0];
        const configPath: string = PathEx.join(
          inputDirectory,
          firstClusterReference,
          'configmaps',
          'solo-remote-config.yaml',
        );

        if (!fs.existsSync(configPath)) {
          throw new SoloErrors.validation.backupClusterValidationFailed(configPath);
        }

        this.logger.showUser(chalk.cyan(`Reading configuration from: ${configPath}`));

        // Read and parse the config file
        const configData: Record<string, unknown> = await this.readRemoteConfigFile(configPath);
        context_.remoteConfig = this.parseRemoteConfig(configData);
        const remoteConfig: RemoteConfig = context_.remoteConfig as RemoteConfig;
        context_.deploymentState = remoteConfig.state;
        context_.versions = remoteConfig.versions;

        // Use clusters from config file (they contain cluster reference names, not kubectl context names)
        if (!remoteConfig.clusters || remoteConfig.clusters.length === 0) {
          throw new SoloErrors.validation.backupNoClusterInfo();
        }

        context_.clusters = remoteConfig.clusters;

        // Log cluster information from config
        const clusterNames: string = (context_.clusters as Array<{name: string}>)
          .map((c: {name: string}): string => c.name)
          .join(', ');
        this.logger.showUser(chalk.cyan(`Clusters from config: ${clusterNames}`));

        // Validate: number of cluster directories should match number of clusters in config
        const clusters: ClusterSchema[] = (context_.clusters as ClusterSchema[]) || [];
        if (clusterReferenceDirectories.length !== clusters.length) {
          this.logger.showUser(
            chalk.yellow(
              `Warning: Found ${clusterReferenceDirectories.length} cluster directory(ies) but config has ${clusters.length} cluster(s)`,
            ),
          );
        }

        // Extract deployment info from config (use first cluster)
        const clusterInfo: ClusterSchema = clusters[0];
        context_.namespace = NamespaceName.of(clusterInfo.namespace);
        context_.deployment = clusterInfo.deployment as DeploymentName;
        context_.context = clusterInfo.name; // Cluster name is the context

        this.logger.showUser(chalk.cyan(`\nDeployment: ${context_.deployment}`));
        this.logger.showUser(chalk.cyan(`Namespace: ${(context_.namespace as NamespaceName).name}`));
        this.logger.showUser(chalk.cyan(`Context: ${context_.context}`));

        // Build node aliases and validate we have components to deploy
        const deploymentState: DeploymentStateSchema = context_.deploymentState as DeploymentStateSchema;
        if (deploymentState.consensusNodes && deploymentState.consensusNodes.length > 0) {
          context_.nodeAliases = deploymentState.consensusNodes
            .map((n): `node${string}` => `node${n.metadata.id}`)
            .join(',');
          context_.numConsensusNodes = deploymentState.consensusNodes.length;
        }

        const hasComponents: boolean =
          (deploymentState.consensusNodes?.length || 0) > 0 ||
          (deploymentState.blockNodes?.length || 0) > 0 ||
          (deploymentState.mirrorNodes?.length || 0) > 0 ||
          (deploymentState.relayNodes?.length || 0) > 0 ||
          (deploymentState.explorers?.length || 0) > 0;

        if (!hasComponents) {
          throw new SoloErrors.validation.backupNoComponents();
        }
      },
    };
  }

  /**
   * Normalize component options file paths before subcommands are invoked.
   * Relative values files are resolved from the options YAML location.
   */
  private normalizeComponentOptionsFilePaths(parsedOptions: ComponentOptions, optionsFile: string): void {
    const optionsDirectory: string = path.dirname(path.resolve(optionsFile));
    const componentNames: ComponentOptionName[] = ['consensus', 'block', 'mirror', 'relay', 'explorer'];

    for (const componentName of componentNames) {
      const rawArguments: unknown = parsedOptions?.[componentName];
      if (!Array.isArray(rawArguments)) {
        continue;
      }

      parsedOptions[componentName] = this.resolveRelativeValuesFileArgs(rawArguments, optionsDirectory);
    }
  }

  /**
   * Resolve relative --values-file arguments against the options file directory.
   * This lets restore-network consume component options without external shell path rewriting.
   */
  private resolveRelativeValuesFileArgs(rawArguments: unknown[], optionsDirectory: string): string[] {
    const resolvedArguments: string[] = rawArguments.map(String);

    for (let index: number = 0; index < resolvedArguments.length; index++) {
      const token: string = resolvedArguments[index];
      if (token === '--values-file') {
        const nextIndex: number = index + 1;
        const rawPath: string = resolvedArguments[nextIndex] || '';
        if (rawPath && !rawPath.startsWith('-') && !path.isAbsolute(rawPath)) {
          resolvedArguments[nextIndex] = path.resolve(optionsDirectory, rawPath);
        }
        continue;
      }

      if (token.startsWith('--values-file=')) {
        const rawPath: string = token.slice('--values-file='.length);
        if (rawPath && !path.isAbsolute(rawPath)) {
          resolvedArguments[index] = `--values-file=${path.resolve(optionsDirectory, rawPath)}`;
        }
      }
    }

    return resolvedArguments;
  }

  /**
   * Substitute ${VAR} and $VAR references in an options-file string from the
   * current process environment.  Unknown variables are left as-is with a
   * warning so that a typo surfaces clearly instead of silently producing an
   * empty string.
   */
  private interpolateEnvVariables(content: string): string {
    return content.replaceAll(
      /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g,
      (match, braced: string, unbraced: string): string => {
        const variableName: string = braced ?? unbraced;
        const value: string | undefined = constants.getEnvironmentVariable(variableName);
        if (value === undefined) {
          this.logger.warn(`Options file references undefined environment variable: ${variableName}`);
          return match;
        }
        return value;
      },
    );
  }

  /**
   * Build shared initialization task for restore commands
   */
  private buildInitializationTask(argv: ArgvStruct): SoloListrTask<AnyListrContext> {
    return {
      title: 'Initialize configuration',
      task: async (context_: AnyListrContext): Promise<void> => {
        await this.localConfig.load();
        this.configManager.update(argv);

        const inputDirectory: string = argv[flags.inputDir.name] as string;
        if (!inputDirectory) {
          throw new SoloErrors.validation.missingArgument('--input-dir is required');
        }
        context_.inputDirectory = inputDirectory;

        // Load component-specific options from YAML file if provided
        const optionsFile: string = argv[flags.optionsFile.name] as string;
        if (optionsFile) {
          this.logger.showUser(chalk.cyan(`\nLoading component options from: ${optionsFile}`));

          if (!fs.existsSync(optionsFile)) {
            throw new SoloErrors.validation.backupOptionsFileNotFound(optionsFile);
          }

          try {
            const rawContent: string = fs.readFileSync(optionsFile, 'utf8');
            const optionsContent: string = this.interpolateEnvVariables(rawContent);
            const parsedOptions: ComponentOptions = (yaml.parse(optionsContent) || {}) as ComponentOptions;
            this.normalizeComponentOptionsFilePaths(parsedOptions, optionsFile);
            context_.componentOptions = parsedOptions;

            this.logger.showUser(chalk.cyan('Component options loaded:'));
            if (parsedOptions.consensus) {
              this.logger.showUser(chalk.gray(`  - consensus: ${parsedOptions.consensus.length} options`));
            }
            if (parsedOptions.block) {
              this.logger.showUser(chalk.gray(`  - block: ${parsedOptions.block.length} options`));
            }
            if (parsedOptions.mirror) {
              this.logger.showUser(chalk.gray(`  - mirror: ${parsedOptions.mirror.length} options`));
            }
            if (parsedOptions.relay) {
              this.logger.showUser(chalk.gray(`  - relay: ${parsedOptions.relay.length} options`));
            }
            if (parsedOptions.explorer) {
              this.logger.showUser(chalk.gray(`  - explorer: ${parsedOptions.explorer.length} options`));
            }
          } catch (error) {
            throw new SoloErrors.validation.backupConfigParseFailed(error);
          }
        }
      },
    };
  }

  private async extractEncryptedBackup(
    targetDirectory: string,
    task?: SoloListrTaskWrapper<AnyListrContext>,
  ): Promise<void> {
    const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
    if (!zipPassword) {
      return;
    }

    const zipInputFile: string = this.configManager.getFlag<string>(flags.zipFile);
    if (!zipInputFile) {
      throw new SoloErrors.validation.backupZipFileRequired();
    }

    const inputPath: string = path.resolve(zipInputFile);
    if (!fs.existsSync(inputPath)) {
      throw new SoloErrors.validation.backupInputPathNotFound(inputPath);
    }

    const inputStats: fs.Stats = fs.statSync(inputPath);
    if (!inputStats.isFile()) {
      this.logger.showUser(chalk.yellow('Provided zip input path points to a directory; skipping extraction.'));
      return;
    }

    if (path.extname(inputPath).toLowerCase() !== '.zip') {
      throw new SoloErrors.validation.backupInputMustBeZip();
    }

    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, {recursive: true});
    }

    const shellRunner: ShellRunner = new ShellRunner(this.logger);
    // Explicit argument array, no shell: the password and paths cannot be interpreted by a shell.
    await shellRunner.run('unzip', ['-o', '-P', zipPassword, inputPath, '-d', targetDirectory], {verbose: true});

    this.configManager.setFlag(flags.inputDir, targetDirectory);

    if (task) {
      task.title = `Extract backup archive: ${targetDirectory}`;
    }

    this.logger.showUser(
      chalk.green(
        `\n✓ Backup archive extracted to ${targetDirectory}\nUse this directory for subsequent restore commands.`,
      ),
    );
  }

  /**
   * Build create Kind clusters tasks
   */
  private buildKindNetworkTask(): SoloListrTask<AnyListrContext>[] {
    const tasks: SoloListrTask<AnyListrContext>[] = [
      {
        title: 'Setup Docker network for multi-cluster',
        skip: (context_): boolean => !context_.clusters || context_.clusters.length <= 1,
        task: async (context_): Promise<void> => {
          this.logger.info(`Multiple clusters detected (${context_.clusters.length}), creating Kind Docker network...`);
          try {
            const shellRunner: ShellRunner = new ShellRunner(this.logger);
            // Remove any pre-existing network, then create it.
            try {
              await shellRunner.run('docker', ['network', 'rm', '-f', 'kind'], {
                commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
              });
            } catch {
              // network may not exist yet; safe to ignore
            }
            await shellRunner.run(
              'docker',
              ['network', 'create', 'kind', '--scope', 'local', '--subnet', '172.19.0.0/16', '--driver', 'bridge'],
              {commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE},
            );

            // Add MetalLB Helm repository for multi-cluster load balancing
            this.logger.info('Adding MetalLB Helm repository...');
            await this.helm.addRepository(new Repository('metallb', 'https://metallb.github.io/metallb'));
            await this.helm.updateRepositories();
          } catch (error: unknown) {
            // Network might already exist, which is fine
            const errorMessage: string = BackupRestoreCommand.getErrorMessage(error);
            if (errorMessage.includes('already exists')) {
              this.logger.info('Kind Docker network already exists, continuing...');
            } else {
              throw new SoloErrors.deployment.kindClusterNetworkSetupFailed(BackupRestoreCommand.getError(error));
            }
          }
        },
      },
    ];

    // Add individual cluster creation tasks
    return tasks;
  }

  /**
   * Build individual cluster creation tasks
   */
  private buildIndividualClusterCreationTasks(
    context_: AnyListrContext,
    metallbConfig: string = 'metallb-cluster-{index}.yaml',
  ): SoloListrTask<AnyListrContext>[] {
    const clusterTasks: SoloListrTask<AnyListrContext>[] = [];
    const isMultiCluster: boolean = context_.clusters.length > 1;

    // Create a task for each cluster
    for (let clusterIndex: number = 0; clusterIndex < context_.clusters.length; clusterIndex++) {
      const cluster: ClusterSchema = context_.clusters[clusterIndex] as ClusterSchema;

      // Get the cluster reference from directory name
      // This is used as the base name for Kind cluster creation
      const clusterReferenceFromDirectory: string = context_.contextDirs![clusterIndex];
      // if clusterReferenceFromDirectory already has "kind-" prefix, remove it
      const clusterNameForCreation: string = clusterReferenceFromDirectory.replace('kind-', '');

      clusterTasks.push({
        title: `Create cluster '${clusterNameForCreation}' (cluster ref: ${cluster.name})`,
        task: async (_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>): Promise<void> => {
          const kindExecutable: string = await this.depManager.getExecutable(constants.KIND);
          const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();
          const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(clusterNameForCreation);
          task.title = `Created cluster '${clusterResponse.name}' with context '${clusterResponse.context}'`;

          // Wait for cluster control plane to be ready by checking API server
          this.logger.info(`Waiting for cluster '${clusterResponse.context}' control plane to be ready...`);
          const maxAttempts: number = 60; // 60 attempts * 2 seconds = 120 seconds max
          let attempt: number = 0;
          let clusterReady: boolean = false;

          while (attempt < maxAttempts && !clusterReady) {
            try {
              const k8: K8 = this.k8Factory.getK8(clusterResponse.context);
              // Try to list namespaces as a simple API readiness check
              await k8.namespaces().list();
              clusterReady = true;
              this.logger.info(`Cluster '${clusterResponse.context}' is ready after ${(attempt + 1) * 2} seconds`);
              task.title = `Created cluster '${clusterResponse.name}' (ready in ${(attempt + 1) * 2}s)`;
            } catch (error: unknown) {
              attempt++;
              if (attempt < maxAttempts) {
                await sleep(Duration.ofSeconds(2));
              } else {
                throw new SoloErrors.deployment.clusterApiServerTimeout(
                  clusterResponse.context,
                  maxAttempts,
                  BackupRestoreCommand.getError(error),
                );
              }
            }
          }

          // Set the current kubectl context to the newly created cluster
          this.logger.info(`Setting current context to '${clusterResponse.context}'`);
          const k8: K8 = this.k8Factory.getK8(clusterResponse.context);
          k8.contexts().updateCurrent(clusterResponse.context);

          // Install MetalLB for multi-cluster setups
          if (isMultiCluster) {
            this.logger.info(`Installing MetalLB on cluster '${clusterResponse.context}'...`);
            // Install MetalLB using Helm
            await this.helm.installChart(
              'metallb',
              new Chart('metallb', 'metallb'),
              InstallChartOptionsBuilder.builder()
                .namespace('metallb-system')
                .createNamespace(true)
                .atomic(true)
                .waitFor(true)
                .valueArguments(new HelmChartValues().set('speaker.frr.enabled', true).toArguments())
                .version(METALLB_CHART_VERSION)
                .kubeContext(clusterResponse.context)
                .build(),
            );

            // Apply cluster-specific MetalLB configuration
            const metallbConfigPath: string = metallbConfig.replace('{index}', String(clusterIndex + 1));
            this.logger.info(`Applying MetalLB config from '${metallbConfigPath}'...`);
            await k8.manifests().applyManifest(metallbConfigPath);

            task.title = `Created cluster '${clusterResponse.name}' with MetalLB`;
          }
        },
      });
    }

    return clusterTasks;
  }

  /**
   * Build cluster initialization tasks
   */
  private buildClusterInitializationTasks(
    context_: AnyListrContext,
    shard: number = 0,
    realm: number = 0,
  ): SoloListrTask<AnyListrContext>[] {
    const initTasks: SoloListrTask<AnyListrContext>[] = [];
    const createdDeployments: Set<string> = new Set<string>(); // Track deployments already created

    // For each cluster, run the initialization commands
    for (const cluster of context_.clusters!) {
      const clusterReference: string = cluster.name;
      // if cluster is created by kind, then context name is kind-<clusterReference>
      const contextName: string = clusterReference.startsWith('kind-') ? clusterReference : `kind-${clusterReference}`;
      const namespace: string = cluster.namespace;
      const deployment: string = cluster.deployment;

      // Count consensus nodes belonging to this specific cluster
      // Note: nodes may have cluster saved with or without prefix, so check both
      const clusterConsensusNodeCount: number = context_.deploymentState!.consensusNodes.filter(
        (node: ConsensusNodeStateSchema): boolean => {
          return node.metadata.cluster === clusterReference;
        },
      ).length;

      this.logger.info(
        `Initializing cluster: clusterForKind='${clusterReference}', clusterRef='${clusterReference}', kubectlContext='${contextName}', consensusNodes=${clusterConsensusNodeCount}`,
      );

      initTasks.push(
        invokeSoloCommand(
          `Connect to cluster '${contextName}'`,
          ClusterReferenceCommandDefinition.CONNECT_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
              optionFromFlag(flags.context),
              contextName,
            );
            return argv;
          },
          this.taskList,
        ),
        invokeSoloCommand(
          `Setup cluster-ref '${clusterReference}'`,
          ClusterReferenceCommandDefinition.SETUP_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
            );
            return argv;
          },
          this.taskList,
        ),
      );

      // Only create deployment if not already created (multiple clusters may share the same deployment)
      if (!createdDeployments.has(deployment)) {
        initTasks.push(
          invokeSoloCommand(
            `Create deployment '${deployment}'`,
            DeploymentCommandDefinition.CREATE_COMMAND,
            (): string[] => {
              const argv: string[] = CommandHelpers.newArgv();
              argv.push(
                ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
                optionFromFlag(flags.deployment),
                deployment,
                optionFromFlag(flags.namespace),
                namespace,
                optionFromFlag(flags.shard),
                shard.toString(),
                optionFromFlag(flags.realm),
                realm.toString(),
              );
              return argv;
            },
            this.taskList,
          ),
        );
        createdDeployments.add(deployment);
      }

      initTasks.push(
        invokeSoloCommand(
          `Attach cluster reference '${clusterReference}' to deployment '${deployment}' with ${clusterConsensusNodeCount} consensus nodes`,
          DeploymentCommandDefinition.ATTACH_COMMAND,
          (): string[] => {
            const argv: string[] = CommandHelpers.newArgv();
            argv.push(
              ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
              optionFromFlag(flags.clusterRef),
              clusterReference,
              optionFromFlag(flags.deployment),
              deployment,
              optionFromFlag(flags.numberOfConsensusNodes),
              clusterConsensusNodeCount.toString(),
            );
            return argv;
          },
          this.taskList,
        ),
      );
    }

    return initTasks;
  }

  private parseExpectedLbIpAssignments(expectedLbIpsFile: string): ExpectedLbIpAssignment[] {
    const resolvedPath: string = PathEx.resolve(expectedLbIpsFile);
    if (!fs.existsSync(resolvedPath)) {
      throw new SoloError(`Expected LB IP file not found: ${resolvedPath}`);
    }

    const assignments: ExpectedLbIpAssignment[] = [];
    const lines: string[] = fs.readFileSync(resolvedPath, 'utf8').split('\n');
    const entryPattern: RegExp = /^KIND_(.+)_(ENVOY_PROXY|HAPROXY|NETWORK)_NODE(\d+)_SVC$/;

    for (const line of lines) {
      const entry: string = line.trim();
      if (!entry || entry.startsWith('#')) {
        continue;
      }

      const equalsIndex: number = entry.indexOf('=');
      if (equalsIndex <= 0) {
        continue;
      }

      const key: string = entry.slice(0, equalsIndex).trim();
      const value: string = entry
        .slice(equalsIndex + 1)
        .trim()
        .replaceAll(/^['"]|['"]$/g, '');
      if (!key || !value) {
        continue;
      }

      const match: RegExpMatchArray | null = key.match(entryPattern);
      if (!match) {
        continue;
      }

      const contextSuffix: string = match[1].toLowerCase().replaceAll('_', '-');
      const context: Context = `kind-${contextSuffix}`;
      const serviceTypeToken: string = match[2];
      const nodeId: string = match[3];

      let servicePrefix: string;
      switch (serviceTypeToken) {
        case 'ENVOY_PROXY': {
          servicePrefix = 'envoy-proxy';
          break;
        }
        case 'HAPROXY': {
          servicePrefix = 'haproxy';
          break;
        }
        case 'NETWORK': {
          servicePrefix = 'network';
          break;
        }
        default: {
          continue;
        }
      }

      assignments.push({
        context,
        serviceName: `${servicePrefix}-node${nodeId}-svc`,
        expectedIp: value,
      });
    }

    if (assignments.length === 0) {
      throw new SoloError(
        `No supported LoadBalancer IP entries found in ${resolvedPath}. ` +
          'Expected keys like KIND_<CONTEXT>_<ENVOY_PROXY|HAPROXY|NETWORK>_NODE<n>_SVC=<ip>',
      );
    }

    return assignments;
  }

  private getServiceLoadBalancerIp(service: Service): string {
    return service.status?.loadBalancer?.ingress?.[0]?.ip || '';
  }

  private getServiceLoadBalancerAnnotationIp(service: Service): string {
    return (
      service.metadata?.annotations?.['metallb.io/loadBalancerIPs'] ||
      service.metadata?.annotations?.['metallb.universe.tf/loadBalancerIPs'] ||
      ''
    );
  }

  /**
   * Find which service currently owns a target LoadBalancer IP in a context.
   * Used to detect conflicting ownership before reassignment.
   */
  private async findServiceOwningLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    expectedIp: string,
  ): Promise<string> {
    const services: Service[] = await this.k8Factory.getK8(context).services().list(namespace, []);
    const ownerService: Service | undefined = services.find(
      (service: Service): boolean => this.getServiceLoadBalancerIp(service) === expectedIp,
    );
    return ownerService?.metadata?.name || '';
  }

  /**
   * Clear MetalLB IP annotations from a service to force unassignment.
   * This is the first phase before reapplying expected IP ownership.
   */
  private async unassignServiceLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    serviceName: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          namespace: namespace.name,
          name: serviceName,
          annotations: {
            'metallb.universe.tf/loadBalancerIPs': JSON_MERGE_PATCH_DELETE_VALUE,
            'metallb.io/loadBalancerIPs': JSON_MERGE_PATCH_DELETE_VALUE,
          },
        },
        spec: {
          loadBalancerIP: JSON_MERGE_PATCH_DELETE_VALUE,
        },
      });
  }

  /**
   * Assign an expected LoadBalancer IP to a service.
   * This drives deterministic service endpoint restoration after redeploy.
   */
  private async assignServiceLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    serviceName: string,
    expectedIp: string,
  ): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .manifests()
      .patchObject({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          namespace: namespace.name,
          name: serviceName,
          annotations: {
            'metallb.universe.tf/loadBalancerIPs': JSON_MERGE_PATCH_DELETE_VALUE,
            'metallb.io/loadBalancerIPs': JSON_MERGE_PATCH_DELETE_VALUE,
          },
        },
        spec: {
          loadBalancerIP: expectedIp,
        },
      });
  }

  private async findAvailableSiblingLoadBalancerIp(
    context: Context,
    namespace: NamespaceName,
    reservedIps: Set<string>,
  ): Promise<string> {
    const firstReservedIp: string = [...reservedIps][0];
    const match: RegExpMatchArray | null = firstReservedIp.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
    if (!match) {
      throw new SoloError(`Unable to derive a replacement LoadBalancer IP from '${firstReservedIp}'.`);
    }

    const usedIps: Set<string> = new Set<string>(reservedIps);
    const services: Service[] = await this.k8Factory.getK8(context).services().list(namespace, []);
    for (const service of services) {
      const loadBalancerIp: string = this.getServiceLoadBalancerIp(service);
      if (loadBalancerIp) {
        usedIps.add(loadBalancerIp);
      }

      const annotationIp: string = this.getServiceLoadBalancerAnnotationIp(service);
      if (annotationIp) {
        usedIps.add(annotationIp);
      }
    }

    const prefix: string = `${match[1]}.${match[2]}.${match[3]}`;
    for (let suffix: number = 3; suffix <= 254; suffix++) {
      const candidateIp: string = `${prefix}.${suffix}`;
      if (!usedIps.has(candidateIp)) {
        reservedIps.add(candidateIp);
        return candidateIp;
      }
    }

    throw new SoloError(`No replacement LoadBalancer IP is available in '${prefix}.0/24'.`);
  }

  private async hasNoConflictingLoadBalancerIpOwnership(
    namespace: NamespaceName,
    assignments: ExpectedLbIpAssignment[],
  ): Promise<boolean> {
    for (const assignment of assignments) {
      const ownerServiceName: string = await this.findServiceOwningLoadBalancerIp(
        assignment.context,
        namespace,
        assignment.expectedIp,
      );
      if (ownerServiceName && ownerServiceName !== assignment.serviceName) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verify all services currently advertise their expected LoadBalancer IPs.
   * Returns false immediately on the first mismatch.
   */
  private async hasAllExpectedLoadBalancerIps(
    namespace: NamespaceName,
    assignments: ExpectedLbIpAssignment[],
  ): Promise<boolean> {
    for (const assignment of assignments) {
      const service: Service = await this.k8Factory
        .getK8(assignment.context)
        .services()
        .read(namespace, assignment.serviceName);
      const actualIp: string = this.getServiceLoadBalancerIp(service);
      if (actualIp !== assignment.expectedIp) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rollout restart MetalLB controllers in involved contexts.
   * Used as a recovery step when IP assignment does not converge.
   */
  private async restartMetalLbControllers(assignments: ExpectedLbIpAssignment[]): Promise<void> {
    const contexts: Set<Context> = new Set(
      assignments.map((assignment: ExpectedLbIpAssignment): Context => assignment.context),
    );
    for (const context of contexts) {
      try {
        await this.patchDeploymentRestartAnnotation(context, NamespaceName.of('metallb-system'), 'metallb-controller');
      } catch (error: unknown) {
        this.logger.info(
          `Skipping MetalLB controller restart for context '${context}': ${BackupRestoreCommand.getErrorMessage(error)}`,
        );
      }
    }
  }

  /**
   * Enforce expected service IP ownership from the configured assignment file.
   * Flow: detect conflicts, unassign, reassign, verify, and fallback restart MetalLB if needed.
   */
  private async enforceExpectedLoadBalancerIps(namespace: NamespaceName, expectedLbIpsFile: string): Promise<void> {
    const assignments: ExpectedLbIpAssignment[] = this.parseExpectedLbIpAssignments(expectedLbIpsFile);
    const reservedIpsByContext: Map<Context, Set<string>> = new Map<Context, Set<string>>();
    for (const assignment of assignments) {
      let reservedIps: Set<string> | undefined = reservedIpsByContext.get(assignment.context);
      if (!reservedIps) {
        reservedIps = new Set<string>();
        reservedIpsByContext.set(assignment.context, reservedIps);
      }
      reservedIps.add(assignment.expectedIp);
    }

    const conflicts: LoadBalancerIpConflict[] = [];

    for (const assignment of assignments) {
      const ownerServiceName: string = await this.findServiceOwningLoadBalancerIp(
        assignment.context,
        namespace,
        assignment.expectedIp,
      );
      if (ownerServiceName && ownerServiceName !== assignment.serviceName) {
        this.logger.info(
          `LB IP ownership warning: context='${assignment.context}' service='${assignment.serviceName}' ` +
            `expected='${assignment.expectedIp}' currentlyOwnedBy='${ownerServiceName}'`,
        );
        const reservedIps: Set<string> = reservedIpsByContext.get(assignment.context) as Set<string>;
        conflicts.push({
          context: assignment.context,
          serviceName: ownerServiceName,
          conflictingIp: assignment.expectedIp,
          replacementIp: await this.findAvailableSiblingLoadBalancerIp(assignment.context, namespace, reservedIps),
        });
      }
    }

    for (const conflict of conflicts) {
      this.logger.info(
        `Relocating LoadBalancer IP conflict: context='${conflict.context}' service='${conflict.serviceName}' ` +
          `from='${conflict.conflictingIp}' to='${conflict.replacementIp}'`,
      );
      await this.assignServiceLoadBalancerIp(conflict.context, namespace, conflict.serviceName, conflict.replacementIp);
    }

    let conflictsCleared: boolean = conflicts.length === 0;
    for (let attempt: number = 0; attempt < 30; attempt++) {
      if (await this.hasNoConflictingLoadBalancerIpOwnership(namespace, assignments)) {
        conflictsCleared = true;
        break;
      }
      await helpers.sleep(Duration.ofSeconds(2));
    }

    if (!conflictsCleared) {
      this.logger.info(
        'LoadBalancer IP conflicts did not relocate after initial retries. Restarting MetalLB controllers...',
      );
      await this.restartMetalLbControllers(assignments);

      for (let attempt: number = 0; attempt < 30; attempt++) {
        if (await this.hasNoConflictingLoadBalancerIpOwnership(namespace, assignments)) {
          conflictsCleared = true;
          break;
        }
        await helpers.sleep(Duration.ofSeconds(2));
      }
    }

    if (!conflictsCleared) {
      const conflictingOwners: string[] = [];
      for (const assignment of assignments) {
        const ownerServiceName: string = await this.findServiceOwningLoadBalancerIp(
          assignment.context,
          namespace,
          assignment.expectedIp,
        );
        if (ownerServiceName && ownerServiceName !== assignment.serviceName) {
          conflictingOwners.push(
            `${assignment.context}/${assignment.expectedIp}: expected owner ${assignment.serviceName}, current owner ${ownerServiceName}`,
          );
        }
      }

      throw new SoloError(`Failed to relocate conflicting LoadBalancer IP owners:\n${conflictingOwners.join('\n')}`);
    }

    for (const assignment of assignments) {
      await this.unassignServiceLoadBalancerIp(assignment.context, namespace, assignment.serviceName);
    }

    for (const assignment of assignments) {
      await this.assignServiceLoadBalancerIp(
        assignment.context,
        namespace,
        assignment.serviceName,
        assignment.expectedIp,
      );
    }

    for (let attempt: number = 0; attempt < 45; attempt++) {
      if (await this.hasAllExpectedLoadBalancerIps(namespace, assignments)) {
        return;
      }
      await helpers.sleep(Duration.ofSeconds(2));
    }

    this.logger.info('LoadBalancer IPs did not converge after initial retries. Restarting MetalLB controllers...');
    await this.restartMetalLbControllers(assignments);

    for (let attempt: number = 0; attempt < 30; attempt++) {
      if (await this.hasAllExpectedLoadBalancerIps(namespace, assignments)) {
        return;
      }
      await helpers.sleep(Duration.ofSeconds(2));
    }

    const mismatches: string[] = [];
    for (const assignment of assignments) {
      const service: Service = await this.k8Factory
        .getK8(assignment.context)
        .services()
        .read(namespace, assignment.serviceName);
      const actualIp: string = this.getServiceLoadBalancerIp(service);
      if (actualIp !== assignment.expectedIp) {
        mismatches.push(
          `${assignment.context}/${assignment.serviceName}: expected ${assignment.expectedIp}, got ${actualIp || '<none>'}`,
        );
      }
    }

    throw new SoloError(`Failed to enforce expected LoadBalancer IPs:\n${mismatches.join('\n')}`);
  }

  /**
   * Restore Kind clusters from backup directory structure
   * Command: solo config ops restore-clusters
   */
  public async restoreClusters(argv: ArgvStruct): Promise<boolean> {
    await this.depManager.checkDependency(constants.KIND);
    await this.depManager.checkDependency(constants.HELM);

    // Extract metallbConfig from argv
    const metallbConfig: string = (argv[flags.metallbConfig.name] as string) ?? 'metallb-cluster-{index}.yaml';

    interface RestoreClustersContext {
      inputDirectory: string;
      contextDirs?: string[]; // kubectl context directory names from backup
      remoteConfig?: RemoteConfig;
      deploymentState?: DeploymentStateSchema;
      namespace?: NamespaceName;
      deployment?: DeploymentName;
      context?: Context;
      nodeAliases?: string;
      versions?: ApplicationVersionsSchema;
      clusters?: ReadonlyArray<Readonly<ClusterSchema>>;
      numConsensusNodes?: number;
      componentOptions?: {
        consensus?: string[];
        block?: string[];
        mirror?: string[];
        relay?: string[];
        explorer?: string[];
      };
    }

    const tasks: SoloListr<RestoreClustersContext> = new Listr(
      [
        this.buildInitializationTask(argv),
        {
          title: 'Extract backup archive',
          skip: (): boolean => {
            const zipPassword: string = this.configManager.getFlag<string>(flags.zipPassword);
            return !zipPassword;
          },
          task: async (context_, task): Promise<void> => {
            await this.extractEncryptedBackup(context_.inputDirectory, task);
          },
        },
        // Flatten scan backup directory task
        this.buildScanBackupDirectoryTask(),
        ...this.buildKindNetworkTask(),
        {
          title: 'Create individual clusters',
          task: (context_, taskListWrapper): SoloListr<RestoreClustersContext> => {
            const clusterTasks: SoloListrTask<AnyListrContext>[] = this.buildIndividualClusterCreationTasks(
              context_,
              metallbConfig,
            );
            return taskListWrapper.newListr(clusterTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
    );

    try {
      await tasks.run();
      this.logger.showUser(chalk.green('\n✅ Clusters restored successfully!'));
      this.logger.showUser(
        chalk.cyan(
          '\nℹ️  Clusters have been created and initialized. Run "solo config ops restore-network" to deploy network components.',
        ),
      );
    } catch (error) {
      throw new SoloErrors.deployment.backupRestoreClustersFailed(error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }

  /**
   * Deploy network components to existing clusters from backup
   * Command: solo config ops restore-network
   */
  public async restoreNetwork(argv: ArgvStruct): Promise<boolean> {
    // Extract shard and realm from argv
    const shard: number = (argv[flags.shard.name] as number) ?? 0;
    const realm: number = (argv[flags.realm.name] as number) ?? 0;
    const expectedLbIpsFile: string = (argv[flags.expectedLbIpsFile.name] as string) || '';
    const skipIpTracking: boolean = (argv[flags.skipIpTracking.name] as boolean) ?? true;

    if (!skipIpTracking && !expectedLbIpsFile) {
      throw new SoloError(`--${flags.expectedLbIpsFile.name} is required when --${flags.skipIpTracking.name}=false`);
    }
    if (skipIpTracking && expectedLbIpsFile) {
      this.logger.info(
        `Skipping expected LoadBalancer IP enforcement because --${flags.skipIpTracking.name}=true (default)`,
      );
    }

    interface RestoreNetworkContext {
      inputDirectory: string;
      contextDirs?: string[]; // kubectl context directory names from backup
      remoteConfig?: RemoteConfig;
      deploymentState?: DeploymentStateSchema;
      namespace?: NamespaceName;
      deployment?: DeploymentName;
      context?: Context;
      nodeAliases?: string;
      versions?: ApplicationVersionsSchema;
      clusters?: ReadonlyArray<Readonly<ClusterSchema>>;
      numConsensusNodes?: number;
      componentOptions?: {
        consensus?: string[];
        block?: string[];
        mirror?: string[];
        relay?: string[];
        explorer?: string[];
      };
    }

    const tasks: SoloListr<RestoreNetworkContext> = new Listr(
      [
        this.buildInitializationTask(argv),
        // Flatten scan backup directory task (to load config and deployment state)
        this.buildScanBackupDirectoryTask(),
        {
          title: 'Initialize cluster configurations',
          task: (context_, taskListWrapper): SoloListr<RestoreNetworkContext> => {
            const initTasks: SoloListrTask<AnyListrContext>[] = this.buildClusterInitializationTasks(
              context_,
              shard,
              realm,
            );
            return taskListWrapper.newListr(initTasks, {
              concurrent: false,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
        // Flatten the deployment tasks to top level (like default-one-shot.ts)
        ...this.buildDeploymentTasks(),
        {
          title: 'Enforce expected LoadBalancer IPs',
          skip: (): boolean => skipIpTracking || !expectedLbIpsFile,
          task: async (context_: RestoreNetworkContext, task): Promise<void> => {
            if (!context_.namespace) {
              throw new SoloError('Namespace is required to enforce expected LoadBalancer IPs.');
            }
            await this.enforceExpectedLoadBalancerIps(context_.namespace, expectedLbIpsFile);
            task.title = 'Enforce expected LoadBalancer IPs: completed';
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
    );

    try {
      await tasks.run();
      this.logger.showUser(chalk.green('\n✅ Network components deployed successfully!'));
      this.logger.showUser(chalk.cyan('\nℹ️  All network components have been deployed to existing clusters.'));
    } catch (error) {
      throw new SoloErrors.deployment.deployNetworkFailed(error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }
}
