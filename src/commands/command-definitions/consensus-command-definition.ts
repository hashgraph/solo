// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {NetworkCommand} from '../network.js';
import {type CommandDefinition} from '../../types/index.js';
import {type Deprecation} from '../../types/deprecation.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as NodeFlags from '../node/flags.js';
import * as constants from '../../core/constants.js';

@injectable()
export class ConsensusCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
    @inject(InjectTokens.NetworkCommand) public readonly networkCommand?: NetworkCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.networkCommand = patchInject(networkCommand, InjectTokens.NetworkCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'consensus';
  protected static override readonly DESCRIPTION: string =
    'Consensus Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly NETWORK_SUBCOMMAND_NAME: string = 'network';
  private static readonly NETWORK_SUBCOMMAND_DESCRIPTION: string =
    'Ledger/network wide consensus operations such as freeze, upgrade, ' +
    'and deploy. Operates on the entire ledger and all consensus node instances.';

  public static readonly NODE_SUBCOMMAND_NAME: string = 'node';
  private static readonly NODE_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy consensus node instances. Operates on a single consensus node instance at a time.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  private static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'List, download, and upload consensus node state backups to/from individual consensus node instances.';

  public static readonly DEV_NODE_ADD_SUBCOMMAND_NAME: string = 'dev-node-add';
  private static readonly DEV_NODE_ADD_SUBCOMMAND_DESCRIPTION: string = 'Dev operations for adding consensus nodes.';

  public static readonly DEV_NODE_UPDATE_SUBCOMMAND_NAME: string = 'dev-node-update';
  private static readonly DEV_NODE_UPDATE_SUBCOMMAND_DESCRIPTION: string =
    'Dev operations for updating consensus nodes';

  public static readonly DEV_NODE_UPGRADE_SUBCOMMAND_NAME: string = 'dev-node-upgrade';
  private static readonly DEV_NODE_UPGRADE_SUBCOMMAND_DESCRIPTION: string =
    'Dev operations for upgrading consensus nodes';

  public static readonly DEV_NODE_DELETE_SUBCOMMAND_NAME: string = 'dev-node-delete';
  private static readonly DEV_NODE_DELETE_SUBCOMMAND_DESCRIPTION: string = 'Dev operations for delete consensus nodes';

  public static readonly DEV_FREEZE_SUBCOMMAND_NAME: string = 'dev-freeze';
  private static readonly DEV_FREEZE_SUBCOMMAND_DESCRIPTION: string = 'Dev operations for freezing consensus nodes';

  public static readonly DEV_NODE_PREPARE: string = 'prepare';
  public static readonly DEV_NODE_SUBMIT_TRANSACTION: string = 'submit-transactions';
  public static readonly DEV_NODE_EXECUTE: string = 'execute';

  public static readonly DEV_FREEZE_PREPARE_UPGRADE: string = 'prepare-upgrade';
  public static readonly DEV_FREEZE_FREEZE_UPGRADE: string = 'freeze-upgrade';

  /** Tracks the removal of the step-by-step `dev-*` subcommands, which are superseded by the single-shot commands. */
  private static readonly DEV_COMMANDS_REMOVAL_ISSUE: number = 6218;

  private static devDeprecation(replacement: string): Deprecation {
    return {
      since: '0.94.0',
      removalIssue: ConsensusCommandDefinition.DEV_COMMANDS_REMOVAL_ISSUE,
      replacement,
    };
  }

  public static readonly NODE_SETUP: string = 'setup';
  public static readonly NODE_START: string = 'start';
  public static readonly NODE_STOP: string = 'stop';
  public static readonly NODE_RESTART: string = 'restart';
  public static readonly NODE_REFRESH: string = 'refresh';
  public static readonly NODE_LOGS: string = 'logs';
  public static readonly NODE_STATES: string = 'states';
  public static readonly NODE_ADD: string = 'add';
  public static readonly NODE_UPDATE: string = 'update';
  public static readonly NODE_DESTROY: string = 'destroy';
  public static readonly COLLECT_JFR: string = 'collect-jfr';

  public static readonly NETWORK_DEPLOY: string = 'deploy';
  public static readonly NETWORK_DESTROY: string = 'destroy';
  public static readonly NETWORK_UPGRADE: string = 'upgrade';
  public static readonly NETWORK_FREEZE: string = 'freeze';

  public static readonly STATE_DOWNLOAD: string = 'download';

  public static readonly SETUP_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_SETUP}` as const;

  public static readonly START_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_START}` as const;

  public static readonly DEPLOY_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_DEPLOY}` as const;

  public static readonly DESTROY_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_DESTROY}` as const;

  public static readonly ADD_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_ADD}` as const;

  public static readonly UPDATE_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_UPDATE}` as const;

  public static readonly UPGRADE_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_UPGRADE}` as const;

  public static readonly STATES_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_STATES}` as const;

  public static readonly RESTART_COMMAND: string =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_RESTART}` as const;

  public getCommandDefinition(): CommandDefinition {
    return (
      new CommandBuilder(ConsensusCommandDefinition.COMMAND_NAME, ConsensusCommandDefinition.DESCRIPTION, this.logger)
        // NETWORK SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_DEPLOY,
                'Installs and configures all consensus nodes for the deployment.',
                this.networkCommand,
                this.networkCommand.deploy,
                NetworkCommand.DEPLOY_FLAGS_LIST,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_DESTROY,
                'Removes all consensus network components from the deployment.',
                this.networkCommand,
                this.networkCommand.destroy,
                NetworkCommand.DESTROY_FLAGS_LIST,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_FREEZE,
                'Initiates a network freeze for scheduled maintenance or upgrades',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.freeze,
                NodeFlags.FREEZE_FLAGS,
                [],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_UPGRADE,
                'Upgrades the software version running on all consensus nodes.',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgrade,
                NodeFlags.UPGRADE_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            ),
        )
        // NODE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_SETUP,
                'Setup node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.setup,
                NodeFlags.SETUP_FLAGS,
                [],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_START,
                'Start a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.start,
                NodeFlags.START_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_STOP,
                'Stop a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.stop,
                NodeFlags.STOP_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_RESTART,
                'Restart all nodes of the network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.restart,
                NodeFlags.RESTART_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_REFRESH,
                'Reset and restart a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.refresh,
                NodeFlags.REFRESH_FLAGS,
                [],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_ADD,
                'Adds a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.add,
                NodeFlags.ADD_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_UPDATE,
                'Update a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.update,
                NodeFlags.UPDATE_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_DESTROY,
                'Delete a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroy,
                NodeFlags.DESTROY_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.COLLECT_JFR,
                'Collect Java Flight Recorder (JFR) files from a node for diagnostics and performance analysis. ' +
                  'Requires the node to be running with Java Flight Recorder enabled.',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.collectJavaFlightRecorderLogs,
                NodeFlags.COLLECT_JFR_FLAGS,
                [...constants.BASE_DEPENDENCIES],
              ),
            ),
        )
        // STATE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
          ).addSubcommand(
            new Subcommand(
              ConsensusCommandDefinition.STATE_DOWNLOAD,
              'Downloads a signed state from consensus node/nodes.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.states,
              NodeFlags.STATES_FLAGS,
            ),
          ),
        )
        // DEV NODE ADD SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_DESCRIPTION,
            ConsensusCommandDefinition.devDeprecation('consensus node add'),
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepares the addition of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addPrepare,
                NodeFlags.ADD_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addSubmitTransactions,
                NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the addition of a previously prepared node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addExecute,
                NodeFlags.ADD_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV NODE UPDATE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_DESCRIPTION,
            ConsensusCommandDefinition.devDeprecation('consensus node update'),
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepare the deployment to update a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updatePrepare,
                NodeFlags.UPDATE_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submit transactions for updating a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updateSubmitTransactions,
                NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the updating of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updateExecute,
                NodeFlags.UPDATE_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV NODE UPGRADE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_DESCRIPTION,
            ConsensusCommandDefinition.devDeprecation('consensus network upgrade'),
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepare for upgrading network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradePrepare,
                NodeFlags.UPGRADE_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submit transactions for upgrading network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradeSubmitTransactions,
                NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the upgrading the network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradeExecute,
                NodeFlags.UPGRADE_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV NODE DELETE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_DESCRIPTION,
            ConsensusCommandDefinition.devDeprecation('consensus node destroy'),
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepares the deletion of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroyPrepare,
                NodeFlags.DESTROY_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submits transactions to the network nodes for deleting a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroySubmitTransactions,
                NodeFlags.DESTROY_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the deletion of a previously prepared node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroyExecute,
                NodeFlags.DESTROY_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV FREEZE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_FREEZE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_FREEZE_SUBCOMMAND_DESCRIPTION,
            ConsensusCommandDefinition.devDeprecation('consensus network freeze'),
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_FREEZE_PREPARE_UPGRADE,
                'Prepare the network for a Freeze Upgrade operation',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.prepareUpgrade,
                NodeFlags.PREPARE_UPGRADE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_FREEZE_FREEZE_UPGRADE,
                'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.freezeUpgrade,
                NodeFlags.PREPARE_UPGRADE_FLAGS,
              ),
            ),
        )
        .build()
    );
  }
}
