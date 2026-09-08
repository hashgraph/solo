// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type Listr, type ListrBaseClassOptions, type ListrContext, type ListrRendererValue} from 'listr2';
import {
  AccountId,
  type Client,
  HbarUnit,
  PublicKey,
  TopicCreateTransaction,
  TopicId,
  TopicInfoQuery,
} from '@hiero-ledger/sdk';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {UserInput} from '../../../../core/user-input.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloEventBus} from '../../../../core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../core/events/event-types/solo-event.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type Realm, type Shard} from '../../../../types/index.js';
import {type AccountManager} from '../../../../core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {type OneShotState} from '../../../../core/one-shot-state.js';
import {type K8Factory} from '../../../../integration/kube/k8-factory.js';
import {type HelmClient} from '../../../../integration/helm/helm-client.js';
import {type ContainerEngineResourceInspector} from '../../../../integration/container-engine/container-engine-resource-inspector.js';
import {ContainerResourcePreflight} from '../../../../core/container-resource-preflight.js';
import {type ReleaseItem} from '../../../../integration/helm/model/release/release-item.js';
import {type LockManager} from '../../../../core/lock/lock-manager.js';
import {type ComponentFactoryApi} from '../../../../core/config/remote/api/component-factory-api.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type OneShotSingleDeployConfigClass} from '../../one-shot-single-deploy-config-class.js';
import {type OneShotVersionsObject} from '../../one-shot-versions-object.js';
import {type OneShotSingleDeployContext} from '../../one-shot-single-deploy-context.js';
import {type DeploymentStateSnapshot} from '../../deployment-state-snapshot.js';
import {
  type CreatedPredefinedAccount,
  predefinedEcdsaAccountsWithAlias,
  PREDEFINED_ACCOUNT_GROUPS,
  type PredefinedAccount,
  type SystemAccount,
  type FormattedSystemAccount,
  type FormattedCreatedAccount,
} from '../../predefined-accounts.js';
import {type OneShotDeployOrchestrator} from './one-shot-deploy-orchestrator.js';
import {OrchestratorPipelinePhase} from '../orchestrator-pipeline-phase.js';
import {type ExecutionMode} from '../execution-mode.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {MirrorNodeCommand} from '../../../mirror-node.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../command-definitions/keys-command-definition.js';
import {type InvokedSoloCommand, invokeSoloCommand} from '../../../command-helpers.js';
import {Flags as flags} from '../../../flags.js';
import * as constants from '../../../../core/constants.js';
import {createDirectoryIfNotExists, entityId, Helpers, sleep} from '../../../../core/helpers.js';
import {Duration} from '../../../../core/time/duration.js';
import {BlockNodeDeployedEvent} from '../../../../core/events/event-types/block-node-deployed-event.js';
import {MirrorNodeDeployedEvent} from '../../../../core/events/event-types/mirror-node-deployed-event.js';
import {ListrLock} from '../../../../core/lock/listr-lock.js';
import {UserBreak} from '../../../../core/errors/user-break.js';
import {ConfirmationRequiredSoloError} from '../../../../core/errors/classes/validation/confirmation-required-solo-error.js';
import {ValuesFileNotFoundSoloError} from '../../../../core/errors/classes/validation/values-file-not-found-solo-error.js';
import {ValuesFileParser} from '../../../../core/util/values-file-parser.js';
import {Templates} from '../../../../core/templates.js';
import {PathEx} from '../../../../business/utils/path-ex.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';
import {NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type Deployment} from '../../../../business/runtime-state/config/local/deployment.js';
import {type StringFacade} from '../../../../business/runtime-state/facade/string-facade.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type CommandFlag, type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {BlockNodeStateSchema} from '../../../../data/schema/model/remote/state/block-node-state-schema.js';
import {MirrorNodeStateSchema} from '../../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {ExplorerStateSchema} from '../../../../data/schema/model/remote/state/explorer-state-schema.js';
import {RelayNodeStateSchema} from '../../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../../../../core/config/remote/enumerations/component-types.js';
import {ServiceReference} from '../../../../integration/kube/resources/service/service-reference.js';
import {ServiceName} from '../../../../integration/kube/resources/service/service-name.js';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import {DeployArgvBuilders} from './deploy-argv-builders.js';
import {OrchestratorPipeline} from '../orchestrator-pipeline.js';
import {SINGLE_DESTROY_COMMAND} from '../../one-shot-command-paths.js';
import {MINIMUM_CN_VERSION_FOR_SMALL_MEMORY, MINIMUM_CN_VERSION_FOR_STATE_ON_DISK} from '../../../../../version.js';
import {CacheCommandDefinition} from '../../../command-definitions/cache-command-definition.js';
import {MessageLevel} from '../../../../core/logging/message-level.js';
import {isDeploymentPhaseAtLeast} from '../../../../data/schema/model/remote/deployment-phase-helper.js';
import {SpinnerListrOptions} from '../../../../core/spinner-listr-options.js';
import {ClusterTaskManager} from '../../../../core/cluster-task-manager.js';

const SINGLE_DEPLOY_CONFIGS_NAME: string = 'singleAddConfigs';

