// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import * as ContextFlags from '../cluster/flags.js';
import {ClusterCommand} from '../cluster/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';

@injectable()
export class ClusterReferenceCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ClusterCommand) public readonly clusterCommand?: ClusterCommand,
  ) {
    super();
    this.clusterCommand = patchInject(clusterCommand, InjectTokens.ClusterCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'cluster-ref';
  protected static override readonly DESCRIPTION: string =
    'Manages the relationship between Kubernetes context names and ' +
    'Solo cluster references which are an alias for a kubernetes context.';

  public static readonly CONFIG_SUBCOMMAND_NAME: string = 'config';
  private static readonly CONFIG_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, and remove associations between Kubernetes contexts and Solo cluster references.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  private static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'Detect, start, and stop the local container engine (Docker Desktop / Podman machine) and the ' +
    'Kind cluster containers it hosts.';

  public static readonly STATE_START: string = 'start';
  public static readonly STATE_STOP: string = 'stop';
  public static readonly STATE_INFO: string = 'info';

  public static readonly CONFIG_CONNECT: string = 'connect';
  public static readonly CONFIG_DISCONNECT: string = 'disconnect';
  public static readonly CONFIG_LIST: string = 'list';
  public static readonly CONFIG_INFO: string = 'info';
  public static readonly CONFIG_SETUP: string = 'setup';
  public static readonly CONFIG_RESET: string = 'reset';

  public static readonly CONNECT_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_CONNECT}` as const;

  public static readonly SETUP_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SETUP}` as const;

  public static readonly RESET_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_RESET}` as const;

  public static readonly DISCONNECT_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_DISCONNECT}` as const;

  public static readonly LIST_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_LIST}` as const;

  public static readonly INFO_COMMAND: string =
    `${ClusterReferenceCommandDefinition.COMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${ClusterReferenceCommandDefinition.CONFIG_INFO}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      ClusterReferenceCommandDefinition.COMMAND_NAME,
      ClusterReferenceCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
          ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_CONNECT,
              'Creates a new internal Solo cluster name to a Kubernetes context or maps a Kubernetes context to an existing internal Solo cluster reference',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.connect,
              ContextFlags.CONNECT_FLAGS,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_DISCONNECT,
              'Removes the Kubernetes context associated with an internal Solo cluster reference.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.disconnect,
              ContextFlags.DEFAULT_FLAGS,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_LIST,
              'Lists the configured Kubernetes context to Solo cluster reference mappings.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.list,
              ContextFlags.NO_FLAGS,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_INFO,
              'Displays the status information and attached deployments for a given Solo cluster reference mapping.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.info,
              ContextFlags.DEFAULT_FLAGS,
              [],
            ),
          )
          // TODO: remove once command is merged in 'consensus network deploy'
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_SETUP,
              'Setup cluster with shared components',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.setup,
              ContextFlags.SETUP_FLAGS,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          // TODO: remove once command is merged in 'consensus network destroy'
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.CONFIG_RESET,
              'Uninstall shared components from cluster',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.reset,
              ContextFlags.RESET_FLAGS,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          ClusterReferenceCommandDefinition.STATE_SUBCOMMAND_NAME,
          ClusterReferenceCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.STATE_START,
              'Starts the container engine (Docker Desktop / Podman machine), then starts any stopped Kind cluster containers belonging to the configured cluster references. Already running containers are left untouched.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.stateStart,
              ContextFlags.NO_FLAGS,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.STATE_STOP,
              'Stops the running Kind cluster containers belonging to the configured cluster references, freeing local resources. Kind clusters not managed by Solo are left untouched.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.stateStop,
              ContextFlags.NO_FLAGS,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ClusterReferenceCommandDefinition.STATE_INFO,
              'Displays the container engine state and the state of every Kind cluster container on the machine, marking which ones belong to a Solo cluster reference.',
              this.clusterCommand.handlers,
              this.clusterCommand.handlers.stateInfo,
              ContextFlags.NO_FLAGS,
              [],
            ),
          ),
      )
      .build();
  }
}
