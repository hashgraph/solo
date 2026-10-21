// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {type Deprecation} from '../types/deprecation.js';
import {type RegisteredDeprecation} from '../types/registered-deprecation.js';
import {Flags} from '../commands/flags.js';
import {DeprecatedEnvironmentVariables} from './deprecated-environment-variables.js';

/**
 * Central collection of every deprecated feature in Solo, used by non-runtime consumers that need the full
 * picture at once: the build-time removal reminder ({@link scripts/check-deprecations.ts}) and the generated
 * documentation.
 *
 * Flag deprecations are derived on demand from {@link Flags.allFlags}, so they never need explicit
 * registration; a flag deprecated only for certain commands is listed once, with its scope carried on the
 * {@link FlagDeprecation.commands} metadata. Environment variable deprecations are read from
 * {@link DeprecatedEnvironmentVariables.ALL}. Command and subcommand deprecations are registered by
 * {@link CommandBuilder.build} as the command tree is assembled.
 */
@injectable()
export class DeprecationRegistry {
  private readonly commandDeprecations: Map<string, RegisteredDeprecation> = new Map();

  /**
   * Records a deprecated command group or leaf subcommand. Keyed by feature path so repeated builds of the
   * same command tree do not create duplicates.
   */
  public registerCommand(feature: string, kind: 'command' | 'subcommand', deprecation: Deprecation): void {
    this.commandDeprecations.set(feature, {feature, kind, deprecation});
  }

  /** Returns every known deprecation: flags (derived from the flag registry), environment variables, and commands. */
  public list(): RegisteredDeprecation[] {
    return [
      ...DeprecationRegistry.collectFlagDeprecations(),
      ...DeprecationRegistry.collectEnvironmentVariableDeprecations(),
      ...this.commandDeprecations.values(),
    ];
  }

  private static collectFlagDeprecations(): RegisteredDeprecation[] {
    const deprecations: RegisteredDeprecation[] = [];
    for (const flag of Flags.allFlags) {
      if (flag.definition.deprecated) {
        deprecations.push({feature: `--${flag.name}`, kind: 'flag', deprecation: flag.definition.deprecated});
      }
    }
    return deprecations;
  }

  private static collectEnvironmentVariableDeprecations(): RegisteredDeprecation[] {
    return [...DeprecatedEnvironmentVariables.ALL].map(
      ([name, deprecation]: [string, Deprecation]): RegisteredDeprecation => ({
        feature: name,
        kind: 'environment-variable',
        deprecation,
      }),
    );
  }
}
