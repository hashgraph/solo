// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {AdditionalEnvironmentVariablesSchema} from './additional-environment-variables-schema.js';

/**
 * Operator-controlled settings for the environment Solo builds when spawning external commands
 * (`helm`, `kubectl`, `kind`, container engines, …).
 */
@Exclude()
export class SubprocessSchema {
  /**
   * Exact environment variable names to forward to external commands in addition to the built-in
   * allowlist, so an operator can unblock a variable a new platform requires without waiting for a
   * Solo release (see GitHub issue #5895).
   *
   * Declared per command, so a variable added for an exec credential plugin does not also reach
   * `npm` or a container engine — the per-command containment is the point of the allowlist and is
   * preserved here.
   *
   * Exact names only — no wildcards or prefixes — matching the allowlist's own discipline. Names
   * that could change how a spawned tool loads code, whom it trusts, or where it fetches
   * credentials are refused regardless of what is listed here; see `SubprocessEnvironment`.
   *
   * Deliberately **not** settable through an environment variable, unlike every other config
   * field: a setting that relaxes environment filtering must not itself be controllable by the
   * environment being filtered.
   */
  @Expose()
  @Type((): typeof AdditionalEnvironmentVariablesSchema => AdditionalEnvironmentVariablesSchema)
  public additionalEnvironmentVariables: AdditionalEnvironmentVariablesSchema;

  public constructor(additionalEnvironmentVariables?: AdditionalEnvironmentVariablesSchema) {
    this.additionalEnvironmentVariables = additionalEnvironmentVariables ?? new AdditionalEnvironmentVariablesSchema();
  }
}
