// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {
  CommandBuilder,
  CommandGroup,
  ONE_SHOT_COMMAND,
  SINGLE_DEPLOY,
  SINGLE_SUBCOMMAND,
  Subcommand,
} from '../../core/command-path-builders/command-builder.js';
import {DefaultOneShotCommand} from '../one-shot/default-one-shot.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {FALCON_DEPLOY_COMMAND, FALCON_PREPARE_COMMAND} from '../one-shot/one-shot-command-paths.js';
import {Flags as flags} from '../flags.js';

@injectable()
export class OneShotCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.OneShotCommand) public readonly oneShotCommand?: DefaultOneShotCommand,
  ) {
    super();
    this.oneShotCommand = patchInject(oneShotCommand, InjectTokens.OneShotCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = ONE_SHOT_COMMAND;
  protected static override readonly DESCRIPTION: string =
    'One Shot commands for new and returning users who need a preset environment type. ' +
    'These commands use reasonable defaults to provide a single command out of box experience.';

  public static readonly SINGLE_SUBCOMMAND_NAME: string = SINGLE_SUBCOMMAND;
  private static readonly SINGLE_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with a single consensus node, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly MULTI_SUBCOMMAND_NAME: string = 'multi';
  private static readonly MULTI_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with multiple consensus nodes, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly FALCON_SUBCOMMAND_NAME: string = 'falcon';
  private static readonly FALCON_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with optional chart values override using --values-file.';

  public static readonly SINGLE_DEPLOY: string = SINGLE_DEPLOY;
  public static readonly SINGLE_DESTROY: string = 'destroy';
  public static readonly INFO_COMMAND_NAME: string = 'show';
  public static readonly MULTIPLE_DEPLOY: string = 'deploy';
  public static readonly MULTIPLE_DESTROY: string = 'destroy';
  public static readonly FALCON_PREPARE: string = 'prepare';

  public static readonly FALCON_PREPARE_COMMAND: string = FALCON_PREPARE_COMMAND;

  public static readonly FALCON_DEPLOY_COMMAND: string = FALCON_DEPLOY_COMMAND;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(OneShotCommandDefinition.COMMAND_NAME, OneShotCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
          OneShotCommandDefinition.SINGLE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DEPLOY,
              'Deploys all required components for the selected one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.deploy,
              DefaultOneShotCommand.DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES, ...(constants.CONFIG.ENABLE_IMAGE_CACHE ? [constants.CRANE] : [])],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DESTROY,
              'Removes the deployed resources for the selected one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.destroy,
              DefaultOneShotCommand.DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.MULTI_SUBCOMMAND_NAME,
          OneShotCommandDefinition.MULTI_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.MULTIPLE_DEPLOY,
              'Deploys all required components for the selected multiple node one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.deploy,
              DefaultOneShotCommand.MULTI_DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES, ...(constants.CONFIG.ENABLE_IMAGE_CACHE ? [constants.CRANE] : [])],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.MULTIPLE_DESTROY,
              'Removes the deployed resources for the selected multiple node one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.destroy,
              DefaultOneShotCommand.DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.FALCON_SUBCOMMAND_NAME,
          OneShotCommandDefinition.FALCON_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DEPLOY,
              'Deploys all required components for the selected one shot configuration (with optional values file).',
              this.oneShotCommand,
              this.oneShotCommand.deployFalcon,
              DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES, ...(constants.CONFIG.ENABLE_IMAGE_CACHE ? [constants.CRANE] : [])],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DESTROY,
              'Removes the deployed resources for the selected one shot configuration (with optional values file).',
              this.oneShotCommand,
              this.oneShotCommand.destroyFalcon,
              DefaultOneShotCommand.FALCON_DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.FALCON_PREPARE,
              `Generates a falcon values file for use with ${OneShotCommandDefinition.FALCON_DEPLOY_COMMAND}. Writes to ${flags.outputValuesFile.definition.defaultValue} by default.`,
              this.oneShotCommand,
              this.oneShotCommand.prepareFalcon,
              DefaultOneShotCommand.FALCON_PREPARE_FLAGS_LIST,
              [],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(OneShotCommandDefinition.INFO_COMMAND_NAME, 'Display information about one-shot deployments.')
          .addSubcommand(
            new Subcommand(
              'deployment',
              'Display information about the last one-shot deployment including name, versions, and deployed components.',
              this.oneShotCommand,
              this.oneShotCommand.info,
              DefaultOneShotCommand.INFO_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'accounts',
              'Display the contents of the one-shot deployment accounts.json file (supports --output json|yaml|wide).',
              this.oneShotCommand,
              this.oneShotCommand.showAccounts,
              DefaultOneShotCommand.SHOW_ACCOUNTS_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
