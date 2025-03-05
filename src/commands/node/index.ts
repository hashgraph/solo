/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {IllegalArgumentError} from '../../core/errors.js';
import {type AccountManager} from '../../core/account_manager.js';
import {YargsCommand} from '../../core/yargs_command.js';
import {BaseCommand, type Opts} from './../base.js';
import * as NodeFlags from './flags.js';
import {type NodeCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';

/**
 * Defines the core functionalities of 'node' command
 */
export class NodeCommand extends BaseCommand {
  private readonly accountManager: AccountManager;
  public readonly handlers: NodeCommandHandlers;
  public _portForwards: any;

  constructor(opts: Opts) {
    super(opts);

    if (!opts || !opts.downloader)
      throw new IllegalArgumentError('An instance of core/PackageDownloader is required', opts.downloader);
    if (!opts || !opts.platformInstaller)
      throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller);
    if (!opts || !opts.keyManager)
      throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager);
    if (!opts || !opts.accountManager)
      throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager);
    if (!opts || !opts.profileManager)
      throw new IllegalArgumentError('An instance of ProfileManager is required', opts.profileManager);
    if (!opts || !opts.certificateManager)
      throw new IllegalArgumentError('An instance of CertificateManager is required', opts.certificateManager);

    this.accountManager = opts.accountManager;

    this.handlers = patchInject(null, InjectTokens.NodeCommandHandlers, this.constructor.name);
    this._portForwards = [];
  }

  /**
   * stops and closes the port forwards
   * - calls the accountManager.close()
   * - for all portForwards, calls k8Factory.default().pods().readByRef(null).stopPortForward(srv)
   */
  async close() {
    await this.accountManager.close();
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        // pass null to readByRef because it isn't needed for stopPortForward()
        await this.k8Factory.default().pods().readByRef(null).stopPortForward(srv);
      }
    }

    this._portForwards = [];
  }

  getUnusedConfigs(configName: string): string[] {
    return this.handlers.getUnusedConfigs(configName);
  }

  getCommandDefinition() {
    const self = this;
    return {
      command: 'node',
      desc: 'Manage Hedera platform node in solo network',
      builder: (yargs: any) => {
        return yargs
          .command(
            new YargsCommand(
              {
                command: 'setup',
                description: 'Setup node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'setup',
              },
              NodeFlags.SETUP_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'start',
                description: 'Start a node',
                commandDef: self,
                handler: 'start',
              },
              NodeFlags.START_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'stop',
                description: 'Stop a node',
                commandDef: self,
                handler: 'stop',
              },
              NodeFlags.STOP_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'freeze',
                description: 'Freeze all nodes of the network',
                commandDef: self,
                handler: 'freeze',
              },
              NodeFlags.FREEZE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'restart',
                description: 'Restart all nodes of the network',
                commandDef: self,
                handler: 'restart',
              },
              NodeFlags.RESTART_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'keys',
                description: 'Generate node keys',
                commandDef: self,
                handler: 'keys',
              },
              NodeFlags.KEYS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'refresh',
                description: 'Reset and restart a node',
                commandDef: self,
                handler: 'refresh',
              },
              NodeFlags.REFRESH_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'logs',
                description:
                  'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
                commandDef: self,
                handler: 'logs',
              },
              NodeFlags.LOGS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'states',
                description:
                  'Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
                commandDef: self,
                handler: 'states',
              },
              NodeFlags.STATES_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add',
                description: 'Adds a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'add',
              },
              NodeFlags.ADD_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-prepare',
                description: 'Prepares the addition of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'addPrepare',
              },
              NodeFlags.ADD_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-submit-transactions',
                description: 'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
                commandDef: self,
                handler: 'addSubmitTransactions',
              },
              NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-execute',
                description: 'Executes the addition of a previously prepared node',
                commandDef: self,
                handler: 'addExecute',
              },
              NodeFlags.ADD_EXECUTE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update',
                description: 'Update a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'update',
              },
              NodeFlags.UPDATE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-prepare',
                description: 'Prepare the deployment to update a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updatePrepare',
              },
              NodeFlags.UPDATE_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-submit-transactions',
                description: 'Submit transactions for updating a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updateSubmitTransactions',
              },
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-execute',
                description: 'Executes the updating of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updateExecute',
              },
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete',
                description: 'Delete a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'delete',
              },
              NodeFlags.DELETE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-prepare',
                description: 'Prepares the deletion of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'deletePrepare',
              },
              NodeFlags.DELETE_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-submit-transactions',
                description: 'Submits transactions to the network nodes for deleting a node',
                commandDef: self,
                handler: 'deleteSubmitTransactions',
              },
              NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-execute',
                description: 'Executes the deletion of a previously prepared node',
                commandDef: self,
                handler: 'deleteExecute',
              },
              NodeFlags.DELETE_EXECUTE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'prepare-upgrade',
                description: 'Prepare the network for a Freeze Upgrade operation',
                commandDef: self,
                handler: 'prepareUpgrade',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'freeze-upgrade',
                description:
                  'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
                commandDef: self,
                handler: 'freezeUpgrade',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'upgrade',
                description: 'upgrades all nodes on the network',
                commandDef: self,
                handler: 'upgrade',
              },
              NodeFlags.UPGRADE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'upgrade-prepare',
                description: 'Prepare the deployment to upgrade network',
                commandDef: self,
                handler: 'upgradePrepare',
              },
              NodeFlags.UPGRADE_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'upgrade-submit-transactions',
                description: 'Submit transactions for upgrading network',
                commandDef: self,
                handler: 'upgradeSubmitTransactions',
              },
              NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'upgrade-execute',
                description: 'Executes the upgrading the network',
                commandDef: self,
                handler: 'upgradeExecute',
              },
              NodeFlags.UPGRADE_EXECUTE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'download-generated-files',
                description: 'Downloads the generated files from an existing node',
                commandDef: self,
                handler: 'downloadGeneratedFiles',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .demandCommand(1, 'Select a node command');
      },
    };
  }
}
