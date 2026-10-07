// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {SubprocessEnvironment} from '../core/subprocess-environment.js';

export class ExecutionBuilder {
  /** The flags to be passed to the command. */
  protected readonly _flags: string[] = [];

  /**
   * Adds a flag to the execution.
   * @param flag the flag to add; must start with `-`, else the CLI silently treats it as a positional argument
   * @returns this builder
   */
  public flag(flag: string): this {
    if (!flag) {
      throw new SoloErrors.validation.illegalArgument('flag must not be null', flag);
    }
    if (!flag.startsWith('-')) {
      throw new SoloErrors.validation.illegalArgument('flag must start with "-"', flag);
    }
    this._flags.push(flag);
    return this;
  }

  public prefixPath(environment: Record<string, string>, prefix: string): void {
    const pathKey: string = SubprocessEnvironment.pathKey(environment);
    const existingPath: string | undefined = environment[pathKey];
    environment[pathKey] = existingPath ? `${prefix}${path.delimiter}${existingPath}` : prefix || '';
  }
}
