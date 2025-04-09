// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import {showVersionBanner, sleep} from '../core/helpers.js';
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
import {type CommandDefinition, type Optional, type SoloListrTask, type SoloListrTaskWrapper} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type BlockNodeComponent} from '../core/config/remote/components/block-node-component.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {ComponentFactory} from '../core/config/remote/components/component-factory.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Duration} from '../core/time/duration.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import chalk from 'chalk';
import {CommandBuilder, CommandGroup, Subcommand} from '../core/command-path-builders/command-builder.js';

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
  public static readonly COMMAND_NAME: string = 'block';

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

    const chipType: string[] = await helpers.getAppleSiliconChipset(this.logger);
    let isAppleM4SeriesChip: boolean = false;
    for (const chip of chipType) {
      if (chip.includes('M4')) {
        isAppleM4SeriesChip = true;
      }
    }

    if (isAppleM4SeriesChip) {
      valuesArgument += helpers.populateHelmArguments({
        'blockNode.config.JAVA_OPTS': '"-Xms8G -Xmx8G -XX:UseSVE=0"',
      });
    }

    return valuesArgument;
  }

  private getReleaseName(blockNodeIndex: number): string {
    return constants.BLOCK_NODE_RELEASE_NAME + '-' + blockNodeIndex;
  }

  private async add(argv: ArgvStruct): Promise<boolean> {
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

            config.newBlockNodeComponent = ComponentFactory.createNewBlockNodeComponent(
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
          title: 'Check block node pod is running',
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
          title: 'Check block node pod is ready',
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
        this.checkBlockNodeReadiness(),
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
  private addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const config: BlockNodeDeployConfigClass = context_.config;

          remoteConfig.components.addNewComponent(config.newBlockNodeComponent);
        });
      },
    };
  }

  private displayHealthcheckData(
    task: SoloListrTaskWrapper<BlockNodeDeployContext>,
  ): (attempt: number, maxAttempt: number, color?: 'yellow' | 'green' | 'red', additionalData?: string) => void {
    const baseTitle: string = task.title;

    return function (
      attempt: number,
      maxAttempt: number,
      color: 'yellow' | 'green' | 'red' = 'yellow',
      additionalData: string = '',
    ): void {
      task.title = `${baseTitle} - ${chalk[color](`[${attempt}/${maxAttempt}]`)} ${chalk[color](additionalData)}`;
    };
  }

  private checkBlockNodeReadiness(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Check block node readiness',
      task: async (context_, task): Promise<void> => {
        const config: BlockNodeDeployConfigClass = context_.config;

        const displayHealthcheckCallback: (
          attempt: number,
          maxAttempt: number,
          color?: 'yellow' | 'green' | 'red',
          additionalData?: string,
        ) => void = this.displayHealthcheckData(task);

        const blockNodePodReference: PodReference = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(config.namespace, [`app.kubernetes.io/instance=${config.releaseName}`])
          .then(pods => pods[0].podReference);

        const containerReference: ContainerReference = ContainerReference.of(
          blockNodePodReference,
          constants.BLOCK_NODE_CONTAINER_NAME,
        );

        const maxAttempts: number = constants.BLOCK_NODE_ACTIVE_MAX_ATTEMPTS;
        let attempt: number = 1;
        let success: boolean = false;

        displayHealthcheckCallback(attempt, maxAttempts);

        while (attempt < maxAttempts) {
          try {
            const response: string = await helpers.withTimeout(
              this.k8Factory
                .getK8(config.context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', 'curl -s http://localhost:8080/healthz/readyz']),
              Duration.ofMillis(constants.BLOCK_NODE_ACTIVE_TIMEOUT),
              'Healthcheck timed out',
            );

            if (response !== 'OK') {
              throw new SoloError('Bad response status');
            }

            success = true;
            break;
          } catch (error) {
            // Guard
            console.error(error);
          }

          attempt++;
          await sleep(Duration.ofSeconds(constants.BLOCK_NODE_ACTIVE_DELAY));
          displayHealthcheckCallback(attempt, maxAttempts);
        }

        if (!success) {
          displayHealthcheckCallback(attempt, maxAttempts, 'red', 'max attempts reached');
          throw new SoloError('Max attempts reached');
        }

        displayHealthcheckCallback(attempt, maxAttempts, 'green', 'success');
      },
    };
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      BlockNodeCommand.COMMAND_NAME,
      'Manage block related components in solo network',
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup('node', 'Manage block nodes in solo network').addSubcommand(
          new Subcommand('add', 'Add block node', this, this.add, (y: AnyYargs): void => {
            flags.setRequiredCommandFlags(y, ...BlockNodeCommand.DEPLOY_FLAGS_LIST.required);
            flags.setOptionalCommandFlags(y, ...BlockNodeCommand.DEPLOY_FLAGS_LIST.optional);
          }),
        ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
