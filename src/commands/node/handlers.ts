/**
 * SPDX-License-Identifier: Apache-2.0
 */

import * as helpers from '../../core/helpers.js';
import * as NodeFlags from './flags.js';
import {
  addConfigBuilder,
  deleteConfigBuilder,
  downloadGeneratedFilesConfigBuilder,
  keysConfigBuilder,
  logsConfigBuilder,
  prepareUpgradeConfigBuilder,
  refreshConfigBuilder,
  setupConfigBuilder,
  startConfigBuilder,
  statesConfigBuilder,
  stopConfigBuilder,
  freezeConfigBuilder,
  updateConfigBuilder,
  upgradeConfigBuilder,
  restartConfigBuilder,
} from './configs.js';
import * as constants from '../../core/constants.js';
import {type AccountManager} from '../../core/account_manager.js';
import {type ConfigManager} from '../../core/config_manager.js';
import {type PlatformInstaller} from '../../core/platform_installer.js';
import {type K8Factory} from '../../core/kube/k8_factory.js';
import {type LeaseManager} from '../../core/lease/lease_manager.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {IllegalArgumentError, SoloError} from '../../core/errors.js';
import {ComponentType, ConsensusNodeStates} from '../../core/config/remote/enumerations.js';
import {type SoloLogger} from '../../core/logging.js';
import {type NodeCommandTasks} from './tasks.js';
import {type Lease} from '../../core/lease/lease.js';
import {NodeSubcommandType} from '../../core/enumerations.js';
import {type BaseCommand, type CommandHandlers} from '../base.js';
import {NodeHelper} from './helper.js';
import {type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {ConsensusNodeComponent} from '../../core/config/remote/components/consensus_node_component.js';
import {type Listr, type ListrTask} from 'listr2';
import chalk from 'chalk';
import {type ComponentsDataWrapper} from '../../core/config/remote/components_data_wrapper.js';
import {type Optional} from '../../types/index.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type CommandFlag} from '../../types/flag_types.js';
import {type ConsensusNode} from '../../core/model/consensus_node.js';

export class NodeCommandHandlers implements CommandHandlers {
  private readonly accountManager: AccountManager;
  private readonly configManager: ConfigManager;
  private readonly platformInstaller: PlatformInstaller;
  private readonly logger: SoloLogger;
  private readonly k8Factory: K8Factory;
  private readonly tasks: NodeCommandTasks;
  private readonly leaseManager: LeaseManager;
  public readonly remoteConfigManager: RemoteConfigManager;
  public contexts: string[];
  public consensusNodes: ConsensusNode[];

  public getConfig: (configName: string, flags: CommandFlag[], extraProperties?: string[]) => object;
  private prepareChartPath: any;

  public readonly parent: BaseCommand;

  constructor(opts: any) {
    if (!opts || !opts.accountManager)
      throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager);
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required');
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required');
    if (!opts || !opts.tasks) throw new Error('An instance of NodeCommandTasks is required');
    if (!opts || !opts.k8Factory) throw new Error('An instance of core/K8Factory is required');
    if (!opts || !opts.platformInstaller)
      throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller);

    this.logger = opts.logger;
    this.tasks = opts.tasks;
    this.accountManager = opts.accountManager;
    this.configManager = opts.configManager;
    this.k8Factory = opts.k8Factory;
    this.platformInstaller = opts.platformInstaller;
    this.leaseManager = opts.leaseManager;
    this.remoteConfigManager = opts.remoteConfigManager;

    this.getConfig = opts.parent.getConfig.bind(opts.parent);
    this.prepareChartPath = opts.parent.prepareChartPath.bind(opts.parent);

    this.parent = opts.parent;
  }

  static readonly ADD_CONTEXT_FILE = 'node-add.json';
  static readonly DELETE_CONTEXT_FILE = 'node-delete.json';
  static readonly UPDATE_CONTEXT_FILE = 'node-update.json';
  static readonly UPGRADE_CONTEXT_FILE = 'node-upgrade.json';

  private init() {
    this.consensusNodes = this.parent.getConsensusNodes();
    this.contexts = this.parent.getContexts();
  }

  /** ******** Task Lists **********/

  deletePrepareTaskList(argv: any, lease: Lease) {
    return [
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease),
      this.validateSingleNodeState({excludedStates: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  deleteSubmitTransactionsTaskList(argv: any) {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction(),
    ];
  }

  deleteExecuteTaskList(argv: any) {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.refreshNodeList(),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Delete network node', NodeSubcommandType.DELETE),
      this.tasks.killNodes(),
      this.tasks.sleep('Give time for pods to come up after being killed', 20000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(NodeSubcommandType.DELETE),
      this.tasks.finalize(),
    ];
  }

  addPrepareTasks(argv: any, lease: Lease) {
    return [
      this.tasks.initialize(argv, addConfigBuilder.bind(this), lease),
      // TODO instead of validating the state we need to do a remote config add component, and we will need to manually
      //  the nodeAlias based on the next available node ID + 1
      // this.validateSingleNodeState({excludedStates: []}),
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

  addSubmitTransactionsTasks(argv: any) {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction(),
    ];
  }

  addExecuteTasks(argv: any) {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.addNewConsensusNodeToRemoteConfig(),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Deploy new network node', NodeSubcommandType.ADD),
      this.tasks.killNodes(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.downloadLastState(),
      this.tasks.uploadStateToNewNode(),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.stakeNewNode(),
      this.tasks.triggerStakeWeightCalculate(NodeSubcommandType.ADD),
      this.tasks.finalize(),
    ];
  }

  updatePrepareTasks(argv, lease: Lease) {
    return [
      this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease),
      this.validateSingleNodeState({excludedStates: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  updateSubmitTransactionsTasks(argv) {
    return [
      this.tasks.sendNodeUpdateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction(),
    ];
  }

  updateExecuteTasks(argv) {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap(
        'Update chart to use new configMap due to account number change',
        NodeSubcommandType.UPDATE,
        (ctx: any) => !ctx.config.newAccountNumber && !ctx.config.debugNodeAlias,
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(NodeSubcommandType.UPDATE),
      this.tasks.finalize(),
    ];
  }

  upgradePrepareTasks(argv, lease: Lease) {
    return [
      this.tasks.initialize(argv, upgradeConfigBuilder.bind(this), lease),
      this.validateAllNodeStates({excludedStates: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  upgradeSubmitTransactionsTasks(argv) {
    return [this.tasks.sendPrepareUpgradeTransaction(), this.tasks.sendFreezeUpgradeTransaction()];
  }

  upgradeExecuteTasks(argv) {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeUpgradeFiles(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.finalize(),
    ];
  }

  /** ******** Handlers **********/

  async prepareUpgrade(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this), lease),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendPrepareUpgradeTransaction(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node upgrade',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async freezeUpgrade(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this), null),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendFreezeUpgradeTransaction(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing node freeze upgrade',
      null,
    );

    await action(argv, this);
    return true;
  }

  async downloadGeneratedFiles(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, downloadGeneratedFilesConfigBuilder.bind(this), lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.downloadNodeGeneratedFiles(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading generated files',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async update(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        ...this.updatePrepareTasks(argv, lease),
        ...this.updateSubmitTransactionsTasks(argv),
        ...this.updateExecuteTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in updating nodes',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async updatePrepare(argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_PREPARE_FLAGS);
    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        ...this.updatePrepareTasks(argv, lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node update',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async updateSubmitTransactions(argv) {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS);
    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateSubmitTransactionsTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for node update',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async updateExecute(argv) {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_EXECUTE_FLAGS);
    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateExecuteTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async upgradePrepare(argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_PREPARE_FLAGS);
    const lease = await this.leaseManager.create();
    const action = this.parent.commandActionBuilder(
      [
        ...this.upgradePrepareTasks(argv, lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node upgrade',
      lease,
    );
    await action(argv, this);
    return true;
  }

  async upgradeSubmitTransactions(argv) {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS);
    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, upgradeConfigBuilder.bind(this), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeSubmitTransactionsTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for node upgrade',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async upgradeExecute(argv) {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, upgradeConfigBuilder.bind(this), lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeExecuteTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async upgrade(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    const lease = await this.leaseManager.create();
    const action = this.parent.commandActionBuilder(
      [
        ...this.upgradePrepareTasks(argv, lease),
        ...this.upgradeSubmitTransactionsTasks(argv),
        ...this.upgradeExecuteTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in upgrade network',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async delete(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_FLAGS);
    const lease = await this.leaseManager.create();
    const action = this.parent.commandActionBuilder(
      [
        ...this.deletePrepareTaskList(argv, lease),
        ...this.deleteSubmitTransactionsTaskList(argv),
        ...this.deleteExecuteTaskList(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting nodes',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async deletePrepare(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_PREPARE_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        ...this.deletePrepareTaskList(argv, lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, NodeHelper.deleteSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing to delete a node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async deleteSubmitTransactions(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.deleteSubmitTransactionsTaskList(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async deleteExecute(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_EXECUTE_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.deleteExecuteTaskList(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async add(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [...this.addPrepareTasks(argv, lease), ...this.addSubmitTransactionsTasks(argv), ...this.addExecuteTasks(argv)],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async addPrepare(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        ...this.addPrepareTasks(argv, lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async addSubmitTransactions(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, addConfigBuilder.bind(this), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addSubmitTransactionsTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      '`Error in submitting transactions to node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async addExecute(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, addConfigBuilder.bind(this), lease, false),
        this.tasks.identifyExistingNodes(),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addExecuteTasks(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async logs(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS);
    const action = this.parent.commandActionBuilder(
      [this.tasks.initialize(argv, logsConfigBuilder.bind(this), null), this.tasks.getNodeLogsAndConfigs()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading log from nodes',
      null,
    );

    await action(argv, this);
    return true;
  }

  async states(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STATES_FLAGS);

    const action = this.parent.commandActionBuilder(
      [this.tasks.initialize(argv, statesConfigBuilder.bind(this), null), this.tasks.getNodeStateFiles()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading states from nodes',
      null,
    );

    await action(argv, this);
    return true;
  }

  async refresh(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, refreshConfigBuilder.bind(this), lease),
        this.validateAllNodeStates({
          acceptedStates: [ConsensusNodeStates.STARTED, ConsensusNodeStates.SETUP, ConsensusNodeStates.INITIALIZED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.dumpNetworkNodesSaveState(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', true),
        this.tasks.startNodes('nodeAliases'),
        this.tasks.checkAllNodesAreActive('nodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in refreshing nodes',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async keys(argv: any) {
    this.init();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, keysConfigBuilder.bind(this), null),
        this.tasks.generateGossipKeys(),
        this.tasks.generateGrpcTlsKeys(),
        this.tasks.finalize(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error generating keys',
      null,
    );

    await action(argv, this);
    return true;
  }

  async stop(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STOP_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, stopConfigBuilder.bind(this), lease),
        this.validateAllNodeStates({
          acceptedStates: [ConsensusNodeStates.STARTED, ConsensusNodeStates.SETUP],
        }),
        this.tasks.identifyNetworkPods(1),
        this.tasks.stopNodes(),
        this.changeAllNodeStates(ConsensusNodeStates.INITIALIZED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error stopping node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async start(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.START_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, startConfigBuilder.bind(this), lease),
        this.validateAllNodeStates({acceptedStates: [ConsensusNodeStates.SETUP]}),
        this.tasks.identifyExistingNodes(),
        this.tasks.uploadStateFiles(ctx => ctx.config.stateFile.length === 0),
        this.tasks.startNodes('nodeAliases'),
        this.tasks.enablePortForwarding(),
        this.tasks.checkAllNodesAreActive('nodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
        this.changeAllNodeStates(ConsensusNodeStates.STARTED),
        this.tasks.addNodeStakes(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error starting node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async setup(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, setupConfigBuilder.bind(this), lease),
        this.validateAllNodeStates({
          acceptedStates: [ConsensusNodeStates.INITIALIZED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', true),
        this.changeAllNodeStates(ConsensusNodeStates.SETUP),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in setting up nodes',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async freeze(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.FREEZE_FLAGS);
    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, freezeConfigBuilder.bind(this), lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.sendFreezeTransaction(),
        this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
        this.tasks.stopNodes(),
        this.changeAllNodeStates(ConsensusNodeStates.INITIALIZED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error freezing node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  async restart(argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.RESTART_FLAGS);

    const lease = await this.leaseManager.create();

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, restartConfigBuilder.bind(this), lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.startNodes('existingNodeAliases'),
        this.tasks.enablePortForwarding(),
        this.tasks.checkAllNodesAreActive('existingNodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
        this.changeAllNodeStates(ConsensusNodeStates.STARTED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error restarting node',
      lease,
    );

    await action(argv, this);
    return true;
  }

  /** Removes the consensus node, envoy and haproxy components from remote config.  */
  public removeNodeAndProxies(): ListrTask<any, any, any> {
    return {
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      title: 'Remove node and proxies from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('Consensus node name', ComponentType.ConsensusNode);
          remoteConfig.components.remove('Envoy proxy name', ComponentType.EnvoyProxy);
          remoteConfig.components.remove('HaProxy name', ComponentType.HaProxy);
        });
      },
    };
  }

  /**
   * Changes the state from all consensus nodes components in remote config.
   *
   * @param state - to which to change the consensus node component
   */
  public changeAllNodeStates(state: ConsensusNodeStates): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: NamespaceName; consensusNodes: ConsensusNode[]};
    }

    return {
      title: `Change node state to ${state} in remote config`,
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx: Context): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = ctx;

          for (const consensusNode of ctx.config.consensusNodes) {
            remoteConfig.components.edit(
              consensusNode.name,
              new ConsensusNodeComponent(
                consensusNode.name,
                consensusNode.cluster,
                namespace.name,
                state,
                consensusNode.nodeId,
              ),
            );
          }
        });
      },
    };
  }

  /**
   * Creates tasks to validate that each node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedStates - the state at which the nodes can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the nodes can't be, matching any of the states throws an error
   */
  public validateAllNodeStates({
    acceptedStates,
    excludedStates,
  }: {
    acceptedStates?: ConsensusNodeStates[];
    excludedStates?: ConsensusNodeStates[];
  }): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx: Context, task): Listr<any, any, any> => {
        const nodeAliases = ctx.config.nodeAliases;

        const components = this.remoteConfigManager.components;

        const subTasks: ListrTask<Context, any, any>[] = nodeAliases.map(nodeAlias => ({
          title: `Validating state for node ${nodeAlias}`,
          task: (_, task): void => {
            const state = this.validateNodeState(nodeAlias, components, acceptedStates, excludedStates);

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
   * @param acceptedStates - the state at which the node can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the node can't be, matching any of the states throws an error
   */
  public validateSingleNodeState({
    acceptedStates,
    excludedStates,
  }: {
    acceptedStates?: ConsensusNodeStates[];
    excludedStates?: ConsensusNodeStates[];
  }): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: string; nodeAlias: NodeAlias};
    }

    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx: Context, task): void => {
        const nodeAlias = ctx.config.nodeAlias;

        task.title += ` ${nodeAlias}`;

        // TODO: Disabled for now until the node's state mapping is completed
        // const components = this.remoteConfigManager.components;
        // const state = this.validateNodeState(nodeAlias, components, acceptedStates, excludedStates);
        // task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
      },
    };
  }

  /**
   * @param nodeAlias - the alias of the node whose state to validate
   * @param components - the component data wrapper
   * @param acceptedStates - the state at which the node can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the node can't be, matching any of the states throws an error
   */
  private validateNodeState(
    nodeAlias: NodeAlias,
    components: ComponentsDataWrapper,
    acceptedStates: Optional<ConsensusNodeStates[]>,
    excludedStates: Optional<ConsensusNodeStates[]>,
  ): ConsensusNodeStates {
    let nodeComponent: ConsensusNodeComponent;
    try {
      nodeComponent = components.getComponent<ConsensusNodeComponent>(ComponentType.ConsensusNode, nodeAlias);
    } catch {
      throw new SoloError(`${nodeAlias} not found in remote config`);
    }

    // TODO: Enable once the states have been mapped
    // if (acceptedStates && !acceptedStates.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `accepted states: ${acceptedStates.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }
    //
    // if (excludedStates && excludedStates.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `excluded states: ${excludedStates.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }

    return nodeComponent.state;
  }
}
