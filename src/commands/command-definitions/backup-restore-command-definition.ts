// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {BackupRestoreCommand} from '../backup-restore.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class BackupRestoreCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.BackupRestoreCommand) public readonly backupRestoreCommand?: BackupRestoreCommand,
  ) {
    super();
    this.backupRestoreCommand = patchInject(
      backupRestoreCommand,
      InjectTokens.BackupRestoreCommand,
      this.constructor.name,
    );
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'config';
  protected static override readonly DESCRIPTION: string =
    'Backup and restore component configurations for Solo deployments. ' +
    'These commands display what would be backed up or restored without performing actual operations.';

  public static readonly SUBCOMMAND_NAME: string = 'ops';
  private static readonly SUBCOMMAND_DESCRIPTION: string = 'Configuration backup and restore operations';

  public static readonly BACKUP_COMMAND: string = 'backup';
  public static readonly RESTORE_CONFIG_COMMAND: string = 'restore-config';
  public static readonly RESTORE_CLUSTERS_COMMAND: string = 'restore-clusters';
  public static readonly RESTORE_NETWORK_COMMAND: string = 'restore-network';
  public static readonly RESTORE_DB_COMMAND: string = 'restore-db';
  public static readonly BRIDGE_IMPORT_GAP_COMMAND: string = 'bridge-import-gap';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      BackupRestoreCommandDefinition.COMMAND_NAME,
      BackupRestoreCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          BackupRestoreCommandDefinition.SUBCOMMAND_NAME,
          BackupRestoreCommandDefinition.SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.BACKUP_COMMAND,
              'Create a backup for all component configurations of a deployment. ' +
                'Create a zip file with configuration and log data.' +
                'Export states, configmaps and secrets',
              this.backupRestoreCommand,
              this.backupRestoreCommand.backup,
              BackupRestoreCommand.BACKUP_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_CONFIG_COMMAND,
              'Restore component configurations from backup. ' +
                'Imports ConfigMaps, Secrets, logs, and state files for a running deployment.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restoreConfig,
              BackupRestoreCommand.RESTORE_CONFIG_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_CLUSTERS_COMMAND,
              'Restore Kind clusters from backup directory structure. ' +
                'Creates clusters, sets up Docker network, installs MetalLB, and initializes cluster configurations. ' +
                'Does not deploy network components.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restoreClusters,
              BackupRestoreCommand.RESTORE_CLUSTERS_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_NETWORK_COMMAND,
              'Deploy network components to existing clusters from backup. ' +
                'Deploys consensus nodes, block nodes, mirror nodes, explorers, and relay nodes. ' +
                'Requires clusters to be already created (use restore-clusters first).',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restoreNetwork,
              BackupRestoreCommand.RESTORE_NETWORK_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_DB_COMMAND,
              'Restore the external database dump independently of restore-config. ' +
                'Run this before restore-network so mirror, relay, and explorer deploy against an already-populated database.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restoreDb,
              BackupRestoreCommand.RESTORE_DB_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.BRIDGE_IMPORT_GAP_COMMAND,
              'Bridge a mirror importer record_file gap after restore and restart the importer.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.bridgeImportGap,
              BackupRestoreCommand.BRIDGE_IMPORT_GAP_FLAGS_LIST,
              [],
            ),
          ),
      )
      .build();
  }
}