@injectable()
export class DefaultOneShotDeployOrchestrator implements OneShotDeployOrchestrator {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.OneShotState) private readonly oneShotState: OneShotState,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
    @inject(InjectTokens.Helm) private readonly helm: HelmClient,
    @inject(InjectTokens.MirrorNodeCommand) private readonly mirrorNodeCommand: MirrorNodeCommand,
    @inject(InjectTokens.ContainerEngineResourceInspector)
    private readonly containerEngineResourceInspector: ContainerEngineResourceInspector,
    @inject(InjectTokens.ClusterTaskManager) private readonly clusterTaskManager: ClusterTaskManager,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.componentFactory = patchInject(componentFactory, InjectTokens.ComponentFactory, this.constructor.name);
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.mirrorNodeCommand = patchInject(mirrorNodeCommand, InjectTokens.MirrorNodeCommand, this.constructor.name);
    this.containerEngineResourceInspector = patchInject(
      containerEngineResourceInspector,
      InjectTokens.ContainerEngineResourceInspector,
      this.constructor.name,
    );
    this.clusterTaskManager = patchInject(clusterTaskManager, InjectTokens.ClusterTaskManager, this.constructor.name);
  }

  public buildDeployPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
    configReference: {value?: OneShotSingleDeployConfigClass},
  ): OrchestratorPipeline<OneShotSingleDeployContext> {
    let config: OneShotSingleDeployConfigClass;
    const getConfigGlobal: () => OneShotSingleDeployConfigClass = (): OneShotSingleDeployConfigClass => config;

    const phases: Array<OrchestratorPipelinePhase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>> = [
      new OrchestratorPipelinePhase('Initialize', {
        asListrTask: (): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Initialize',
          task: async (
            context_: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<void> => {
            this.configManager.update(argv);
            this.oneShotState.activate();

            // Warn if the local container engine reports fewer resources than recommended
            await ContainerResourcePreflight.warnIfInsufficient(this.containerEngineResourceInspector, this.logger);

            const edgeEnabled: boolean = this.configManager.getFlag(flags.edgeEnabled);
            const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(
              argv,
              edgeEnabled,
            );

            this.configManager.setFlag(flags.consensusNodeVersion, versions.consensus);
            this.configManager.setFlag(flags.blockNodeVersion, versions.blockNode);
            this.configManager.setFlag(flags.mirrorNodeVersion, versions.mirror);
            this.configManager.setFlag(flags.relayVersion, versions.relay);
            this.configManager.setFlag(flags.explorerVersion, versions.explorer);
            this.configManager.setFlag(flags.soloChartVersion, versions.soloChart);

            flags.disablePrompts(flagsList.optional);

            const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              SINGLE_DEPLOY_CONFIGS_NAME,
              allFlags,
            ) as OneShotSingleDeployConfigClass;
            config = context_.config;
            configReference.value = config;
            config.argv = argv;

            config.consensusNodeConfiguration = {};
            config.mirrorNodeConfiguration = {};
            config.blockNodeConfiguration = {};
            config.explorerNodeConfiguration = {};
            config.relayNodeConfiguration = {};
            config.networkConfiguration = {};
            config.setupConfiguration = {};
            config.versions = versions;
            // The dependency-install preamble ran before this pipeline; if it created the Kind
            // cluster, the one-shot extraPortMappings exist and port-forwards can be skipped.
            config.clusterHasOneShotPortMappings = this.clusterTaskManager.createdClusterWithOneShotPortMappings;

            config.cacheDir ??= constants.SOLO_CACHE_DIR;

            if (config.valuesFile) {
              if (!fs.existsSync(config.valuesFile)) {
                throw new ValuesFileNotFoundSoloError(config.valuesFile);
              }
              const valuesFileContent: string = fs.readFileSync(context_.config.valuesFile, 'utf8');
              const profileItems: Record<string, object> =
                (ValuesFileParser.parse(context_.config.valuesFile, valuesFileContent) as Record<string, object>) ?? {};

              if (profileItems.network) {
                config.networkConfiguration = profileItems.network as object;
              }
              if (profileItems.setup) {
                config.setupConfiguration = profileItems.setup as object;
              }
              if (profileItems.consensusNode) {
                config.consensusNodeConfiguration = profileItems.consensusNode as object;
              }
              if (profileItems.mirrorNode) {
                config.mirrorNodeConfiguration = profileItems.mirrorNode as object;
              }
              if (profileItems.blockNode) {
                config.blockNodeConfiguration = profileItems.blockNode as object;
              }
              if (profileItems.explorerNode) {
                config.explorerNodeConfiguration = profileItems.explorerNode as object;
              }
              if (profileItems.relayNode) {
                config.relayNodeConfiguration = profileItems.relayNode as object;
              }
            }
            config.clusterRef ||= 'one-shot';
            config.context ||= this.k8Factory.default().contexts().readCurrent();
            config.deployment ||= constants.ONE_SHOT_DEPLOYMENT_NAME;
            config.namespace ||= NamespaceName.of(constants.ONE_SHOT_DEPLOYMENT_NAME);
            this.configManager.setFlag(flags.namespace, config.namespace);
            config.numberOfConsensusNodes ||= 1;
            config.force = argv.force as boolean;

            await this.localConfig.load();

            // Guard against accidental one-shot deployments to non-Kind Kubernetes contexts.
            // Quiet mode bypasses the confirmation prompt.
            await this.confirmNonKindContext(config, task);

            // Ensure release tag is set in network configuration so subcommands use the correct version
            const releaseTagKey: string = flags.getFormattedFlagKey(flags.consensusNodeVersion);
            const soloChartVersionKey: string = flags.getFormattedFlagKey(flags.soloChartVersion);
            if (!config.networkConfiguration[releaseTagKey]) {
              config.networkConfiguration[releaseTagKey] = versions.consensus;
            }
            if (!config.networkConfiguration[soloChartVersionKey]) {
              config.networkConfiguration[soloChartVersionKey] = versions.soloChart;
            }
            if (!config.setupConfiguration[releaseTagKey]) {
              config.setupConfiguration[releaseTagKey] = versions.consensus;
            }

            this.reconcileEffectiveVersions(config);

            this.logger.addLogBindings({
              clusterReference: config.clusterRef,
              context: config.context,
              deployment: config.deployment,
              namespace: config.namespace.name,
            });

            // Apply small-memory node configuration only for CN >= 0.72.0 and when not using `one-shot falcon deploy`
            const cnVersion: SemanticVersion<string> = new SemanticVersion(versions.consensus);
            if (!config.valuesFile && cnVersion.greaterThanOrEqual(MINIMUM_CN_VERSION_FOR_SMALL_MEMORY)) {
              const defaultsDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, 'templates');
              const overridesDirectory: string = PathEx.join(defaultsDirectory, 'small-memory');
              const stateOnDiskDirectory: string = PathEx.join(defaultsDirectory, 'small-memory-state-on-disk');
              const mergedDirectory: string = PathEx.join(defaultsDirectory, 'small-memory-merged');
              const settingsOverrideFile: string =
                config.numberOfConsensusNodes > 1 ? 'settings-multinode.txt' : 'settings-single.txt';
              const useStateOnDisk: boolean = cnVersion.greaterThanOrEqual(MINIMUM_CN_VERSION_FOR_STATE_ON_DISK);

              const settingsMergedPath: string = PathEx.join(mergedDirectory, 'settings.txt');
              this.concatConfigFiles(
                PathEx.join(defaultsDirectory, 'settings.txt'),
                PathEx.join(overridesDirectory, settingsOverrideFile),
                settingsMergedPath,
              );
              config.networkConfiguration[flags.getFormattedFlagKey(flags.settingTxt)] = useStateOnDisk
                ? this.concatConfigFiles(
                    settingsMergedPath,
                    PathEx.join(stateOnDiskDirectory, 'settings.txt'),
                    settingsMergedPath,
                  )
                : settingsMergedPath;

              const mergedApplicationPropertiesPath: string = PathEx.join(
                mergedDirectory,
                constants.APPLICATION_PROPERTIES,
              );
              config.networkConfiguration[flags.getFormattedFlagKey(flags.applicationProperties)] =
                this.concatConfigFiles(
                  PathEx.join(defaultsDirectory, constants.APPLICATION_PROPERTIES),
                  PathEx.join(overridesDirectory, constants.APPLICATION_PROPERTIES),
                  mergedApplicationPropertiesPath,
                );

              // Remove the properties that are managed by solo from the template.
              // They will be populated later when building the staging directory
              const applicationPropertiesMerged: string = fs.readFileSync(mergedApplicationPropertiesPath, 'utf8');
              const propertiesLines: string[] = applicationPropertiesMerged.split('\n');
              const soloManagedKeys: Set<string> = new Set([
                'hedera.realm',
                'hedera.shard',
                'contracts.chainId',
                'blockStream.streamMode',
                'blockStream.writerMode',
              ]);
              const filteredLines: string[] = propertiesLines.filter((line: string): boolean => {
                const keyValuePair: string[] = line.split('=');
                if (keyValuePair && keyValuePair.length === 2) {
                  return !soloManagedKeys.has(keyValuePair[0]);
                }
                return true;
              });

              fs.writeFileSync(mergedApplicationPropertiesPath, filteredLines.join('\n'));

              // For CN >= 0.73.0, use state-on-disk application.env instead of default small-memory
              config.networkConfiguration[flags.getFormattedFlagKey(flags.applicationEnv)] = PathEx.join(
                useStateOnDisk ? stateOnDiskDirectory : overridesDirectory,
                'application.env',
              );

              const throttlesFile: string = PathEx.join(overridesDirectory, 'throttles.json');
              if (fs.existsSync(throttlesFile)) {
                config.networkConfiguration[flags.getFormattedFlagKey(flags.genesisThrottlesFile)] = throttlesFile;
              }

              // For CN >= 0.73.0, cap K8s container memory at 1Gi to prevent unbounded mmap'd state-on-disk page cache growth
              if (useStateOnDisk) {
                const helmOverrideFile: string = PathEx.join(stateOnDiskDirectory, 'helm-overrides.yaml');
                if (fs.existsSync(helmOverrideFile)) {
                  config.networkConfiguration[flags.getFormattedFlagKey(flags.valuesFile)] =
                    `${config.clusterRef}=${helmOverrideFile}`;
                }
              }
            }

            config.deployMirrorNode = config.deployMirrorNode === undefined ? true : config.deployMirrorNode;
            config.deployExplorer = config.deployExplorer === undefined ? true : config.deployExplorer;
            config.deployRelay = config.deployRelay === undefined ? true : config.deployRelay;
            config.pinger = config.pinger === undefined ? true : config.pinger;

            context_.createdAccounts = [];
          },
        }),
      }),
      new OrchestratorPipelinePhase('Check existing deployment state', {
        asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Check existing deployment state',
          exitOnError: false,
          task: async (context_: OneShotSingleDeployContext): Promise<void> => {
            context_.deploymentStateSnapshot = await this.buildDeploymentStateSnapshot(getConfig());
          },
        }),
      }),
      // One-shot deploy always starts from a clean slate: if the snapshot shows any pre-existing
      // one-shot state, auto-destroy it and deploy fresh rather than attempt to resume. The snapshot
      // proves existence, not health, so a partial or broken prior deployment cannot be trusted to
      // resume cleanly — rebuilding is the predictable behavior. That includes a local config which
      // claims a deployment the cluster can no longer back: its remote config is gone, so there is
      // nothing left to resume, only leftovers to clear out. The confirmation and the destroy it
      // gates both run before the deploy lock is acquired because the invoked destroy acquires the
      // same lock.
      new OrchestratorPipelinePhase('Confirm cleanup of existing deployment state', {
        asListrTask: (): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Confirm cleanup of existing deployment state',
          task: async (
            context_: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<void> => {
            // Destroying prior installs always requires explicit confirmation. Quiet/force run
            // non-interactively and cannot present the prompt
            if (context_.config.quiet === true || context_.config.force === true) {
              throw new ConfirmationRequiredSoloError(
                'cleaning up the existing one-shot deployment',
                'Re-run without --quiet or --force so the confirmation prompt can be shown, ' +
                  `or destroy it explicitly with 'solo ${SINGLE_DESTROY_COMMAND}'.`,
              );
            }
            const proceed: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
              default: false,
              message: this.buildAutoCleanConfirmationMessage(context_.deploymentStateSnapshot),
            });
            if (!proceed) {
              throw new UserBreak('Aborted by user');
            }
          },
          // Nothing to confirm when there is no pre-existing state.
          skip: (context_: OneShotSingleDeployContext): boolean =>
            !this.hasExistingOneShotState(context_.deploymentStateSnapshot),
        }),
      }),
      new OrchestratorPipelinePhase('Auto-clean existing deployment state', {
        asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => {
          const baseTask: InvokedSoloCommand = invokeSoloCommand(
            `solo ${SINGLE_DESTROY_COMMAND}`,
            SINGLE_DESTROY_COMMAND,
            (): string[] => DeployArgvBuilders.buildOneShotSingleDestroyArgv(getConfig()),
            this.taskList,
          );
          return {
            ...baseTask,
            skip: (context_: OneShotSingleDeployContext): boolean => {
              if (!this.hasExistingOneShotState(context_.deploymentStateSnapshot)) {
                return true;
              }
              this.logger.showUser(
                chalk.yellow('Existing one-shot deployment state detected; cleaning up before proceeding'),
              );
              return false;
            },
          };
        },
      }),
      new OrchestratorPipelinePhase('Acquire deployment lock', {
        asListrTask: (): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Acquire deployment lock',
          task: async (
            _: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<Listr<OneShotSingleDeployContext>> => {
            leaseReference.value = await this.leaseManager.create();
            return ListrLock.newAcquireLockTask(leaseReference.value, task);
          },
        }),
      }),
      OrchestratorPipelinePhase.composite(
        'Cache container images',
        [
          new OrchestratorPipelinePhase('Pull docker images', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${CacheCommandDefinition.IMAGE_PULL_COMMAND}`,
                CacheCommandDefinition.IMAGE_PULL_COMMAND,
                (): string[] => DeployArgvBuilders.buildImagePullArgv(getConfig()),
                this.taskList,
              ),
          }),
          new OrchestratorPipelinePhase('Load docker images', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${CacheCommandDefinition.IMAGE_LOAD_COMMAND}`,
                CacheCommandDefinition.IMAGE_LOAD_COMMAND,
                (): string[] => DeployArgvBuilders.buildImageLoadArgv(getConfig()),
                this.taskList,
              ),
          }),
        ],
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        true,
        undefined,
        // Skip the whole group when the image cache is disabled.
        (): boolean => !constants.CONFIG.ENABLE_IMAGE_CACHE,
        (getConfig: () => OneShotSingleDeployConfigClass): boolean => getConfig()?.parallelDeploy === true,
      ),
      OrchestratorPipelinePhase.composite(
        'Prepare cluster and deployment',
        [
          new OrchestratorPipelinePhase('Cluster connect', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${ClusterReferenceCommandDefinition.CONNECT_COMMAND}`,
                ClusterReferenceCommandDefinition.CONNECT_COMMAND,
                (): string[] => DeployArgvBuilders.buildClusterConnectArgv(getConfig()),
                this.taskList,
              ),
          }),
          new OrchestratorPipelinePhase('Deployment create', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${DeploymentCommandDefinition.CREATE_COMMAND}`,
                DeploymentCommandDefinition.CREATE_COMMAND,
                (): string[] => DeployArgvBuilders.buildDeploymentCreateArgv(getConfig()),
                this.taskList,
              ),
          }),
          new OrchestratorPipelinePhase('Deployment attach', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${DeploymentCommandDefinition.ATTACH_COMMAND}`,
                DeploymentCommandDefinition.ATTACH_COMMAND,
                (): string[] => DeployArgvBuilders.buildDeploymentAttachArgv(getConfig()),
                this.taskList,
              ),
          }),
          new OrchestratorPipelinePhase('Cluster setup', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${ClusterReferenceCommandDefinition.SETUP_COMMAND}`,
                ClusterReferenceCommandDefinition.SETUP_COMMAND,
                (): string[] => DeployArgvBuilders.buildClusterSetupArgv(getConfig()),
                this.taskList,
              ),
          }),
          new OrchestratorPipelinePhase('Keys generate', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${KeysCommandDefinition.KEYS_COMMAND}`,
                KeysCommandDefinition.KEYS_COMMAND,
                (): string[] => DeployArgvBuilders.buildKeysGenerateArgv(getConfig()),
                this.taskList,
              ),
          }),
        ],
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        true,
        undefined,
        undefined,
        // Collapse each setup step to a single line in parallel mode; --no-parallel-deploy keeps full detail.
        (getConfig: () => OneShotSingleDeployConfigClass): boolean => getConfig()?.parallelDeploy === true,
      ),
      new OrchestratorPipelinePhase('Create remote config components', {
        asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Create remote config components',
          task: async (): Promise<void> => {
            const deployConfig: OneShotSingleDeployConfigClass = getConfig();
            if (DeployArgvBuilders.shouldDeployBlockNode(deployConfig)) {
              const blockNode: BlockNodeStateSchema = this.componentFactory.createNewBlockNodeComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              blockNode.metadata.phase = DeploymentPhase.REQUESTED;

              const blockNodeAdded: boolean = this.remoteConfig.configuration.components.addNewComponent(
                blockNode,
                ComponentTypes.BlockNode,
                false,
                true,
              );

              if (!blockNodeAdded) {
                this.logger.info(`Block node with id: ${blockNode.metadata.id} already exists, skipping creation`);
              }
            }

            if (deployConfig.deployExplorer) {
              const explorer: ExplorerStateSchema = this.componentFactory.createNewExplorerComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              explorer.metadata.phase = DeploymentPhase.REQUESTED;

              const explorerAdded: boolean = this.remoteConfig.configuration.components.addNewComponent(
                explorer,
                ComponentTypes.Explorer,
                false,
                true,
              );

              if (!explorerAdded) {
                this.logger.info(`Explorer with id: ${explorer.metadata.id} already exists, skipping creation`);
              }
            }

            if (deployConfig.deployMirrorNode) {
              const mirrorNode: MirrorNodeStateSchema = this.componentFactory.createNewMirrorNodeComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              mirrorNode.metadata.phase = DeploymentPhase.REQUESTED;

              const mirrorNodeAdded: boolean = this.remoteConfig.configuration.components.addNewComponent(
                mirrorNode,
                ComponentTypes.MirrorNode,
                false,
                true,
              );

              if (!mirrorNodeAdded) {
                this.logger.info(`Mirror node with id ${mirrorNode.metadata.id} already exists, skipping creation`);
              }
            }

            if (deployConfig.deployRelay) {
              const nodeIds: NodeId[] = [];
              for (const alias of Templates.renderNodeAliasesFromCount(deployConfig.numberOfConsensusNodes, 0)) {
                nodeIds.push(Templates.nodeIdFromNodeAlias(alias));
              }
              const relay: RelayNodeStateSchema = this.componentFactory.createNewRelayComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
                nodeIds,
              );
              relay.metadata.phase = DeploymentPhase.REQUESTED;
              const relayAdded: boolean = this.remoteConfig.configuration.components.addNewComponent(
                relay,
                ComponentTypes.RelayNodes,
                false,
                true,
              );

              if (!relayAdded) {
                this.logger.info(`Relay node with id: ${relay.metadata.id} already exists, skipping creation`);
              }
            }

            await this.remoteConfig.persist();
          },
        }),
      }),
      OrchestratorPipelinePhase.composite(
        'Deploy Solo components',
        [
          new OrchestratorPipelinePhase('Deploy block node', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${BlockCommandDefinition.ADD_COMMAND}`,
                BlockCommandDefinition.ADD_COMMAND,
                (): string[] => DeployArgvBuilders.buildBlockNodeArgv(getConfig()),
                this.taskList,
                OrchestratorPipelinePhase.skipAndNotify(
                  this.eventBus,
                  (): boolean => !DeployArgvBuilders.shouldDeployBlockNode(getConfig()),
                  [(): BlockNodeDeployedEvent => new BlockNodeDeployedEvent(getConfig().deployment)],
                ),
              ),
          }),
          OrchestratorPipelinePhase.composite('Deploy network node', [
            new OrchestratorPipelinePhase('Deploy consensus node', {
              asListrTask: (
                getConfig: () => OneShotSingleDeployConfigClass,
              ): SoloListrTask<OneShotSingleDeployContext> =>
                invokeSoloCommand(
                  `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
                  ConsensusCommandDefinition.DEPLOY_COMMAND,
                  (): string[] => DeployArgvBuilders.buildConsensusDeployArgv(getConfig()),
                  this.taskList,
                ),
              // consensus network deploy has a "Copy block-nodes.json" step that reads blockNodeMap.
              // Gate it on BlockNodeDeployed so block-node add has fully populated blockNodeMap before
              // consensus network deploy runs.
            }).withWaitCondition(SoloEventType.BlockNodeDeployed, Duration.ofMinutes(10)),
            OrchestratorPipelinePhase.composite('Setup and start consensus node', [
              new OrchestratorPipelinePhase('Setup consensus node', {
                asListrTask: (
                  getConfig: () => OneShotSingleDeployConfigClass,
                ): SoloListrTask<OneShotSingleDeployContext> =>
                  invokeSoloCommand(
                    `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
                    ConsensusCommandDefinition.SETUP_COMMAND,
                    (): string[] => DeployArgvBuilders.buildConsensusSetupArgv(getConfig()),
                    this.taskList,
                  ),
              }),
              new OrchestratorPipelinePhase('Start consensus node', {
                asListrTask: (
                  getConfig: () => OneShotSingleDeployConfigClass,
                ): SoloListrTask<OneShotSingleDeployContext> =>
                  invokeSoloCommand(
                    `solo ${ConsensusCommandDefinition.START_COMMAND}`,
                    ConsensusCommandDefinition.START_COMMAND,
                    (): string[] => DeployArgvBuilders.buildConsensusStartArgv(getConfig()),
                    this.taskList,
                  ),
              }),
              new OrchestratorPipelinePhase('Create accounts', {
                asListrTask: (
                  getConfig: () => OneShotSingleDeployConfigClass,
                ): SoloListrTask<OneShotSingleDeployContext> => this.buildCreateAccountsTask(getConfig()),
              }),
            ]),
          ]),
          new OrchestratorPipelinePhase('Deploy mirror node', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
                MirrorCommandDefinition.ADD_COMMAND,
                (): string[] => DeployArgvBuilders.buildMirrorNodeArgv(getConfig(), false),
                this.taskList,
                OrchestratorPipelinePhase.skipAndNotify(this.eventBus, (): boolean => !getConfig().deployMirrorNode, [
                  (): MirrorNodeDeployedEvent => new MirrorNodeDeployedEvent(getConfig().deployment),
                ]),
              ),
          }),
          new OrchestratorPipelinePhase('Enable mirror pinger', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${MirrorCommandDefinition.UPGRADE_COMMAND}`,
                MirrorCommandDefinition.UPGRADE_COMMAND,
                (): string[] => DeployArgvBuilders.buildMirrorNodePingerUpgradeArgv(getConfig()),
                this.taskList,
                (): boolean => !getConfig().deployMirrorNode || !getConfig().pinger,
              ),
          })
            .withWaitCondition(
              SoloEventType.MirrorNodeDeployed,
              Duration.ofMinutes(constants.MIRROR_NODE_DEPLOYED_EVENT_TIMEOUT_MINUTES),
            )
            .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(10)),
          new OrchestratorPipelinePhase('Deploy explorer', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
                ExplorerCommandDefinition.ADD_COMMAND,
                (): string[] => DeployArgvBuilders.buildExplorerArgv(getConfig()),
                this.taskList,
                (): boolean => !getConfig().deployExplorer && !getConfig().minimalSetup,
              ),
          }).withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10)),
          new OrchestratorPipelinePhase('Deploy JSON-RPC Relay', {
            asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${RelayCommandDefinition.ADD_COMMAND}`,
                RelayCommandDefinition.ADD_COMMAND,
                (): string[] => DeployArgvBuilders.buildRelayArgv(getConfig()),
                this.taskList,
                (): boolean => !getConfig().deployRelay && !getConfig().minimalSetup,
              ),
          })
            .withWaitCondition(
              SoloEventType.MirrorNodeDeployed,
              Duration.ofMinutes(constants.MIRROR_NODE_DEPLOYED_EVENT_TIMEOUT_MINUTES),
            )
            .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(10)),
        ],
        (getConfig: () => OneShotSingleDeployConfigClass): ExecutionMode =>
          getConfig().parallelDeploy
            ? OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT
            : OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        true,
        {collapseSubtasks: false},
        undefined,
        // In parallel mode, render each component (block, network, mirror, explorer, relay) as a
        // single collapsed line so their concurrent subtrees do not overwrite one another.
        (getConfig: () => OneShotSingleDeployConfigClass): boolean => getConfig()?.parallelDeploy === true,
      ),
      new OrchestratorPipelinePhase('Finish', {
        asListrTask: (getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Finish',
          task: async (context_: OneShotSingleDeployContext): Promise<void> => {
            const deployConfig: OneShotSingleDeployConfigClass = getConfig();
            const outputDirectory: string = this.getOneShotOutputDirectory(context_.config.deployment);
            this.logger.info(`Output directory: ${outputDirectory}`);
            this.showOneShotUserNotes(context_, PathEx.join(outputDirectory, 'notes'));
            this.showVersions(PathEx.join(outputDirectory, 'versions'), deployConfig);
            await this.exposeNodePortServices(deployConfig);
            this.showPortForwards(PathEx.join(outputDirectory, 'forwards'));
            this.showCacheImageFailures();
            this.showAccounts(context_.createdAccounts, context_, PathEx.join(outputDirectory, 'accounts.json'));
          },
        }),
      }),
    ];

    // In parallel mode the components are collapsed to single lines (showSubtasks: false) since their
    // concurrent subtrees would otherwise interleave.
    const parallel: boolean = argv[flags.parallelDeploy.name] !== false;

    return new OrchestratorPipeline<OneShotSingleDeployContext>(
      phases.map(
        (
          phase: OrchestratorPipelinePhase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>,
        ): SoloListrTask<OneShotSingleDeployContext> => phase.asListrTask(getConfigGlobal, this.eventBus),
      ),
      parallel
        ? (SpinnerListrOptions.build() as ListrBaseClassOptions<OneShotSingleDeployContext>)
        : (constants.LISTR_DEFAULT_OPTIONS.DEFAULT as ListrBaseClassOptions<OneShotSingleDeployContext>),
    );
  }

  private buildCreateAccountsTask(config: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> {
    return {
      title: 'Create Accounts',
      // Skip when predefined accounts are disabled.
      skip: (): boolean => config.predefinedAccounts === false,
      task: async (
        _: OneShotSingleDeployContext,
        task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
      ): Promise<Listr<OneShotSingleDeployContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(config.argv);

        const subTasks: SoloListrTask<OneShotSingleDeployContext>[] = [];

        const client: Client = await this.accountManager.loadNodeClient(
          config.namespace,
          this.remoteConfig.getClusterRefs(),
          config.deployment,
        );

        const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
        const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);

        try {
          const entity1001Query: TopicInfoQuery = new TopicInfoQuery().setTopicId(
            TopicId.fromString(entityId(realm, shard, 1001)),
          );
          await entity1001Query.execute(client);
        } catch (topicCheckError) {
          try {
            if (topicCheckError.message.includes('INVALID_TOPIC_ID')) {
              const bufferTopic: TopicCreateTransaction = new TopicCreateTransaction().setTopicMemo(
                'Buffer topic to bump entity IDs',
              );
              await bufferTopic.execute(client);
            }
          } catch (topicCreateError) {
            this.logger.warn(
              'Failed to create topic. Created account IDs may be offset from the expected values.',
              topicCreateError,
            );
          }
        }

        const accountsToCreate: PredefinedAccount[] = [...predefinedEcdsaAccountsWithAlias];

        for (const [index, account] of accountsToCreate.entries()) {
          ((currentIndex: number, currentAccount: PredefinedAccount): void => {
            subTasks.push({
              title: `Creating Account ${currentIndex}`,
              task: async (
                context_: OneShotSingleDeployContext,
                subTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
              ): Promise<void> => {
                await sleep(Duration.ofMillis(100 * currentIndex));

                const createdAccount: {
                  accountId: string;
                  privateKey: string;
                  publicKey: string;
                  balance: number;
                  accountAlias?: string;
                } = await this.accountManager.createNewAccount(
                  context_.config.namespace,
                  currentAccount.privateKey,
                  currentAccount.balance.to(HbarUnit.Hbar).toNumber(),
                  currentAccount.alias,
                  context_.config.context,
                );

                const newCreatedAccount: CreatedPredefinedAccount = {
                  accountId: AccountId.fromString(createdAccount.accountId),
                  data: currentAccount,
                  alias: createdAccount.accountAlias,
                  publicKey: createdAccount.publicKey,
                };
                context_.createdAccounts.push(newCreatedAccount);

                subTask.title = `Account created: ${createdAccount.accountId.toString()}`;
              },
            });
          })(index, account);
        }

        return task.newListr(subTasks, {
          concurrent: config.parallelDeploy,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  private concatConfigFiles(defaultFilePath: string, overrideFilePath: string, outputFilePath: string): string {
    const defaultContent: string = fs.existsSync(defaultFilePath) ? fs.readFileSync(defaultFilePath, 'utf8') : '';
    const overrideContent: string = fs.existsSync(overrideFilePath) ? fs.readFileSync(overrideFilePath, 'utf8') : '';

    const outputDirectory: string = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {recursive: true});
    }
    fs.writeFileSync(outputFilePath, defaultContent.trimEnd() + '\n' + overrideContent);
    return outputFilePath;
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${UserInput.safeFilenameComponent(deploymentName)}`);
  }

  /**
   * Returns true when the snapshot shows any pre-existing one-shot deployment state: a remote ConfigMap,
   * a recorded deployment whose remote ConfigMap has gone missing on a kind cluster, any installed
   * component Helm release, an accounts.json on disk, or any per-component phase at or beyond
   * DEPLOYED. Used to trigger an auto-clean before a fresh deploy: one-shot deploy rebuilds from a
   * clean slate rather than resuming prior state — see the "Auto-clean existing deployment state" step.
   */
  private hasExistingOneShotState(snapshot: DeploymentStateSnapshot | undefined): boolean {
    if (!snapshot) {
      return false;
    }
    if (
      snapshot.remoteConfig.configMapExists ||
      snapshot.remoteConfig.orphanedOnKindCluster ||
      snapshot.helm.installedReleases.size > 0 ||
      snapshot.accounts.accountsFileExists
    ) {
      return true;
    }
    for (const phase of snapshot.remoteConfig.componentPhases.values()) {
      if (isDeploymentPhaseAtLeast(phase, DeploymentPhase.DEPLOYED)) {
        return true;
      }
    }
    return false;
  }

  private async buildDeploymentStateSnapshot(
    deployConfig: OneShotSingleDeployConfigClass,
  ): Promise<DeploymentStateSnapshot> {
    let configMapExists: boolean = false;
    let componentPhases: Map<ComponentTypes, DeploymentPhase> = new Map();
    try {
      await this.remoteConfig.load(deployConfig.namespace, deployConfig.context);
      configMapExists = true;
      componentPhases = this.remoteConfig.getComponentPhasesMap();
    } catch {
      this.logger.info('Remote config unavailable during snapshot, treating as fresh deploy');
    }

    let installedReleases: Set<string> = new Set();
    try {
      const releases: ReleaseItem[] = await this.helm.listReleases(
        false,
        deployConfig.namespace.name,
        deployConfig.context,
      );
      installedReleases = new Set(releases.map((release: ReleaseItem): string => release.name));
    } catch {
      this.logger.info('Helm releases unavailable during snapshot, treating as fresh deploy');
    }

    const orphanedOnKindCluster: boolean = configMapExists
      ? false
      : await this.isRemoteConfigOrphanedOnKindCluster(deployConfig);

    const accountsFileExists: boolean = fs.existsSync(
      PathEx.join(this.getOneShotOutputDirectory(deployConfig.deployment), 'accounts.json'),
    );

    return {
      remoteConfig: {configMapExists, componentPhases, orphanedOnKindCluster},
      helm: {installedReleases},
      accounts: {accountsFileExists},
    };
  }

  /**
   * Returns true when the local config records a deployment against this kind cluster whose remote
   * config ConfigMap is provably absent, leaving the recorded deployment impossible to resume.
   */
  private async isRemoteConfigOrphanedOnKindCluster(deployConfig: OneShotSingleDeployConfigClass): Promise<boolean> {
    try {
      if (!Helpers.isKindContext(deployConfig.context)) {
        return false;
      }

      const recordedDeployment: Deployment | undefined = this.localConfig.configuration.deployments.find(
        (deployment: Deployment): boolean => deployment.name === deployConfig.deployment,
      );

      if (!recordedDeployment) {
        return false;
      }

      const attachedToThisCluster: boolean = recordedDeployment.clusters.some(
        (clusterReference: StringFacade): boolean =>
          this.localConfig.configuration.clusterRefs.get(clusterReference.toString())?.toString() ===
          deployConfig.context,
      );

      if (!attachedToThisCluster) {
        return false;
      }

      const remoteConfigExists: boolean = await this.k8Factory
        .getK8(deployConfig.context)
        .configMaps()
        .exists(NamespaceName.of(recordedDeployment.namespace), constants.SOLO_REMOTE_CONFIGMAP_NAME);

      return !remoteConfigExists;
    } catch (error) {
      // Cannot prove the ConfigMap is absent, so do not claim leftover state and risk destroying a
      // deployment that is merely unreachable.
      this.logger.info(
        `Could not determine whether the remote config is missing for deployment '${deployConfig.deployment}', treating it as present`,
        error,
      );
      return false;
    }
  }

  private showOneShotUserNotes(context_: OneShotSingleDeployContext, outputFile?: string): void {
    const messageGroupKey: string = 'one-shot-user-notes';
    const title: string = 'One Shot User Notes';

    this.logger.addMessageGroup(messageGroupKey, title);
    const data: string[] = [
      `Cluster Reference: ${context_.config.clusterRef}`,
      `Deployment Name: ${context_.config.deployment}`,
      `Namespace Name: ${context_.config.namespace.name}`,
    ];

    for (const line of data) {
      this.logger.addMessageGroupMessage(messageGroupKey, line);
    }

    this.logger.addMessageGroupMessage(
      messageGroupKey,
      'To quickly delete the deployed resources, run the following command:\n' +
        `kubectl delete ns ${context_.config.namespace.name}`,
    );

    this.logger.showMessageGroup(messageGroupKey);

    if (outputFile) {
      const fileData: string = data.join('\n') + '\n';
      createDirectoryIfNotExists(outputFile);
      fs.writeFileSync(outputFile, fileData);
      this.logger.showUser(chalk.green(`User notes saved to file: ${outputFile}`));
    }
  }

  private showVersions(outputFile: string, config: OneShotSingleDeployConfigClass): void {
    const messageGroupKey: string = 'versions-used';
    this.logger.addMessageGroup(messageGroupKey, 'Versions Used');

    const data: string[] = [
      `Solo Chart Version: ${config.versions.soloChart}`,
      `Consensus Node Version: ${config.versions.consensus}`,
      `Block Node Version: ${config.versions.blockNode}`,
      `Mirror Node Version: ${config.versions.mirror}`,
      `Explorer Version: ${config.versions.explorer}`,
      `JSON RPC Relay Version: ${config.versions.relay}`,
    ];

    for (const line of data) {
      this.logger.addMessageGroupMessage(messageGroupKey, line);
    }

    this.logger.showMessageGroup(messageGroupKey);
    if (outputFile) {
      const fileData: string = data.join('\n') + '\n';
      createDirectoryIfNotExists(outputFile);
      fs.writeFileSync(outputFile, fileData);
      this.logger.showUser(chalk.green(`Versions used saved to file: ${outputFile}`));
    }
  }

  // Surfaces any images that failed to cache or load during the run. Only shown when there were
  // failures, so a clean run prints nothing.
  private showCacheImageFailures(): void {
    if (this.logger.getMessageGroupKeys().includes(constants.CACHE_IMAGE_FAILURE_MESSAGE_GROUP)) {
      this.logger.showMessageGroup(constants.CACHE_IMAGE_FAILURE_MESSAGE_GROUP, MessageLevel.WARN);
    }
  }

  /**
   * Exposes the one-shot endpoints through the Kind cluster's extraPortMappings instead of kubectl
   * port-forward tunnels, and adds their stable access URLs to the port-forwarding message group
   * (reused so showPortForwards renders and files them). The mirror node is already exposed via its
   * ingress-controller NodePort values file; for the explorer, JSON RPC relay, and consensus node
   * gRPC this creates a fixed-NodePort service selecting the component's pods. NodePort and host
   * port values must match resources/templates/small-memory/kind-config.yaml.
   */
  private async exposeNodePortServices(config: OneShotSingleDeployConfigClass): Promise<void> {
    if (!config.clusterHasOneShotPortMappings) {
      // The Kind cluster pre-existed (or used a custom config), so the one-shot host port mappings
      // are absent; the subcommands kept their legacy kubectl port-forwards instead.
      return;
    }

    if (!this.logger.getMessageGroupKeys().includes(constants.PORT_FORWARDING_MESSAGE_GROUP)) {
      this.logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
    }

    // Only node1 gets a static gRPC host mapping — Kind extraPortMappings are fixed at cluster
    // creation, so additional consensus nodes cannot be mapped afterwards.
    // Fresh one-shot deploys always assign component id 1 to their single explorer/relay instance.
    const nodePortTargets: {
      deployed: boolean;
      hostPort: number;
      label: string;
      nodePort: number;
      podPort: number;
      selectorLabels: string[];
      serviceName: string;
    }[] = [
      {
        deployed: true,
        hostPort: constants.ONE_SHOT_CONSENSUS_GRPC_HOST_PORT,
        label: 'Consensus Node gRPC',
        nodePort: constants.ONE_SHOT_CONSENSUS_GRPC_NODE_PORT,
        podPort: constants.GRPC_PORT,
        selectorLabels: Templates.renderHaProxyLabels(1),
        serviceName: 'one-shot-consensus-grpc-nodeport',
      },
      {
        deployed: config.deployExplorer || config.minimalSetup,
        hostPort: constants.ONE_SHOT_EXPLORER_HOST_PORT,
        label: 'Explorer',
        nodePort: constants.ONE_SHOT_EXPLORER_NODE_PORT,
        podPort: constants.EXPLORER_PORT,
        selectorLabels: Templates.renderExplorerLabels(1),
        serviceName: 'one-shot-explorer-nodeport',
      },
      {
        deployed: config.deployRelay || config.minimalSetup,
        hostPort: constants.ONE_SHOT_RELAY_HOST_PORT,
        label: 'JSON RPC Relay',
        nodePort: constants.ONE_SHOT_RELAY_NODE_PORT,
        podPort: constants.JSON_RPC_RELAY_PORT,
        selectorLabels: Templates.renderRelayLabels(1),
        serviceName: 'one-shot-relay-nodeport',
      },
    ];

    for (const target of nodePortTargets) {
      if (!target.deployed) {
        continue;
      }
      const selector: Record<string, string> = Object.fromEntries(
        target.selectorLabels.map((labelPair: string): string[] => labelPair.split('=')),
      ) as Record<string, string>;
      try {
        await this.k8Factory
          .getK8(config.context)
          .services()
          .create(
            ServiceReference.of(config.namespace, ServiceName.of(target.serviceName)),
            {'app.kubernetes.io/managed-by': 'solo-one-shot'},
            target.podPort,
            target.podPort,
            selector,
            target.nodePort,
          );
      } catch (error) {
        // best-effort: the service may already exist from a previous run of this task; warn instead
        // of failing the whole deploy so a re-run stays idempotent.
        this.logger.warn(`Failed to create NodePort service ${target.serviceName}: ${error.message}`);
      }
      this.logger.addMessageGroupMessage(
        constants.PORT_FORWARDING_MESSAGE_GROUP,
        `${target.label} available on ${constants.LOCAL_HOST}:${target.hostPort} (NodePort)`,
      );
    }

    if (config.deployMirrorNode) {
      this.logger.addMessageGroupMessage(
        constants.PORT_FORWARDING_MESSAGE_GROUP,
        `Mirror Node REST API available on ${constants.LOCAL_HOST}:${constants.ONE_SHOT_MIRROR_REST_HOST_PORT} (NodePort)`,
      );
    }
  }

  private showPortForwards(outputFile?: string): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);

    if (outputFile) {
      const messages: string[] = this.logger.getMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
      if (messages?.length > 0) {
        const fileData: string = messages.join('\n') + '\n';
        createDirectoryIfNotExists(outputFile);
        fs.writeFileSync(outputFile, fileData);
        this.logger.showUser(chalk.green(`Port forwarding info saved to file: ${outputFile}`));
      }
    }
  }

  private showAccounts(
    createdAccounts: CreatedPredefinedAccount[] = [],
    context: OneShotSingleDeployContext,
    outputFile?: string,
  ): void {
    if (createdAccounts.length > 0) {
      createdAccounts.sort((a: CreatedPredefinedAccount, b: CreatedPredefinedAccount): number =>
        a.accountId.compare(b.accountId),
      );

      const ecdsaAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA,
      );
      const aliasAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS,
      );
      const ed25519Accounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ED25519,
      );

      const systemAccountsGroupKey: string = 'system-accounts';
      const messageGroupKey: string = 'accounts-created';
      const ecdsaGroupKey: string = 'accounts-created-ecdsa';
      const ecdsaAliasGroupKey: string = 'accounts-created-ecdsa-alias';
      const ed25519GroupKey: string = 'accounts-created-ed25519';

      const realm: Realm = this.localConfig.configuration.realmForDeployment(context.config.deployment);
      const shard: Shard = this.localConfig.configuration.shardForDeployment(context.config.deployment);
      const operatorAccountData: SystemAccount = {
        name: 'Operator',
        accountId: entityId(shard, realm, 2),
        publicKey: constants.GENESIS_PUBLIC_KEY,
      };

      if (constants.GENESIS_KEY === constants.DEFAULT_GENESIS_KEY) {
        operatorAccountData.privateKey = constants.DEFAULT_GENESIS_KEY;
      }

      const systemAccounts: SystemAccount[] = [operatorAccountData];

      if (systemAccounts.length > 0) {
        this.logger.addMessageGroup(systemAccountsGroupKey, 'System Accounts');

        for (const account of systemAccounts) {
          let message: string = `${account.name} Account ID: ${account.accountId.toString()}, Public Key: ${account.publicKey.toString()}`;
          if (account.privateKey) {
            message += `, Private Key: ${account.privateKey}`;
          }
          this.logger.addMessageGroupMessage(systemAccountsGroupKey, message);
        }

        this.logger.showMessageGroup(systemAccountsGroupKey);
      }

      this.logger.addMessageGroup(messageGroupKey, 'Created Accounts');
      this.logger.addMessageGroup(ecdsaGroupKey, 'ECDSA Accounts (Not EVM compatible, See ECDSA Alias Accounts above)');
      this.logger.addMessageGroup(ecdsaAliasGroupKey, 'ECDSA Alias Accounts (EVM compatible)');
      this.logger.addMessageGroup(ed25519GroupKey, 'ED25519 Accounts');

      if (aliasAccounts.length > 0) {
        for (const account of aliasAccounts) {
          this.logger.addMessageGroupMessage(
            ecdsaAliasGroupKey,
            `Account ID: ${account.accountId.toString()}, Public address: ${account.alias}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }
        this.logger.showMessageGroup(ecdsaAliasGroupKey);
      }

      if (ed25519Accounts.length > 0) {
        for (const account of ed25519Accounts) {
          this.logger.addMessageGroupMessage(
            ed25519GroupKey,
            `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }
        this.logger.showMessageGroup(ed25519GroupKey);
      }

      if (ecdsaAccounts.length > 0) {
        for (const account of ecdsaAccounts) {
          this.logger.addMessageGroupMessage(
            ecdsaGroupKey,
            `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }
        this.logger.showMessageGroup(ecdsaGroupKey);
      }

      if (outputFile) {
        createDirectoryIfNotExists(outputFile);

        const formattedCreatedAccounts: FormattedCreatedAccount[] = createdAccounts.map(
          (account: CreatedPredefinedAccount): FormattedCreatedAccount => {
            const formattedAccount: FormattedCreatedAccount = {
              accountId: account.accountId.toString(),
              privateKey: `0x${account.data.privateKey.toStringRaw()}`,
              publicKey: `0x${PublicKey.fromString(account.publicKey).toStringRaw()}`,
              balance: account.data.balance.toString(),
              group: account.data.group,
            };

            if (account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS && account.alias) {
              formattedAccount['publicAddress'] = account.alias;
            }

            return formattedAccount;
          },
        );

        const formattedSystemAccounts: FormattedSystemAccount[] = systemAccounts.map(
          (account: SystemAccount): FormattedSystemAccount => ({
            name: account.name,
            accountId: account.accountId.toString(),
            publicKey: account.publicKey.toString(),
            privateKey: account.privateKey,
          }),
        );

        const outputData: {
          systemAccounts: FormattedSystemAccount[];
          createdAccounts: FormattedCreatedAccount[];
        } = {
          systemAccounts: formattedSystemAccounts,
          createdAccounts: formattedCreatedAccounts,
        };

        fs.writeFileSync(outputFile, JSON.stringify(outputData, undefined, 2));
        this.logger.showUser(chalk.green(`Created accounts saved to file in JSON format: ${outputFile}`));
      }

      this.logger.showUser(
        'For more information on public and private keys see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures',
      );
    }
  }

  /**
   * The per-component sections of a values file (network, blockNode, mirrorNode, explorerNode,
   * relayNode) can override a component's version independently of the `config.versions` resolved
   * from argv/defaults. Reconciles config.versions with those overrides, mirroring the same
   * override precedence the deploy argv builders use, so the "Versions Used" summary reflects what
   * is actually deployed.
   */
  private reconcileEffectiveVersions(config: OneShotSingleDeployConfigClass): void {
    const releaseTagKey: string = flags.getFormattedFlagKey(flags.consensusNodeVersion);
    const soloChartVersionKey: string = flags.getFormattedFlagKey(flags.soloChartVersion);
    const blockNodeVersionKey: string = flags.getFormattedFlagKey(flags.blockNodeVersion);
    const mirrorNodeVersionKey: string = flags.getFormattedFlagKey(flags.mirrorNodeVersion);
    const explorerVersionKey: string = flags.getFormattedFlagKey(flags.explorerVersion);
    const relayVersionKey: string = flags.getFormattedFlagKey(flags.relayVersion);

    config.versions.consensus = (config.networkConfiguration[releaseTagKey] as string) ?? config.versions.consensus;
    config.versions.soloChart =
      (config.networkConfiguration[soloChartVersionKey] as string) ?? config.versions.soloChart;
    config.versions.blockNode =
      (config.blockNodeConfiguration[blockNodeVersionKey] as string) ?? config.versions.blockNode;
    config.versions.mirror = (config.mirrorNodeConfiguration[mirrorNodeVersionKey] as string) ?? config.versions.mirror;
    config.versions.explorer =
      (config.explorerNodeConfiguration[explorerVersionKey] as string) ?? config.versions.explorer;
    config.versions.relay = (config.relayNodeConfiguration[relayVersionKey] as string) ?? config.versions.relay;
  }

  private async confirmNonKindContext(
    config: OneShotSingleDeployConfigClass,
    task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): Promise<void> {
    if (config.quiet === true || Helpers.isKindContext(config.context)) {
      return;
    }

    const proceed: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
      default: false,
      message: this.buildNonKindContextWarningMessage(config.context),
    });

    if (!proceed) {
      throw new UserBreak('Aborted by user');
    }
  }

  private buildAutoCleanConfirmationMessage(snapshot: DeploymentStateSnapshot | undefined): string {
    const detected: string[] = [];
    if (snapshot?.remoteConfig.configMapExists) {
      detected.push('  - remote config (ConfigMap)');
    }
    if (snapshot?.remoteConfig.orphanedOnKindCluster) {
      detected.push('  - a deployment in the local config whose remote config (ConfigMap) is missing');
    }
    if (snapshot && snapshot.helm.installedReleases.size > 0) {
      detected.push(`  - Helm releases: ${[...snapshot.helm.installedReleases].join(', ')}`);
    }
    if (snapshot?.accounts.accountsFileExists) {
      detected.push('  - accounts file on disk');
    }

    const componentPhases: Map<ComponentTypes, DeploymentPhase> = snapshot?.remoteConfig.componentPhases ?? new Map();

    for (const [componentType, phase] of componentPhases) {
      if (isDeploymentPhaseAtLeast(phase, DeploymentPhase.DEPLOYED)) {
        detected.push(`  - component ${componentType} in phase ${phase}`);
      }
    }

    return (
      'Warning: an existing one-shot deployment was detected:\n\n' +
      detected.join('\n') +
      '\n\none-shot deploy rebuilds from a clean slate, so these resources will be destroyed before ' +
      'the fresh deploy. Continue?'
    );
  }

  private buildNonKindContextWarningMessage(context: string): string {
    return (
      `Warning: Active Kubernetes context '${context}' is not a local Kind cluster.\n\n` +
      'one-shot deploy is intended for local development. Deploying into a shared or remote cluster ' +
      'may install Solo charts, CRDs, namespaces, and other resources into that cluster.\n\n' +
      'Continue?'
    );
  }
}
