// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import {showVersionBanner} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
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
import {type CommandDefinition, type Optional, type SoloListrTask} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import os from 'node:os';
import {BlockNodeComponent} from '../core/config/remote/components/block-node-component.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';

interface BlockNodeDeployConfigClass {
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
  newBlockNodeComponent: BlockNodeComponent;
  releaseName: string;
}

interface BlockNodeDeployContext {
  config: BlockNodeDeployConfigClass;
}

export class BlockNodeCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'block-node';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.blockNodeChartVersion,
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

  private async prepareValuesArgForBlockNode(config: BlockNodeDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    valuesArgument += helpers.prepareValuesFiles(constants.BLOCK_NODE_VALUES_FILE);

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: config.newBlockNodeComponent.name});

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    // Fix for M4 chips (ARM64)
    const arch: string = os.arch();
    if (arch === 'arm64' || arch === 'aarch64') {
      valuesArgument += helpers.populateHelmArguments({
        'blockNode.config.JAVA_OPTS': '"-Xms8G -Xmx8G -XX:UseSVE=0"',
      });
    }

    return valuesArgument;
  }

  private getReleaseName(blockNodeIndex: number): string {
    return constants.BLOCK_NODE_RELEASE_NAME + '-' + blockNodeIndex;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<BlockNodeDeployContext> = new Listr<BlockNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.DEPLOY_FLAGS_LIST.required,
              ...BlockNodeCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              BlockNodeCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDeployConfigClass;

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
          title: 'Prepare release name and block node name',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            const newBlockNodeIndex: number = this.remoteConfigManager.components.getNewComponentIndex(
              ComponentTypes.BlockNode,
            );

            config.newBlockNodeComponent = BlockNodeComponent.createNew(
              this.remoteConfigManager,
              config.clusterRef,
              config.namespace,
            );

            config.releaseName = this.getReleaseName(newBlockNodeIndex);
          },
        },
        {
          title: 'Check chart is installed',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.valuesArg = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Deploy block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART_URL,
              config.chartVersion,
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, versions.BLOCK_NODE_VERSION);
          },
        },
        {
          title: 'Check block node is running',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                [`app.kubernetes.io/instance=${config.releaseName}`],
                constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                constants.BLOCK_NODE_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check block node is ready',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  [`app.kubernetes.io/instance=${config.releaseName}`],
                  constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.BLOCK_NODE_PODS_RUNNING_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.addBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block node: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  /** Adds the block node component to remote config. */
  public addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig): Promise<void> => {
          const config: BlockNodeDeployConfigClass = context_.config;

          remoteConfig.components.addNewComponent(config.newBlockNodeComponent);
        });
      },
    };
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: BlockNodeCommand.COMMAND_NAME,
      desc: 'Manage block nodes in solo network',
      builder: (yargs: AnyYargs): any => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy block node',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...BlockNodeCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...BlockNodeCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'block node deploy' ===", {argv});
              self.logger.info(argv);

              await self.deploy(argv).then((r): void => {
                self.logger.info('==== Finished running `block node deploy`====');
                if (!r) {
                  throw new SoloError('Error deploying block node, expected return value to be true');
                }
              });
            },
          })
          .demandCommand(1, 'Select a block node command');
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
