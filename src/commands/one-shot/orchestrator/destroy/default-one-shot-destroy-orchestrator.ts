// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type Listr, type ListrBaseClassOptions, type ListrContext, type ListrRendererValue} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {select as selectPrompt} from '@inquirer/prompts';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {Templates} from '../../../../core/templates.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloEventBus} from '../../../../core/events/solo-event-bus.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type OneShotDestroyOrchestrator} from './one-shot-destroy-orchestrator.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {type OneShotState} from '../../../../core/one-shot-state.js';
import {type K8Factory} from '../../../../integration/kube/k8-factory.js';
import {type LockManager} from '../../../../core/lock/lock-manager.js';
import {type LocalConfigRuntimeState} from '../../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type CommandFlag, type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {OrchestratorPipelinePhase} from '../orchestrator-pipeline-phase.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {invokeSoloCommand} from '../../../command-helpers.js';
import {Flags as flags} from '../../../flags.js';
import * as constants from '../../../../core/constants.js';
import {ListrLock} from '../../../../core/lock/listr-lock.js';
import {MissingArgumentError} from '../../../../core/errors/classes/validation/missing-argument-error.js';
import {resolveNamespaceFromDeployment} from '../../../../core/resolvers.js';
import {type Deployment} from '../../../../business/runtime-state/config/local/deployment.js';
import {type StringFacade} from '../../../../business/runtime-state/facade/string-facade.js';
import {DestroyArgvBuilders} from './destroy-argv-builders.js';
import {OrchestratorPipeline} from '../orchestrator-pipeline.js';
import {SpinnerListrOptions} from '../../../../core/spinner-listr-options.js';
import {MutableFacadeArray} from '../../../../business/runtime-state/collection/mutable-facade-array.js';
import {DeploymentSchema} from '../../../../data/schema/model/local/deployment-schema.js';
import fs from 'node:fs';

const SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

