// SPDX-License-Identifier: Apache-2.0

/**
 * @file check-deprecations.ts
 *
 * Non-blocking, build-time reminder for deprecated features. It lists every deprecated command, subcommand,
 * and flag, and emits a prominent warning (with the tracking issue) for any whose removal-target version has
 * been reached by the current Solo version.
 *
 * It intentionally never fails the build (always exits 0). The removal target is advisory: keeping a feature
 * beyond its target is a deliberate decision made by updating its tracking issue, not a CI error. Running as
 * part of `task build` means the reminder is seen constantly by developers and in CI without blocking anyone.
 */

import 'reflect-metadata';
import chalk from 'chalk';
import {container} from 'tsyringe-neo';
import * as constants from '../src/core/constants.js';
import {Container} from '../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../src/core/dependency-injection/inject-tokens.js';
import {type DeprecationRegistry} from '../src/core/deprecation-registry.js';
import {Deprecations} from '../src/core/deprecations.js';
import {type RegisteredDeprecation} from '../src/types/registered-deprecation.js';
import {type AnyObject} from '../src/types/aliases.js';
import {SemanticVersion} from '../src/business/utils/semantic-version.js';
import {getSoloVersion} from '../version.js';

class DeprecationChecker {
  public static run(): void {
    const currentVersion: string = getSoloVersion();
    const deprecations: RegisteredDeprecation[] = DeprecationChecker.collect();

    if (deprecations.length === 0) {
      console.log(chalk.dim('No deprecated features registered.'));
      return;
    }

    console.log(chalk.bold(`Deprecated features (current Solo version v${currentVersion}):`));

    let pastDueCount: number = 0;
    for (const entry of deprecations) {
      const removeBy: string = Deprecations.resolveRemoveBy(entry.deprecation);
      const isPastDue: boolean = new SemanticVersion<string>(currentVersion).greaterThanOrEqual(removeBy);
      const scope: string[] | undefined = Deprecations.commandScope(entry.deprecation);
      const scopeDetail: string = scope ? ` (only for ${scope.join(', ')})` : '';
      const detail: string = `${entry.kind} '${entry.feature}'${scopeDetail} — since v${entry.deprecation.since}, removal v${removeBy}, issue #${entry.deprecation.removalIssue}`;

      if (isPastDue) {
        pastDueCount += 1;
        console.log(
          chalk.yellow(
            `⚠ ${detail} — was due for removal in v${removeBy} (current v${currentVersion}). Remove it or update issue #${entry.deprecation.removalIssue}.`,
          ),
        );
      } else {
        console.log(chalk.dim(`• ${detail}`));
      }
    }

    if (pastDueCount > 0) {
      console.log(
        chalk.yellow(`\n${pastDueCount} deprecated feature(s) have reached their removal target — please review.`),
      );
    }
  }

  private static collect(): RegisteredDeprecation[] {
    try {
      Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
      const commands: AnyObject = container.resolve(InjectTokens.Commands);
      // Building the command definitions registers every deprecated command/subcommand into the registry;
      // flag deprecations are derived by the registry directly from the flag registry.
      commands.getCommandDefinitions();
      const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
      return registry.list();
    } catch (error) {
      // best-effort: never fail the build. Surface the reason so the skipped check is not silent.
      console.log(chalk.dim(`Skipping deprecation check: ${error instanceof Error ? error.message : String(error)}`));
      return [];
    }
  }
}

DeprecationChecker.run();
