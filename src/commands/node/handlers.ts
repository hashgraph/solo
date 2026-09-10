// SPDX-License-Identifier: Apache-2.0

import {addFlagsToArgv, Helpers} from '../../core/helpers.js';
import * as NodeFlags from './flags.js';
import {type NodeCommandConfigs} from './configs.js';
import * as constants from '../../core/constants.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type Lock} from '../../core/lock/lock.js';
import {type LeaseWrapper} from './lease-wrapper.js';
import {type NodeCommandTasks} from './tasks.js';
import {NodeSubcommandType} from '../../core/enumerations.js';
import {NodeHelper} from './helper.js';
import {AnyListrContext, type ArgvStruct, type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import chalk from 'chalk';
import {type ComponentId, type Optional, type SoloListr, type SoloListrTask} from '../../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {CommandHandler} from '../../core/command-handler.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type NodeDestroyContext} from './config-interfaces/node-destroy-context.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeFreezeContext} from './config-interfaces/node-freeze-context.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {Templates} from '../../core/templates.js';
import {ConsensusNodeStateSchema} from '../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {ComponentsDataWrapperApi} from '../../core/config/remote/api/components-data-wrapper-api.js';
import {LedgerPhase} from '../../data/schema/model/remote/ledger-phase.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type Zippy} from '../../core/zippy.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {Flags as flags} from '../flags.js';
import {select as selectPrompt} from '@inquirer/prompts';
import {Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {getSoloVersion} from '../../../version.js';
import {type ClusterReachability} from '../util/cluster-reachability.js';
import {DiagnosticsCollector} from '../util/diagnostics-collector.js';
import {DiagnosticsReporter} from '../util/diagnostics-reporter.js';
import {findDeploymentsFromRemoteConfig} from '../util/remote-config-helper.js';
import {GetSoloRemoteConfigMapTask} from '../util/get-solo-remote-config-map-task.js';
import {type RemoteDeploymentInfo} from '../util/remote-deployment-info.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';

@injectable()
export class NodeCommandHandlers extends CommandHandler {
  private readonly nodeConfigManager: ConfigManager;

  public constructor(
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.ConfigManager) configManager: ConfigManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.NodeCommandTasks) private readonly tasks: NodeCommandTasks,
    @inject(InjectTokens.NodeCommandConfigs) private readonly configs: NodeCommandConfigs,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
  ) {
    super();
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.nodeConfigManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.NodeCommandConfigs, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.tasks = patchInject(tasks, InjectTokens.NodeCommandTasks, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
  }

  private static readonly ADD_CONTEXT_FILE: string = 'node-add.json';
  private static readonly DESTROY_CONTEXT_FILE: string = 'node-destroy.json';
  private static readonly UPDATE_CONTEXT_FILE: string = 'node-update.json';
  private static readonly UPGRADE_CONTEXT_FILE: string = 'node-upgrade.json';
  private resolveOutputDirectory(argv: ArgvStruct, fallback: string = ''): string {
    this.nodeConfigManager.update(argv);
    return this.nodeConfigManager.getFlag<string>(flags.outputDir) || fallback;
  }

  private resolveDeploymentFlag(argv: ArgvStruct): string {
    const deploymentFromArgument: string = (argv[flags.deployment.name] as string) || '';
    if (deploymentFromArgument) {
      return deploymentFromArgument;
    }

    this.nodeConfigManager.update(argv);
    return this.nodeConfigManager.getFlag<string>(flags.deployment) || '';
  }

  private resolveQuietFlag(argv: ArgvStruct): boolean {
    if (argv[flags.quiet.name] !== undefined) {
      return argv[flags.quiet.name] === true;
    }

    this.nodeConfigManager.update(argv);
    return this.nodeConfigManager.getFlag<boolean>(flags.quiet) === true;
  }

  private ensureInteractiveSelectionPrompt(): void {
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      throw new SoloErrors.validation.nonInteractivePrompt(flags.getFormattedFlagKey(flags.deployment));
    }
  }

  /**
   * Loads the local config and returns the deployments that have a non-empty name.
   * Shared by the cluster-aware ({@link resolveDeploymentForLogs}) and cluster-free
   * ({@link resolveDeploymentNameWithoutCluster}) deployment resolvers.
   */
  private async collectValidLocalDeployments(): Promise<Deployment[]> {
    await this.localConfig.load();
    const validDeployments: Deployment[] = [];
    for (const deployment of this.localConfig.configuration.deployments) {
      if (deployment?.name && deployment.name.trim().length > 0) {
        validDeployments.push(deployment);
      }
    }

    return validDeployments;
  }

  /**
   * Resolves a deployment name using only locally available information (the
   * deployment flag and local config) without contacting any cluster. Returns an
   * empty string when no unambiguous deployment can be determined locally.
   */
  private async resolveDeploymentNameWithoutCluster(argv: ArgvStruct): Promise<string> {
    const deploymentFromFlag: string = this.resolveDeploymentFlag(argv);
    if (deploymentFromFlag && deploymentFromFlag.trim()) {
      return deploymentFromFlag;
    }

    const validDeployments: Deployment[] = await this.collectValidLocalDeployments();
    return validDeployments.length === 1 ? validDeployments[0].name : '';
  }

  /**
   * Collects the diagnostics that are available without loading the remote
   * configuration (Solo logs and local configuration) and analyzes them. Used as a
   * graceful fallback for the diagnostics commands when full remote collection cannot
   * proceed — either the Kubernetes cluster is not reachable (no active context, or a
   * stale context pointing at a torn-down cluster), or the deployment's remote config
   * is absent (for example after the deployment was destroyed, which deletes it).
   */
  private async collectLocalDiagnosticsOnly(argv: ArgvStruct, reason?: string): Promise<boolean> {
    const outputDirectory: string = this.resolveOutputDirectory(argv, constants.SOLO_LOGS_DIR);

    const reasonSuffix: string = reason ? ` (${reason})` : '';
    this.logger.showUser(
      chalk.yellow(
        `\n⚠  Falling back to local diagnostics only${reasonSuffix}. Collecting the Solo logs\n` +
          '   and local configuration. Remote consensus node logs and cluster state are not\n' +
          '   being collected.',
      ),
    );

    await this.commandAction(
      argv,
      [
        DiagnosticsCollector.collectLocalDiagnostics(this.logger, outputDirectory),
        this.tasks.analyzeCollectedDiagnostics(outputDirectory),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error collecting local diagnostics',
    );

    this.logger.showUser(chalk.cyan(`\nLocal diagnostics collected to: ${outputDirectory}`));
    return true;
  }

  /**
   * Shared preamble for the log-collecting diagnostics commands (`logs`, `all`). Ensures a
   * deployment is selected in {@link argv} and decides whether full remote collection can run.
   *
   * Diagnostics must never hard-fail just because the cluster state is incomplete — they are
   * most useful precisely when something is broken. Collection degrades to local-only when the
   * cluster is unreachable, or when the selected deployment's `solo-remote-config` ConfigMap is
   * absent (for example after the deployment was destroyed, which deletes it) — in either case
   * loading the remote configuration would throw and abort the whole command.
   *
   * @returns the reason to fall back to local-only collection, or undefined to proceed with
   *   full remote collection.
   */
  private async localDiagnosticsFallbackReason(argv: ArgvStruct): Promise<string | undefined> {
    const reachability: ClusterReachability = await DiagnosticsCollector.isKubeClusterReachable(this.k8Factory);
    if (!reachability.reachable) {
      return reachability.reason ?? 'the Kubernetes cluster is not reachable';
    }

    if (!argv[flags.deployment.name]) {
      argv[flags.deployment.name] = await this.resolveDeploymentForLogs(argv);
    }

    const deploymentName: string = String(argv[flags.deployment.name] ?? '');
    if (deploymentName && !(await this.remoteConfigConfigMapExists(deploymentName))) {
      return `the '${deploymentName}' deployment has no remote configuration — it may have been destroyed`;
    }

    return undefined;
  }

  /**
   * Best-effort, non-throwing check for whether a deployment's `solo-remote-config` ConfigMap is
   * present. The namespace and context are resolved from local config only (a read-only lookup);
   * when the deployment is not held locally it must have been discovered from a live remote scan,
   * so its ConfigMap exists. Any inability to determine presence is reported as present so the
   * normal collection path still runs and surfaces the real error rather than hiding it.
   */
  private async remoteConfigConfigMapExists(deploymentName: string): Promise<boolean> {
    await this.localConfig.load();

    let deployment: Deployment;
    try {
      deployment = this.localConfig.configuration.deploymentByName(deploymentName);
    } catch {
      // Not a locally-known deployment: it was resolved from a live remote-config scan, so it exists.
      return true;
    }

    const clusterReference: string | undefined = deployment.clusters.get(0)?.toString();
    const context: string | undefined = this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString();
    if (!context) {
      // Cannot resolve a context for the deployment; let the normal path run and surface any error.
      return true;
    }

    try {
      return await this.k8Factory
        .getK8(context)
        .configMaps()
        .exists(NamespaceName.of(deployment.namespace), constants.SOLO_REMOTE_CONFIGMAP_NAME);
    } catch {
      // Presence could not be determined (e.g. a transient API error); assume present so the real
      // error surfaces through the normal collection path instead of being hidden by a fallback.
      return true;
    }
  }

  /** ******** Task Lists **********/

  private destroyPrepareTaskList(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private destroySubmitTransactionsTaskList(): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeDestroyContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeDestroyContext>,
    ];
  }

  private destroyExecuteTaskList(): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.stopNodes('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFilesForDynamicAddressBook(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.refreshNodeList(),
      this.tasks.copyNodeKeysToSecrets('refreshedConsensusNodes'),
      this.tasks.updateChartWithConfigMap(
        'Delete network node from chart and update configMaps',
        NodeSubcommandType.DESTROY,
      ),
      this.tasks.killNodes(NodeSubcommandType.DESTROY),
      this.tasks.sleep('Give time for pods to come up after being killed', 20_000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeDestroyContext>(NodeSubcommandType.DESTROY),
      this.tasks.finalize(),
    ];
  }

  private addPrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), lease),
      // TODO instead of validating the state we need to do a remote config add component, and we will need to manually
      //  the nodeAlias based on the next available node ID + 1
      // this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.checkPVCsEnabled(),
      this.tasks.identifyExistingNodes(),
      this.tasks.determineNewNodeAccountNumber(),
      this.tasks.copyGrpcTlsCertificates(),
      this.tasks.generateGossipKey(),
      this.tasks.generateGrpcTlsKey(),
      this.tasks.loadSigningKeyCertificate(),
      this.tasks.computeMTLSCertificateHash(),
      this.tasks.prepareGossipEndpoints(),
      this.tasks.prepareGrpcServiceEndpoints(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private addSubmitTransactionsTasks(): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeAddContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeAddContext>,
    ];
  }

  private addExecuteTasks(): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFilesForDynamicAddressBook(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.addNewConsensusNodeToRemoteConfig(),
      // The new node is not part of the active proof roster immediately after node create.
      this.tasks.copyNodeKeysToSecrets(undefined, false),
      this.tasks.updateChartWithConfigMap('Deploy new network node', NodeSubcommandType.ADD),
      this.tasks.stopNodes('existingNodeAliases'),
      this.tasks.killNodes(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.downloadLastState(),
      this.tasks.uploadStateToNewNode(),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.updateBlockNodesJson(),
      this.tasks.refreshBlockNodeRsaBootstrapStateTask(),
      this.tasks.addWrapsLib(),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.waitForTss(),
      this.tasks.stakeNewNode(),
      this.tasks.triggerStakeWeightCalculate<NodeAddContext>(NodeSubcommandType.ADD),
      this.tasks.loadAdminKey(),
      this.tasks.setGrpcWebEndpoint('newNodeAliases', NodeSubcommandType.ADD),
      this.tasks.finalize(),
      this.tasks.removeCachedKeys(),
    ];
  }

  private updatePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private updateSubmitTransactionsTasks(): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.sendNodeUpdateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeUpdateContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeUpdateContext>,
    ];
  }

  private updateExecuteTasks(): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFilesForDynamicAddressBook(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(undefined, false),
      this.tasks.updateChartWithConfigMap(
        'Update chart to use new configMap due to account number change',
        NodeSubcommandType.UPDATE,
        ({config}): boolean => !config.newAccountNumber && !config.debugNodeAlias,
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.refreshBlockNodeRsaBootstrapStateTask(),
      this.tasks.addWrapsLib(),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeUpdateContext>(NodeSubcommandType.UPDATE),
      this.tasks.finalize(),
      this.tasks.removeCachedKeys(),
    ];
  }

  private skipTaskWhenNodeStartSkipped(task: SoloListrTask<NodeUpgradeContext>): SoloListrTask<NodeUpgradeContext> {
    return {
      ...task,
      skip: (context_: NodeUpgradeContext): boolean | string =>
        context_.config.skipNodeStart ? 'Skipped by --skip-node-start' : false,
    };
  }

  private markNodesConfiguredWhenNodeStartSkipped(): SoloListrTask<NodeUpgradeContext> {
    const task: SoloListrTask<NodeUpgradeContext> = this.changeAllNodePhases(
      DeploymentPhase.CONFIGURED,
    ) as SoloListrTask<NodeUpgradeContext>;

    return {
      ...task,
      title: 'Mark nodes CONFIGURED because node start was skipped',
      skip: (context_: NodeUpgradeContext): boolean | string => {
        if (!context_.config.skipNodeStart) {
          return 'Node start was not skipped';
        }

        return !this.remoteConfig.isLoaded();
      },
    };
  }

  private upgradePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), lease),
      this.validateAllNodePhases({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private upgradeSubmitTransactionsTasks(): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeUpgradeContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeUpgradeContext>,
    ];
  }

  private upgradeExecuteTasks(): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.drainBlockStreamAfterFreeze<NodeUpgradeContext>(),
      this.tasks.stopNodes('existingNodeAliases'),
      this.tasks.downloadNodeUpgradeFiles(),
      this.tasks.upgradeNodeConfigurationFilesWithChart(),
      this.tasks.fetchPlatformSoftware('nodeAliases'),
      this.tasks.updateConsensusNodeVersionInRemoteConfig(),
      this.tasks.addWrapsLib(),
      this.markNodesConfiguredWhenNodeStartSkipped(),
      this.skipTaskWhenNodeStartSkipped(this.tasks.startNodes('allNodeAliases')),
      this.skipTaskWhenNodeStartSkipped(this.tasks.enablePortForwarding()),
      this.skipTaskWhenNodeStartSkipped(this.tasks.checkAllNodesAreActive('allNodeAliases')),
      this.skipTaskWhenNodeStartSkipped(this.tasks.checkAllNodeProxiesAreActive()),
      this.skipTaskWhenNodeStartSkipped(this.tasks.finalize()),
    ];
  }

  /** ******** Handlers **********/

  public async prepareUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.PREPARE_UPGRADE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.prepareStagingDirectory('existingNodeAliases'),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendPrepareUpgradeTransaction(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in preparing node upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async freezeUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.PREPARE_UPGRADE_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs)),
        this.tasks.identifyExistingNodes(),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendFreezeUpgradeTransaction(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in executing node freeze upgrade',
    );

    return true;
  }

  public async update(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.updatePrepareTasks(argv, leaseWrapper.lease),
        ...this.updateSubmitTransactionsTasks(),
        ...this.updateExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in updating consensus nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updatePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.UPDATE_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.updatePrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateSaveContextParser),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in preparing consensus node update',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updateSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    argv = addFlagsToArgv(argv, NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateSubmitTransactionsTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in submitting transactions for consensus node update',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updateExecute(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    argv = addFlagsToArgv(argv, NodeFlags.UPDATE_EXECUTE_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.updateConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in executing network upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgradePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.UPGRADE_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.upgradePrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeSaveContextParser),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in preparing node upgrade',
      leaseWrapper.lease,
    );
    return true;
  }

  public async upgradeSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    argv = addFlagsToArgv(argv, NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeSubmitTransactionsTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in submitting transactions for node upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgradeExecute(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    argv = addFlagsToArgv(argv, NodeFlags.UPGRADE_EXECUTE_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.upgradeConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in executing network upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.upgradePrepareTasks(argv, leaseWrapper.lease),
        ...this.upgradeSubmitTransactionsTasks(),
        ...this.upgradeExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in upgrade network',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DESTROY_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.destroyPrepareTaskList(argv, leaseWrapper.lease),
        ...this.destroySubmitTransactionsTaskList(),
        ...this.destroyExecuteTaskList(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in destroying nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroyPrepare(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DESTROY_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.destroyPrepareTaskList(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteSaveContextParser),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in preparing to destroy a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroySubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DESTROY_SUBMIT_TRANSACTIONS_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.destroySubmitTransactionsTaskList(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in deleting a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroyExecute(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DESTROY_EXECUTE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), leaseWrapper.lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.destroyExecuteTaskList(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in deleting a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.ADD_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.addPrepareTasks(argv, leaseWrapper.lease),
        ...this.addSubmitTransactionsTasks(),
        ...this.addExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in adding consensus node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addPrepare(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.addPrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, Helpers.addSaveContextParser),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in preparing node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, Helpers.addLoadContextParser),
        ...this.addSubmitTransactionsTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      '`Error in submitting transactions to node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addExecute(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.addConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, Helpers.addLoadContextParser),
        ...this.addExecuteTasks(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in adding node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async logs(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS);
    const scopeToSelectedDeployment: boolean = Boolean(this.resolveDeploymentFlag(argv));

    const fallbackReason: string | undefined = await this.localDiagnosticsFallbackReason(argv);
    if (fallbackReason !== undefined) {
      return await this.collectLocalDiagnosticsOnly(argv, fallbackReason);
    }

    const outputDirectory: string = this.resolveOutputDirectory(argv);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.logsConfigBuilder.bind(this.configs), undefined, true, false),
        this.tasks.getNodeLogsAndConfigs(undefined, outputDirectory),
        this.tasks.getHelmChartValues(outputDirectory, scopeToSelectedDeployment),
        GetSoloRemoteConfigMapTask.getTask(this.k8Factory, this.logger, outputDirectory, scopeToSelectedDeployment),
        this.tasks.downloadHieroComponentLogs(outputDirectory, scopeToSelectedDeployment),
        this.tasks.analyzeCollectedDiagnostics(outputDirectory),
        this.tasks.reportActivePortForwards(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in downloading logs from nodes',
    );

    this.logger.showUser(
      chalk.yellow(
        '\n⚠  Warning: Collected diagnostic data contains sensitive node configuration\n' +
          '   (TLS certificates, private keys, onboard data). Store it securely and do\n' +
          '   not share publicly without reviewing the contents first.',
      ),
    );

    return true;
  }

  public async analyze(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.ANALYZE_FLAGS);

    this.nodeConfigManager.update(argv);
    const inputDirectory: string = this.nodeConfigManager.getFlag<string>(flags.inputDir) || '';

    await this.commandAction(
      argv,
      [this.tasks.analyzeCollectedDiagnostics(inputDirectory)],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error analyzing diagnostics logs',
    );

    return true;
  }

  private async resolveDeploymentForLogs(argv: ArgvStruct): Promise<string> {
    const deploymentFromFlag: string = this.resolveDeploymentFlag(argv);
    if (deploymentFromFlag && deploymentFromFlag.trim()) {
      return deploymentFromFlag;
    }

    const validDeployments: Deployment[] = await this.collectValidLocalDeployments();

    if (validDeployments.length === 0) {
      const remoteDeployments: Map<string, RemoteDeploymentInfo> = await findDeploymentsFromRemoteConfig(
        this.k8Factory,
        this.logger,
      );
      if (remoteDeployments.size === 0) {
        throw new SoloErrors.deployment.noDeploymentsFound();
      }

      const remoteDeploymentNames: string[] = [...remoteDeployments.keys()];

      if (remoteDeploymentNames.length === 1) {
        const selectedFromRemote: string = remoteDeploymentNames[0];
        this.logger.showUser(`Using deployment from remote config: ${selectedFromRemote}`);
        return selectedFromRemote;
      }

      if (this.resolveQuietFlag(argv)) {
        const names: string = remoteDeploymentNames.join(', ');
        throw new SoloErrors.system.multipleDeploymentsFound('remote', names);
      }

      this.ensureInteractiveSelectionPrompt();
      const selectedFromRemote: string = (await selectPrompt({
        message: 'Select deployment for diagnostics logs:',
        choices: remoteDeploymentNames.map((name: string): {name: string; value: string} => ({name, value: name})),
      })) as string;
      this.logger.showUser(`Using selected deployment: ${selectedFromRemote}`);
      return selectedFromRemote;
    }

    if (validDeployments.length === 1) {
      const deploymentName: string = validDeployments[0].name;
      this.logger.showUser(`Using deployment from local config: ${deploymentName}`);
      return deploymentName;
    }

    if (this.resolveQuietFlag(argv)) {
      const deploymentNames: string = validDeployments
        .map((deployment: Deployment): string => deployment.name)
        .join(', ');
      throw new SoloErrors.system.multipleDeploymentsFound('local', deploymentNames);
    }

    this.ensureInteractiveSelectionPrompt();
    const selectedDeployment: string = (await selectPrompt({
      message: 'Select deployment for diagnostics logs:',
      choices: validDeployments.map((deployment): {name: string; value: string} => ({
        name: deployment.name,
        value: deployment.name,
      })),
    })) as string;
    this.logger.showUser(`Using selected deployment: ${selectedDeployment}`);
    return selectedDeployment;
  }

  public async all(argv: ArgvStruct, excludeSensitiveData: boolean = false): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DIAGNOSTICS_CONNECTIONS);
    const scopeToSelectedDeployment: boolean = Boolean(this.resolveDeploymentFlag(argv));

    const fallbackReason: string | undefined = await this.localDiagnosticsFallbackReason(argv);
    if (fallbackReason !== undefined) {
      return await this.collectLocalDiagnosticsOnly(argv, fallbackReason);
    }

    const outputDirectory: string = this.resolveOutputDirectory(argv);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.logsConfigBuilder.bind(this.configs), undefined, true, false),
        this.tasks.getNodeLogsAndConfigs(excludeSensitiveData, outputDirectory),
        ...(excludeSensitiveData ? [] : [this.tasks.getHelmChartValues(outputDirectory, scopeToSelectedDeployment)]),
        GetSoloRemoteConfigMapTask.getTask(this.k8Factory, this.logger, outputDirectory, scopeToSelectedDeployment),
        this.tasks.downloadHieroComponentLogs(outputDirectory, scopeToSelectedDeployment),
        this.tasks.analyzeCollectedDiagnostics(outputDirectory),
        // do not call validateConnectionsTaskList since node could be stopped or not active but logs are still needed
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in diagnosing deployment',
    );

    return true;
  }

  public async debug(argv: ArgvStruct, excludeSensitiveData: boolean = false): Promise<boolean> {
    // First run all diagnostics
    await this.all(argv, excludeSensitiveData);

    // Then create a zip file from the logs directory
    const outputDirectory: string = this.resolveOutputDirectory(argv, constants.SOLO_LOGS_DIR);
    const deployment: string = this.resolveDeploymentFlag(argv);
    const timestamp: string = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').slice(0, 19);
    const zipFileName: string = `solo-debug-${deployment}-${timestamp}.zip`;
    const zipFilePath: string = PathEx.join(outputDirectory, '..', zipFileName);

    this.logger.showUser(chalk.cyan(`\nCreating debug archive from: ${outputDirectory}`));
    this.logger.showUser(chalk.cyan(`Archive location: ${zipFilePath}`));
    if (!excludeSensitiveData) {
      this.logger.showUser(
        chalk.yellow(
          '\n⚠  Warning: The debug archive contains sensitive node configuration\n' +
            '   (TLS certificates, private keys, onboard data). Review its contents\n' +
            '   before sharing. Private keys under data/keys are NOT excluded.',
        ),
      );
    }

    try {
      await this.zippy.zip(outputDirectory, zipFilePath);
      this.logger.showUser(chalk.green('✓ Debug information collected successfully!'));
      this.logger.showUser(chalk.cyan(`  Archive: ${zipFilePath}`));
    } catch (error) {
      throw new SoloErrors.component.nodeDebugArchiveFailed(error);
    }

    return true;
  }

  public async connections(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.DIAGNOSTICS_CONNECTIONS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.connectionsConfigBuilder.bind(this.configs)),
        ...this.validateConnectionsTaskList(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in testing connections to components',
    );

    return true;
  }

  private validateConnectionsTaskList(): SoloListrTask<AnyListrContext>[] {
    return [
      this.tasks.prepareDiagnosticsData(),
      this.tasks.validateLocalPorts(),
      this.tasks.testAccountCreation(),
      this.tasks.fetchAccountFromExplorer(),
      this.tasks.testRelay(),
    ];
  }

  /**
   * Collects a full debug archive for the deployment (logs + configs + zip) and
   * then creates a GitHub issue using the `gh` CLI with a pre-filled title and body.
   * The generated archive is referenced for the user to attach manually via the GitHub UI.
   *
   */
  public async report(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.REPORT_FLAGS);
    // Resolve deployment before calling collectDebug() so it's available for the issue title/body.
    // Without an active kube context, resolve from local information only so the command still
    // produces a report (collectDebug() degrades to local-only diagnostics in that case).
    let deployment: string;
    if (argv[flags.deployment.name]) {
      deployment = String(argv[flags.deployment.name]);
    } else {
      const reachability: ClusterReachability = await DiagnosticsCollector.isKubeClusterReachable(this.k8Factory);
      deployment = reachability.reachable
        ? await this.resolveDeploymentForLogs(argv)
        : await this.resolveDeploymentNameWithoutCluster(argv);
    }
    if (!argv[flags.deployment.name] && deployment) {
      argv[flags.deployment.name] = deployment;
    }

    await DiagnosticsReporter.runDiagnosticsReport({
      logger: this.logger,
      deployment,
      outputDirectory: this.resolveOutputDirectory(argv, constants.SOLO_LOGS_DIR),
      soloVersion: getSoloVersion(),
      isQuiet: this.resolveQuietFlag(argv),
      collectDebug: async (): Promise<void> => {
        await this.debug(argv, true);
      },
    });

    return true;
  }

  public async states(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.STATES_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.statesConfigBuilder.bind(this.configs)),
        this.tasks.getNodeStateFiles(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in downloading states from nodes',
    );

    return true;
  }

  public async refresh(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.refreshConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.STARTED, DeploymentPhase.CONFIGURED, DeploymentPhase.DEPLOYED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.dumpNetworkNodesSaveState(),
        this.tasks.downloadLastState(),
        this.tasks.uploadStateToNewNode(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', false),
        this.tasks.startNodes('nodeAliases'),
        this.tasks.checkNodesAndProxiesAreActive('nodeAliases'),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in refreshing nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async keys(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.keysConfigBuilder.bind(this.configs)),
        this.tasks.generateGossipKeys(),
        this.tasks.generateGrpcTlsKeys(),
        this.tasks.finalize(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error generating keys',
      undefined,
      'keys consensus generate',
    );

    return true;
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.STOP_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.stopConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.STARTED, DeploymentPhase.CONFIGURED],
        }),
        this.tasks.identifyNetworkPods(1),
        this.tasks.stopNodes('nodeAliases'),
        this.changeAllNodePhases(DeploymentPhase.STOPPED),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error stopping node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.START_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.startConfigBuilder.bind(this.configs),
          leaseWrapper.lease,
          true,
          false,
        ),
        this.validateAllNodePhases({acceptedPhases: [DeploymentPhase.CONFIGURED]}),
        this.tasks.identifyExistingNodes(),
        this.tasks.uploadStateFiles(({config}): boolean => config.stateFile.length === 0),
        this.tasks.startNodes('nodeAliases'),
        // Must precede checkNodesAndProxiesAreActive: when --debug-node-alias is set the JVM starts
        // with suspend=y and will never reach ACTIVE until a debugger connects via this port-forward.
        this.tasks.enableDebuggerPortForwarding(),
        this.tasks.checkNodesAndProxiesAreActive('nodeAliases'),
        this.tasks.enablePortForwarding(true),
        this.tasks.emitNodeStartedEvent(),
        this.tasks.waitForTss(),
        this.tasks.setGrpcWebEndpoint('nodeAliases', NodeSubcommandType.START),
        this.changeAllNodePhases(DeploymentPhase.STARTED, LedgerPhase.INITIALIZED),
        this.tasks.addNodeStakes(),
        // TODO only show this if we are not running in one-shot mode
        // this.tasks.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error starting node',
      leaseWrapper.lease,
      'consensus node start',
    );

    return true;
  }

  public async setup(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.DEPLOYED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', true),
        this.tasks.updateBlockNodesJson(),
        this.tasks.setupNetworkNodeFolders(),
        this.changeAllNodePhases(DeploymentPhase.CONFIGURED),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error in setting up nodes',
      leaseWrapper.lease,
      'consensus node setup',
    );

    return true;
  }

  public async freeze(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.FREEZE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager, false),
        this.tasks.initialize(
          argv,
          this.configs.freezeConfigBuilder.bind(this.configs),
          leaseWrapper.lease,
          true,
          false,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.sendFreezeTransaction(),
        this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
        this.tasks.drainBlockStreamAfterFreeze<NodeFreezeContext>(),
        this.tasks.stopNodes('existingNodeAliases'),
        this.changeAllNodePhases(DeploymentPhase.FROZEN),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error freezing node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async restart(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.RESTART_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.restartConfigBuilder.bind(this.configs),
          leaseWrapper.lease,
          true,
          false,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.addWrapsLib(),
        this.tasks.startNodes('existingNodeAliases'),
        this.tasks.enablePortForwarding(),
        this.tasks.checkNodesAndProxiesAreActive('existingNodeAliases'),
        this.changeAllNodePhases(DeploymentPhase.STARTED),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error restarting node',
      leaseWrapper.lease,
    );

    return true;
  }

  /**
   * Changes the state from all consensus nodes components in remote config.
   *
   * @param phase - to which to change the consensus node component
   * @param ledgerPhase
   */
  public changeAllNodePhases(
    phase: DeploymentPhase,
    ledgerPhase: Optional<LedgerPhase> = undefined,
  ): SoloListrTask<AnyListrContext> {
    interface Context {
      config: {namespace: NamespaceName; consensusNodes: ConsensusNode[]};
    }

    return {
      title: `Change node state to ${phase} in remote config`,
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_: Context): Promise<void> => {
        for (const consensusNode of context_.config.consensusNodes) {
          const componentId: ComponentId = Templates.renderComponentIdFromNodeAlias(consensusNode.name);
          this.remoteConfig.configuration.components.changeNodePhase(componentId, phase);
        }

        if (ledgerPhase) {
          this.remoteConfig.configuration.state.ledgerPhase = ledgerPhase;
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /**
   * Creates tasks to validate that each node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedPhases - the state at which the nodes can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the nodes can't be, matching any of the states throws an error
   */
  public validateAllNodePhases({
    acceptedPhases,
    excludedPhases,
  }: {
    acceptedPhases?: DeploymentPhase[];
    excludedPhases?: DeploymentPhase[];
  }): SoloListrTask<AnyListrContext> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: (context_: Context, task): SoloListr<Context> => {
        const nodeAliases: NodeAliases = context_.config.nodeAliases;

        const subTasks: SoloListrTask<Context>[] = nodeAliases.map((nodeAlias): SoloListrTask<AnyListrContext> => ({
          title: `Validating state for node ${nodeAlias}`,
          task: (_, task): void => {
            const state: DeploymentPhase = this.validateNodeState(
              nodeAlias,
              this.remoteConfig.configuration.components,
              acceptedPhases,
              excludedPhases,
            );

            task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
          },
        }));

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  /**
   * Creates tasks to validate that specific node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedPhases - the state at which the node can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the node can't be, matching any of the states throws an error
   */
  public validateSingleNodeState({
    acceptedPhases,
    excludedPhases,
  }: {
    acceptedPhases?: DeploymentPhase[];
    excludedPhases?: DeploymentPhase[];
  }): SoloListrTask<AnyListrContext> {
    void acceptedPhases;
    void excludedPhases;

    interface Context {
      config: {namespace: string; nodeAlias: NodeAlias};
    }

    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: (context_: Context, task): void => {
        const nodeAlias: NodeAlias = context_.config.nodeAlias;

        task.title += ` ${nodeAlias}`;

        // TODO: Disabled for now until the node's state mapping is completed
        // const components = this.remoteConfig.components;
        // const state = this.validateNodeState(nodeAlias, components, acceptedPhases, excludedPhases);
        // task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
      },
    };
  }

  /**
   * @param nodeAlias - the alias of the node whose state to validate
   * @param components - the component data wrapper
   * @param acceptedPhases - the state at which the node can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the node can't be, matching any of the states throws an error
   */
  private validateNodeState(
    nodeAlias: NodeAlias,
    components: ComponentsDataWrapperApi,
    acceptedPhases: Optional<DeploymentPhase[]>,
    excludedPhases: Optional<DeploymentPhase[]>,
  ): DeploymentPhase {
    void acceptedPhases;
    void excludedPhases;

    let nodeComponent: ConsensusNodeStateSchema;
    try {
      nodeComponent = components.getComponent<ConsensusNodeStateSchema>(
        ComponentTypes.ConsensusNode,
        Templates.renderComponentIdFromNodeAlias(nodeAlias),
      );
    } catch {
      throw new SoloErrors.system.consensusNodeNotInConfig(nodeAlias);
    }
    // TODO: Enable once states have been mapped
    // if (acceptedPhases && !acceptedPhases.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `accepted states: ${acceptedPhases.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }
    //
    // if (excludedPhases && excludedPhases.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `excluded states: ${excludedPhases.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }
    return nodeComponent.metadata.phase;
  }

  public async collectJavaFlightRecorderLogs(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, NodeFlags.COLLECT_JFR_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: undefined};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.collectJfrConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.downloadJavaFlightRecorderLogs(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error collecting jfr recording from node',
      leaseWrapper.lease,
    );

    return true;
  }
}
