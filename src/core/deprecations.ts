// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from '../types/deprecation.js';
import {type FlagDeprecation} from '../types/flag-deprecation.js';
import {type Version} from '../types/index.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';

/**
 * Pure helpers for reasoning about {@link Deprecation} metadata: computing removal targets and formatting
 * the consistent user-facing warning and help/docs markers.
 */
export class Deprecations {
  /** Default number of minor versions a feature is kept after deprecation before it should be removed. */
  public static readonly DEFAULT_REMOVAL_WINDOW: number = 6;

  /**
   * Computes the removal target version by advancing {@link since} forward by {@link window} minor versions.
   * Solo is on the `0.x` line, so the removal window is measured in minor bumps (e.g. `0.84.0` + 6 = `0.90.0`).
   */
  public static computeRemoveBy(since: Version, window: number = Deprecations.DEFAULT_REMOVAL_WINDOW): Version {
    let version: SemanticVersion<string> = new SemanticVersion<string>(since);
    for (let index: number = 0; index < window; index += 1) {
      version = version.bumpMinor();
    }
    return version.toString();
  }

  /** Returns the explicit {@link Deprecation.removeBy} when set, otherwise the auto-computed removal target. */
  public static resolveRemoveBy(deprecation: Deprecation): Version {
    return deprecation.removeBy ?? Deprecations.computeRemoveBy(deprecation.since);
  }

  /**
   * Returns the command paths a flag deprecation is limited to, or `undefined` when the deprecation applies
   * to every command that accepts the flag. Command and subcommand deprecations are never scoped, so they
   * always yield `undefined`.
   */
  public static commandScope(deprecation: FlagDeprecation): string[] | undefined {
    return deprecation.commands?.length ? deprecation.commands : undefined;
  }

  /**
   * Returns true when a deprecation applies to the invoked command path. An unscoped deprecation applies
   * everywhere; a scoped one applies to each listed command path and to every operation beneath it, so
   * scoping to `relay node` also covers `relay node add`.
   * @param deprecation - the structured deprecation metadata
   * @param commandPath - the invoked command path, e.g. `relay node add` (empty when no command was given)
   */
  public static appliesToCommand(deprecation: FlagDeprecation, commandPath: string): boolean {
    const scope: string[] | undefined = Deprecations.commandScope(deprecation);
    if (!scope) {
      return true;
    }
    return scope.some((command: string): boolean => commandPath === command || commandPath.startsWith(`${command} `));
  }

  /**
   * Builds the canonical warning shown to the user whenever a deprecated feature is used.
   * @param feature - the deprecated feature's identifier, e.g. `--release-tag`
   * @param deprecation - the structured deprecation metadata
   * @param commandScope - the command the deprecation applies to, for a deprecation scoped to specific
   *   commands; omitted for a feature that is deprecated outright
   */
  public static formatDeprecationMessage(feature: string, deprecation: Deprecation, commandScope?: string): string {
    const removeBy: Version = Deprecations.resolveRemoveBy(deprecation);
    const scope: string = commandScope ? ` for '${commandScope}'` : '';
    const parts: string[] = [
      `'${feature}' is deprecated${scope} since v${deprecation.since} and will be removed in v${removeBy}.`,
    ];
    if (deprecation.replacement) {
      parts.push(`Use '${deprecation.replacement}' instead.`);
    }
    if (deprecation.reason) {
      parts.push(deprecation.reason);
    }
    return parts.join(' ');
  }

  /**
   * Builds the compact marker embedded in help text and generated documentation. It is intentionally short
   * because it is appended to a flag/command description; the leading "deprecated" word is supplied by the
   * surrounding context (yargs' `[deprecated: ...]` for flags, `[DEPRECATED: ...]` for commands).
   */
  public static formatHelpMarker(deprecation: Deprecation): string {
    const removeBy: Version = Deprecations.resolveRemoveBy(deprecation);
    const replacement: string = deprecation.replacement ? `, use ${deprecation.replacement}` : '';
    return `since v${deprecation.since}, removal v${removeBy}${replacement}`;
  }
}
