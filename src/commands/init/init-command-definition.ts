// SPDX-License-Identifier: Apache-2.0

import {container, inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from '../command-definitions/base-command-definition.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type DeprecationRegistry} from '../../core/deprecation-registry.js';
import {type Deprecation} from '../../types/deprecation.js';
import {Deprecations} from '../../core/deprecations.js';
import {Flags as flags} from '../flags.js';
import {type AnyYargs} from '../../types/aliases.js';

@injectable()
export class InitCommandDefinition extends BaseCommandDefinition {
  public static override readonly COMMAND_NAME: string = 'init';
  protected static override readonly DESCRIPTION: string = 'Initialize local environment';
  private static readonly DEPRECATION: Deprecation = {
    since: '0.85.0',
    removalIssue: 5389,
    reason: 'Running it is no longer required.',
  };

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    super();
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public getCommandDefinition(): CommandDefinition {
    const deprecationRegistry: DeprecationRegistry = container.resolve<DeprecationRegistry>(
      InjectTokens.DeprecationRegistry,
    );
    deprecationRegistry.registerCommand(
      InitCommandDefinition.COMMAND_NAME,
      'command',
      InitCommandDefinition.DEPRECATION,
    );

    return {
      command: InitCommandDefinition.COMMAND_NAME,
      desc: `${InitCommandDefinition.DESCRIPTION} [DEPRECATED: ${Deprecations.formatHelpMarker(InitCommandDefinition.DEPRECATION)}]`,
      builder: (yargs: AnyYargs): void => {
        flags.setOptionalCommandFlags(yargs, [flags.cacheDir, flags.quiet], InitCommandDefinition.COMMAND_NAME);
      },
      handler: async (): Promise<void> => {
        // No-op: solo init is deprecated since v0.85.0 and no longer does anything.
        // All setup that init previously performed now runs automatically as part of
        // every command via Middlewares.initSystemFiles() and Subcommand.installDependencies().
        this.logger.debug(`'${InitCommandDefinition.COMMAND_NAME}' is deprecated and no longer required; skipping.`);
      },
    };
  }
}
