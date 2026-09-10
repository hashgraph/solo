// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {CacheCommand} from '../cache.js';

@injectable()
export class CacheCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.CacheCommand) public readonly cacheCommand?: CacheCommand,
  ) {
    super();
    this.cacheCommand = patchInject(cacheCommand, InjectTokens.CacheCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'cache';
  protected static override readonly DESCRIPTION: string = 'Manage solo cached items.';

  public static readonly IMAGE_SUBCOMMAND_NAME: string = 'image';

  public static readonly IMAGE_PULL: string = 'pull';
  public static readonly IMAGE_LOAD: string = 'load';
  public static readonly IMAGE_LIST: string = 'list';
  public static readonly IMAGE_CLEAR: string = 'clear';
  public static readonly IMAGE_STATUS: string = 'status';
  public static readonly IMAGE_PRUNE: string = 'prune';

  public static readonly IMAGE_PULL_COMMAND: string = `${CacheCommandDefinition.COMMAND_NAME} ${CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME} ${CacheCommandDefinition.IMAGE_PULL}`;

  public static readonly IMAGE_LOAD_COMMAND: string = `${CacheCommandDefinition.COMMAND_NAME} ${CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME} ${CacheCommandDefinition.IMAGE_LOAD}`;

  public static readonly CHART_SUBCOMMAND_NAME: string = 'chart';

  public static readonly CHART_PULL: string = 'pull';
  public static readonly CHART_LIST: string = 'list';
  public static readonly CHART_CLEAR: string = 'clear';
  public static readonly CHART_STATUS: string = 'status';
  public static readonly CHART_PRUNE: string = 'prune';

  public static readonly CHART_PULL_COMMAND: string = `${CacheCommandDefinition.COMMAND_NAME} ${CacheCommandDefinition.CHART_SUBCOMMAND_NAME} ${CacheCommandDefinition.CHART_PULL}`;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(CacheCommandDefinition.COMMAND_NAME, CacheCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME, 'Manage image archives used by solo.')
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_PULL,
              'Pull and caches docker images used by solo, prerequisite for `solo cache image load`.',
              this.cacheCommand,
              this.cacheCommand.pull,
              CacheCommand.PULL_FLAGS_LIST,
              [constants.CRANE],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_LOAD,
              'Loads the images archive into a cluster. Pulling the images with `solo cache images pull` is a prerequisite.',
              this.cacheCommand,
              this.cacheCommand.load,
              CacheCommand.LOAD_FLAGS_LIST,
              [constants.KIND],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_LIST,
              'Lists all cached image archives.',
              this.cacheCommand,
              this.cacheCommand.list,
              CacheCommand.LIST_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_CLEAR,
              'Clears the image archives.',
              this.cacheCommand,
              this.cacheCommand.clear,
              CacheCommand.CLEAR_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_PRUNE,
              'Prune the image archives.',
              this.cacheCommand,
              this.cacheCommand.prune,
              CacheCommand.PRUNE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_STATUS,
              'Lists all images, displays data about them and all missing images.',
              this.cacheCommand,
              this.cacheCommand.status,
              CacheCommand.STATUS_FLAGS_LIST,
              [],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(CacheCommandDefinition.CHART_SUBCOMMAND_NAME, 'Manage helm chart archives used by solo.')
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.CHART_PULL,
              'Pulls and caches the helm charts used by solo so deploys can install them from the local cache.',
              this.cacheCommand,
              this.cacheCommand.chartPull,
              CacheCommand.CHART_PULL_FLAGS_LIST,
              [constants.HELM],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.CHART_LIST,
              'Lists all cached helm chart archives.',
              this.cacheCommand,
              this.cacheCommand.chartList,
              CacheCommand.CHART_LIST_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.CHART_CLEAR,
              'Clears the cached helm chart archives.',
              this.cacheCommand,
              this.cacheCommand.chartClear,
              CacheCommand.CHART_CLEAR_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.CHART_PRUNE,
              'Prunes the cached helm chart archives.',
              this.cacheCommand,
              this.cacheCommand.chartPrune,
              CacheCommand.CHART_PRUNE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.CHART_STATUS,
              'Lists all cached helm charts, their total size, and any missing chart archives.',
              this.cacheCommand,
              this.cacheCommand.chartStatus,
              CacheCommand.CHART_STATUS_FLAGS_LIST,
              [],
            ),
          ),
      )
      .build();
  }
}
