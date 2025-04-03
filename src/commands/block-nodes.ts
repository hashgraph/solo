// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {showVersionBanner} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {
  type AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type ClusterReference, type DeploymentName} from '../core/config/remote/types.js';
import {type CommandDefinition, type Optional} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';

interface BlockNodesDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  clusterRef: ClusterReference;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  nodeAliases: NodeAliases; // from remote config
  context: string;
  isChartInstalled: boolean;
  valuesArg: string;
}

interface BlockNodesDeployContext {
  config: BlockNodesDeployConfigClass;
}

export class BlockNodesCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'block-nodes';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.blockNodesChartVersion,
      flags.chartDirectory,
      flags.clusterRef,
      flags.deployment,
      flags.devMode,
      flags.domainName,
      flags.enableIngress,
      flags.quiet,
      flags.valuesFile,
    ],
  };

  private async prepareValuesArgForBlockNodes(config: BlockNodesDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    valuesArgument += helpers.prepareValuesFiles(constants.BLOCK_NODES_VALUES_FILE);

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    return valuesArgument;
  }

  private getReleaseName(blockNodeId: string): string {
    return constants.BLOCK_NODE_RELEASE_NAME + '-' + blockNodeId;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<BlockNodesDeployContext> = new Listr<BlockNodesDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(BlockNodesCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodesCommand.DEPLOY_FLAGS_LIST.required,
              ...BlockNodesCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = this.configManager.getConfig(
              BlockNodesCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
            ) as BlockNodesDeployConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            context_.config.nodeAliases = this.remoteConfigManager
              .getConsensusNodes()
              .map((node): NodeAlias => node.name);

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.context = this.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              this.getReleaseName('33') /* TODO */,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            config.valuesArg = await this.prepareValuesArgForBlockNodes(config);
          },
        },
        {
          title: 'Deploy BlockNodes',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            // TODO CHECK OS if M4
            // # Fix for M4 chips
            // ARCH="$(uname -p)"
            // if [[ "${ARCH}" == "arm64" || "${ARCH}" == "aarch64" ]]; then
            //   JAVA_OPTS="${JAVA_OPTS} -XX:UseSVE=0"
            // fi

            await this.chartManager.install(
              config.namespace,
              this.getReleaseName('33') /* TODO */,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART_URL,
              config.chartVersion,
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, this.getReleaseName('33') /* TODO */, versions.BLOCK_NODE_VERSION);
          },
        },
        {
          title: 'Check block nodes are running',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                [`app.kubernetes.io/instance=${this.getReleaseName('33') /* TODO */}`],
                constants.BLOCK_NODES_PODS_RUNNING_MAX_ATTEMPTS,
                constants.BLOCK_NODES_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check block nodes is ready',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  [`app.kubernetes.io/instance=${this.getReleaseName('33') /* TODO */}`],
                  constants.BLOCK_NODES_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.BLOCK_NODES_PODS_RUNNING_DELAY,
                );
            } catch (error) {
              throw new SoloError(
                `BlockNodes ${this.getReleaseName('33') /* TODO */} is not ready: ${error.message}`,
                error,
              );
            }
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block nodes: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: BlockNodesCommand.COMMAND_NAME,
      desc: 'Manage block nodes in solo network',
      builder: (yargs: AnyYargs): any => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy block nodes',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...BlockNodesCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...BlockNodesCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'relay deploy' ===", {argv});
              self.logger.info(argv);

              await self.deploy(argv).then((r): void => {
                self.logger.info('==== Finished running `relay deploy`====');
                if (!r) throw new SoloError('Error deploying relay, expected return value to be true');
              });
            },
          })
          .demandCommand(1, 'Select a relay command');
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