@injectable()
export class DefaultOneShotDestroyOrchestrator implements OneShotDestroyOrchestrator {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.OneShotState) private readonly oneShotState: OneShotState,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public buildDestroyPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
    skipDeploymentLock: boolean = false,
  ): OrchestratorPipeline<OneShotSingleDestroyContext> {
    let config: OneShotSingleDestroyConfigClass;
    const getConfigGlobal: () => OneShotSingleDestroyConfigClass = (): OneShotSingleDestroyConfigClass => config;
    let remoteConfigLoaded: boolean = false;

    const destroySubPhases: Array<
      OrchestratorPipelinePhase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>
    > = [
      OrchestratorPipelinePhase.composite(
        'Destroy extended setup',
        [
          new OrchestratorPipelinePhase(
            'Destroy explorer',
            {
              asListrTask: (
                getConfig: () => OneShotSingleDestroyConfigClass,
              ): SoloListrTask<OneShotSingleDestroyContext> =>
                invokeSoloCommand(
                  `solo ${ExplorerCommandDefinition.DESTROY_COMMAND}`,
                  ExplorerCommandDefinition.DESTROY_COMMAND,
                  (): string[] => DestroyArgvBuilders.buildDestroyExplorerArgv(getConfig()),
                  this.taskList,
                  (): boolean => !getConfig().hasExplorers,
                ),
            },
            undefined,
            undefined,
            false,
          ),
          new OrchestratorPipelinePhase(
            'Destroy relay',
            {
              asListrTask: (
                getConfig: () => OneShotSingleDestroyConfigClass,
              ): SoloListrTask<OneShotSingleDestroyContext> =>
                invokeSoloCommand(
                  `solo ${RelayCommandDefinition.DESTROY_COMMAND}`,
                  RelayCommandDefinition.DESTROY_COMMAND,
                  (): string[] => DestroyArgvBuilders.buildDestroyRelayArgv(getConfig()),
                  this.taskList,
                  (): boolean => !getConfig().hasRelays,
                ),
            },
            undefined,
            undefined,
            false,
          ),
        ],
        OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Destroy mirror node',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${MirrorCommandDefinition.DESTROY_COMMAND}`,
              MirrorCommandDefinition.DESTROY_COMMAND,
              (): string[] => DestroyArgvBuilders.buildDestroyMirrorNodeArgv(getConfig()),
              this.taskList,
              (): boolean =>
                getConfig().skipAll ||
                getConfig().skipClusterCleanup ||
                !getConfig().deployment ||
                !getConfig().hasMirrorNodes,
            ),
        },
        undefined,
        undefined,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Destroy block node',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${BlockCommandDefinition.DESTROY_COMMAND}`,
              BlockCommandDefinition.DESTROY_COMMAND,
              (): string[] => DestroyArgvBuilders.buildDestroyBlockNodeArgv(getConfig()),
              this.taskList,
              (): boolean =>
                getConfig().skipAll ||
                getConfig().skipClusterCleanup ||
                !getConfig().deployment ||
                getConfig().hasBlockNodes === false,
            ),
        },
        undefined,
        undefined,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Destroy consensus node',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${ConsensusCommandDefinition.DESTROY_COMMAND}`,
              ConsensusCommandDefinition.DESTROY_COMMAND,
              (): string[] => DestroyArgvBuilders.buildDestroyConsensusNodeArgv(getConfig()),
              this.taskList,
              (): boolean => getConfig().skipAll || getConfig().skipClusterCleanup || !getConfig().deployment,
            ),
        },
        undefined,
        undefined,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Cluster reset',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${ClusterReferenceCommandDefinition.RESET_COMMAND}`,
              ClusterReferenceCommandDefinition.RESET_COMMAND,
              (): string[] => DestroyArgvBuilders.buildClusterResetArgv(getConfig()),
              this.taskList,
              (): boolean => getConfig().skipAll || getConfig().skipClusterCleanup || !getConfig().deployment,
            ),
        },
        undefined,
        undefined,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Cluster disconnect',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${ClusterReferenceCommandDefinition.DISCONNECT_COMMAND}`,
              ClusterReferenceCommandDefinition.DISCONNECT_COMMAND,
              (): string[] => DestroyArgvBuilders.buildClusterDisconnectArgv(getConfig()),
              this.taskList,
              (): boolean => getConfig().skipAll || !getConfig().deployment,
            ),
        },
        undefined,
        undefined,
        false,
      ),
      new OrchestratorPipelinePhase(
        'Deployment delete',
        {
          asListrTask: (getConfig: () => OneShotSingleDestroyConfigClass): SoloListrTask<OneShotSingleDestroyContext> =>
            invokeSoloCommand(
              `solo ${DeploymentCommandDefinition.DELETE_COMMAND}`,
              DeploymentCommandDefinition.DELETE_COMMAND,
              (): string[] => DestroyArgvBuilders.buildDeploymentDeleteArgv(getConfig()),
              this.taskList,
              (): boolean => !getConfig().deployment,
            ),
        },
        undefined,
        undefined,
        false,
      ),
    ];

    const phases: Array<OrchestratorPipelinePhase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>> = [
      new OrchestratorPipelinePhase('Initialize', {
        asListrTask: (): SoloListrTask<OneShotSingleDestroyContext> => ({
          title: 'Initialize',
          task: async (
            context_: OneShotSingleDestroyContext,
            task: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
          ): Promise<void> => {
            this.configManager.update(argv);
            this.oneShotState.activate();

            flags.disablePrompts(flagsList.optional);

            const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              SINGLE_DESTROY_CONFIGS_NAME,
              allFlags,
            ) as OneShotSingleDestroyConfigClass;

            config = context_.config;

            config.skipAll = false;
            config.skipClusterCleanup = false;

            await this.localConfig.load();

            config.cacheDir ??= constants.SOLO_CACHE_DIR;

            if (!config.deployment) {
              const deployments: MutableFacadeArray<Deployment, DeploymentSchema> =
                this.localConfig.configuration.deployments;
              if (deployments.length === 0) {
                this.logger.showUser('No deployments found in local config, have they already been deleted?');
                config.skipAll = true;
                return;
              }

              if (deployments.length > 1) {
                const selectedDeployment: string = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                  message: 'Select deployment to destroy',
                  choices: deployments.map((deployment: Deployment): {name: string; value: string} => {
                    const clusterNames: string[] = deployment.clusters.map((cluster: StringFacade): string =>
                      cluster.toString(),
                    );
                    return {
                      name: `${deployment.name} (ns: ${deployment.namespace}, clusters: ${clusterNames.join(', ') || 'unknown'})`,
                      value: deployment.name,
                    };
                  }),
                })) as string;

                if (!selectedDeployment) {
                  throw new MissingArgumentError('Deployment selection cannot be empty');
                }

                config.deployment = selectedDeployment;
              } else {
                const deployment: Deployment = deployments.get(0);
                if (!deployment?.name) {
                  throw new MissingArgumentError('Invalid deployment configuration: deployment name is missing');
                }
                config.deployment = deployment.name;
              }

              this.configManager.setFlag(flags.deployment, config.deployment);
            }

            const selectedDeployment: Deployment | undefined = this.localConfig.configuration.deployments.find(
              (deployment: Deployment): boolean => deployment.name === config.deployment,
            );
            if (selectedDeployment?.clusters?.length) {
              const firstCluster: StringFacade | undefined = selectedDeployment.clusters.find(
                (cluster: StringFacade): boolean => cluster !== null && cluster !== undefined,
              );
              if (firstCluster) {
                config.clusterRef ??= firstCluster.toString();
              }
            }

            config.clusterRef ??= this.localConfig.configuration.clusterRefs.keys().next().value;

            config.context ??= this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString();

            remoteConfigLoaded = await this.loadRemoteConfigOrWarn(argv);
            try {
              config.namespace ??= await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
            } catch (error) {
              if ((error as Error).message?.includes('not found in local config')) {
                this.logger.showUser(
                  `Deployment: ${config.deployment}, not found in local config, has it already been deleted?`,
                );
                config.skipAll = true;
                return;
              } else {
                throw error;
              }
            }

            try {
              const kubeContextConnectionSuccessful: boolean = await this.k8Factory
                .default()
                .contexts()
                .testContextConnection(config.context);
              if (!kubeContextConnectionSuccessful) {
                this.logger.warn(
                  `Cluster context '${config.context}' is unreachable; skipping cluster-side teardown and cleaning local config only.`,
                );
                config.skipClusterCleanup = true;
                return;
              }
            } catch (error) {
              this.logger.warn(
                `Error connecting to cluster with context '${config.context}'; skipping cluster-side teardown and cleaning local config only.`,
                error,
              );
              config.skipClusterCleanup = true;
              return;
            }
            // We cannot reason about a missing remote config safely, so we do not special-case it:
            // if the remote config loaded, use it to detect which components exist; if it did not load,
            // assume every network component is already missing so the per-component destroy steps below
            // skip. Local config cleanup always runs regardless.
            config.hasExplorers =
              remoteConfigLoaded && this.remoteConfig.configuration.components.state.explorers.length > 0;
            config.hasRelays =
              remoteConfigLoaded && this.remoteConfig.configuration.components.state.relayNodes.length > 0;
            config.hasMirrorNodes =
              remoteConfigLoaded && this.remoteConfig.configuration.components.state.mirrorNodes.length > 0;
            config.hasBlockNodes = remoteConfigLoaded
              ? this.remoteConfig.configuration.components.state.blockNodes.length > 0
              : false;
          },
        }),
      }),
      new OrchestratorPipelinePhase('Acquire deployment lock', {
        asListrTask: (
          getConfig: () => OneShotSingleDestroyConfigClass,
        ): SoloListrTask<OneShotSingleDestroyContext> => ({
          title: 'Acquire deployment lock',
          task: async (
            _: OneShotSingleDestroyContext,
            task: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
          ): Promise<Listr<OneShotSingleDestroyContext>> => {
            leaseReference.value = await this.leaseManager.create();
            return ListrLock.newAcquireLockTask(leaseReference.value, task);
          },
          // The lock lives in the cluster; skip it when there is nothing to do, the cluster is
          // unreachable, or the caller already holds the lock (e.g. one-shot deploy's auto-clean).
          skip: (): boolean => skipDeploymentLock || getConfig().skipAll || getConfig().skipClusterCleanup,
        }),
      }),
      OrchestratorPipelinePhase.composite(
        'Destroy',
        destroySubPhases,
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        false,
        {collapseSubtasks: false},
        (getConfig: () => OneShotSingleDestroyConfigClass): boolean => getConfig().skipAll,
        // Render each destroy step (mirror/block/consensus/cluster reset/disconnect/deployment delete,
        // and the concurrent explorer+relay group) as a single collapsed line.
        true,
      ),
      new OrchestratorPipelinePhase('Remove output directory', {
        asListrTask: (
          getConfig: () => OneShotSingleDestroyConfigClass,
        ): SoloListrTask<OneShotSingleDestroyContext> => ({
          title: 'Remove output directory',
          task: async (): Promise<void> => {
            const outputDirectory: string = this.getOneShotOutputDirectory(getConfig().deployment);
            this.logger.info(`Removing one-shot output directory: ${outputDirectory}`);
            fs.rmSync(outputDirectory, {recursive: true, force: true});
          },
          skip: (): boolean => !getConfig().deployment,
        }),
      }),
    ];

    return new OrchestratorPipeline<OneShotSingleDestroyContext>(
      phases.map(
        (
          phase: OrchestratorPipelinePhase<OneShotSingleDestroyConfigClass, OneShotSingleDestroyContext>,
        ): SoloListrTask<OneShotSingleDestroyContext> => phase.asListrTask(getConfigGlobal, this.eventBus),
      ),
      // Animate the collapsed destroy lines with a spinner (the default renderer otherwise shows a
      // static pointer for a running task with hidden subtasks).
      SpinnerListrOptions.build() as ListrBaseClassOptions<OneShotSingleDestroyContext>,
    );
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return Templates.renderOneShotOutputDirectory(deploymentName);
  }

  private async loadRemoteConfigOrWarn(argv: ArgvStruct): Promise<boolean> {
    try {
      await this.remoteConfig.loadAndValidate(argv, true, true);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to load remote config; continuing destroy: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}
