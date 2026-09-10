// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../types/flag-types.js';
import {type Optional} from '../../types/index.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';

/**
 * Applies the rules a flag declares to a supplied value.
 *
 * `assertAllValid` guards a command's flags before it does any work, throwing a coded error naming the flag.
 * `violationOf` returns the reason instead of throwing, so an interactive prompt can re-ask with it as the
 * message. Absent and empty values are left alone — whether a flag is required is yargs' concern.
 */
export class FlagValidation {
  public static violationOf(flag: Optional<CommandFlag>, value?: unknown): string | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    for (const rule of flag?.rules ?? []) {
      const violation: string | undefined = rule(String(value));

      if (violation) {
        return violation;
      }
    }

    return undefined;
  }

  public static assertAllValid(flags: CommandFlag[], values: Record<string, unknown>): void {
    for (const flag of flags) {
      const violation: string | undefined = FlagValidation.violationOf(flag, values[flag.name]);

      if (violation) {
        throw new SoloErrors.validation.invalidFlagValue(flag.name, String(values[flag.name]), violation);
      }
    }
  }
}
