// SPDX-License-Identifier: Apache-2.0

import * as helpers from '../../core/helpers.js';
import * as NodeFlags from './flags.js';
import {type NodeCommandConfigs} from './configs.js';
import * as constants from '../../core/constants.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote-config-manager.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {ComponentType, ConsensusNodeStates} from '../../core/config/remote/enumerations.js';
import {type Lock} from '../../core/lock/lock.js';
import {type NodeCommandTasks} from './tasks.js';
import {NodeSubcommandType} from '../../core/enumerations.js';
import {NodeHelper} from './helper.js';
import {type ArgvStruct, type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {ConsensusNodeComponent} from '../../core/config/remote/components/consensus-node-component.js';
import {type Listr} from 'listr2';
import chalk from 'chalk';
import {type ComponentsDataWrapper} from '../../core/config/remote/components-data-wrapper.js';
import {type Optional, type SoloListrTask} from '../../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {CommandHandler} from '../../core/command-handler.js';
import {type NamespaceName} from '../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type NodeDeleteContext} from './config-interfaces/node-delete-context.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';

@injectable()
export class NodeCommandHandlers extends CommandHandler {
  public contexts: string[];
  public consensusNodes: ConsensusNode[];

  public constructor(
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.NodeCommandTasks) private readonly tasks: NodeCommandTasks,
    @inject(InjectTokens.NodeCommandConfigs) private readonly configs: NodeCommandConfigs,
  ) {
    super();
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.NodeCommandConfigs, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
    this.tasks = patchInject(tasks, InjectTokens.NodeCommandTasks, this.constructor.name);
  }

  private static readonly ADD_CONTEXT_FILE = 'node-add.json';
  private static readonly DELETE_CONTEXT_FILE = 'node-delete.json';
  private static readonly UPDATE_CONTEXT_FILE = 'node-update.json';
  private static readonly UPGRADE_CONTEXT_FILE = 'node-upgrade.json';

  private init() {
    this.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    this.contexts = this.remoteConfigManager.getContexts();
  }

  /** ******** Task Lists **********/

  private deletePrepareTaskList(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeDeleteContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.deleteConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedStates: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private deleteSubmitTransactionsTaskList(): SoloListrTask<NodeDeleteContext>[] {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeDeleteContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeDeleteContext>,
    ];
  }

  private deleteExecuteTaskList(): SoloListrTask<NodeDeleteContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.stopNodes('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.refreshNodeList(),
      this.tasks.copyNodeKeysToSecrets('refreshedConsensusNodes'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Delete network node', NodeSubcommandType.DELETE),
      this.tasks.killNodes(),
      this.tasks.sleep('Give time for pods to come up after being killed', 20_000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeDeleteContext>(NodeSubcommandType.DELETE),
      this.tasks.finalize(),
    ];
  }

  private addPrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), lease),
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
      this.tasks.triggerStakeWeightCalculate<NodeAddContext>(NodeSubcommandType.ADD),
      this.tasks.finalize(),
    ];
  }

  private updatePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedStates: []}),
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
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap(
        'Update chart to use new configMap due to account number change',
        NodeSubcommandType.UPDATE,
        context_ => !context_.config.newAccountNumber && !context_.config.debugNodeAlias,
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeUpdateContext>(NodeSubcommandType.UPDATE),
      this.tasks.finalize(),
    ];
  }

  private upgradePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), lease),
      this.validateAllNodeStates({excludedStates: []}),
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

  public async prepareUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs), lease),
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

    return true;
  }

  public async freezeUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs), null),
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

    return true;
  }

  public async downloadGeneratedFiles(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.downloadGeneratedFilesConfigBuilder.bind(this.configs), lease),
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

    return true;
  }

  public async update(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [...this.updatePrepareTasks(argv, lease), ...this.updateSubmitTransactionsTasks(), ...this.updateExecuteTasks()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in updating nodes',
      lease,
    );

    return true;
  }

  public async updatePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_PREPARE_FLAGS);
    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
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

    return true;
  }

  public async updateSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for node update',
      lease,
    );

    return true;
  }

  public async updateExecute(argv: ArgvStruct): Promise<boolean> {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_EXECUTE_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(
          argv,
          this.configs.updateConfigBuilder.bind(this.configs),
          lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      lease,
    );

    return true;
  }

  public async upgradePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_PREPARE_FLAGS);
    const lease = await this.leaseManager.create();
    await this.commandAction(
      argv,
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
    return true;
  }

  public async upgradeSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for node upgrade',
      lease,
    );

    return true;
  }

  public async upgradeExecute(argv: ArgvStruct): Promise<boolean> {
    const lease = await this.leaseManager.create();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(
          argv,
          this.configs.upgradeConfigBuilder.bind(this.configs),
          lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      lease,
    );

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    const lease = await this.leaseManager.create();
    await this.commandAction(
      argv,
      [
        ...this.upgradePrepareTasks(argv, lease),
        ...this.upgradeSubmitTransactionsTasks(),
        ...this.upgradeExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in upgrade network',
      lease,
    );

    return true;
  }

  public async delete(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_FLAGS);
    const lease = await this.leaseManager.create();
    await this.commandAction(
      argv,
      [
        ...this.deletePrepareTaskList(argv, lease),
        ...this.deleteSubmitTransactionsTaskList(),
        ...this.deleteExecuteTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting nodes',
      lease,
    );

    return true;
  }

  public async deletePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_PREPARE_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
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

    return true;
  }

  public async deleteSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.deleteConfigBuilder.bind(this.configs), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.deleteSubmitTransactionsTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      lease,
    );

    return true;
  }

  public async deleteExecute(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_EXECUTE_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.deleteConfigBuilder.bind(this.configs), lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.deleteExecuteTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      lease,
    );

    return true;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [...this.addPrepareTasks(argv, lease), ...this.addSubmitTransactionsTasks(), ...this.addExecuteTasks()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding node',
      lease,
    );

    return true;
  }

  public async addPrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
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

    return true;
  }

  public async addSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      '`Error in submitting transactions to node',
      lease,
    );

    return true;
  }

  public async addExecute(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(
          argv,
          this.configs.addConfigBuilder.bind(this.configs),
          lease,

          false,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding node',
      lease,
    );

    return true;
  }

  public async logs(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.logsConfigBuilder.bind(this.configs), null),
        this.tasks.getNodeLogsAndConfigs(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading log from nodes',
      null,
    );

    return true;
  }

  public async states(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STATES_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.statesConfigBuilder.bind(this.configs), null),
        this.tasks.getNodeStateFiles(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading states from nodes',
      null,
    );

    return true;
  }

  // TODO this is broken, since genesis reconnects is no longer supported in 0.59+
  // TODO this is not in the test harness
  public async refresh(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.refreshConfigBuilder.bind(this.configs), lease),
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

    return true;
  }

  public async keys(argv: ArgvStruct): Promise<boolean> {
    this.init();
    argv = helpers.addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.keysConfigBuilder.bind(this.configs), null),
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

    return true;
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STOP_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.stopConfigBuilder.bind(this.configs), lease),
        this.validateAllNodeStates({
          acceptedStates: [ConsensusNodeStates.STARTED, ConsensusNodeStates.SETUP],
        }),
        this.tasks.identifyNetworkPods(1),
        this.tasks.stopNodes('nodeAliases'),
        this.changeAllNodeStates(ConsensusNodeStates.INITIALIZED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error stopping node',
      lease,
    );

    return true;
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.START_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.startConfigBuilder.bind(this.configs), lease),
        this.validateAllNodeStates({acceptedStates: [ConsensusNodeStates.SETUP]}),
        this.tasks.identifyExistingNodes(),
        this.tasks.uploadStateFiles(context_ => context_.config.stateFile.length === 0),
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

    return true;
  }

  public async setup(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS);

    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs), lease),
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

    return true;
  }

  public async freeze(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.FREEZE_FLAGS);
    const lease = await this.leaseManager.create();

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.freezeConfigBuilder.bind(this.configs), lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.sendFreezeTransaction(),
        this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
        this.tasks.stopNodes('existingNodeAliases'),
        this.changeAllNodeStates(ConsensusNodeStates.INITIALIZED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error freezing node',
      lease,
    );

    return true;
  }

  public async restart(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.RESTART_FLAGS);

    const lease = await this.leaseManager.create();
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.restartConfigBuilder.bind(this.configs), lease),
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

    return true;
  }

  // TODO MOVE TO TASKS

  /** Removes the consensus node, envoy and haproxy components from remote config.  */
  public removeNodeAndProxies(): SoloListrTask<any> {
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
  public changeAllNodeStates(state: ConsensusNodeStates): SoloListrTask<any> {
    interface Context {
      config: {namespace: NamespaceName; consensusNodes: ConsensusNode[]};
    }

    return {
      title: `Change node state to ${state} in remote config`,
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_: Context): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = context_;

          for (const consensusNode of context_.config.consensusNodes) {
            remoteConfig.components.edit(
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
  }): SoloListrTask<any> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (context_: Context, task): Listr<any, any, any> => {
        const nodeAliases = context_.config.nodeAliases;

        const components = this.remoteConfigManager.components;

        const subTasks: SoloListrTask<Context>[] = nodeAliases.map(nodeAlias => ({
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
  }): SoloListrTask<any> {
    interface Context {
      config: {namespace: string; nodeAlias: NodeAlias};
    }

    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (context_: Context, task): void => {
        const nodeAlias = context_.config.nodeAlias;

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
