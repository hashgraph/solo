// SPDX-License-Identifier: Apache-2.0

import validator from 'validator';
import {KubeValidation} from '../../integration/kube/kube-validation.js';
import {type FlagRule} from '../../types/flag-rule.js';

/**
 * The rules a flag can list in its `rules` array. `dnsLabel`, `nodeAlias`, `alphanumeric` and `integer` are
 * rules already; `atLeast`, `oneOf` and `each` build one from arguments.
 *
 * A flag lists as many as it needs, applied in order:
 * `rules: [FlagRules.integer, FlagRules.atLeast(1)]`. Wrap a rule in `each` to apply it to every entry of a
 * comma-separated value: `rules: [FlagRules.each(FlagRules.nodeAlias)]`.
 */
export class FlagRules {
  public static readonly dnsLabel: FlagRule = (value: string): string | undefined =>
    KubeValidation.isDns1123Label(value)
      ? undefined
      : "must be a valid RFC-1123 DNS label: at most 63 characters, only lowercase alphanumeric characters or '-', " +
        'starting and ending with an alphanumeric character';

  public static readonly nodeAlias: FlagRule = (value: string): string | undefined =>
    /^node[1-9]\d*$/.test(value) ? undefined : "must be a node alias of the form 'node<number>', such as 'node1'";

  /** A solo-local label rather than a Kubernetes name, so underscores are allowed. */
  public static readonly clusterReference: FlagRule = (value: string): string | undefined =>
    /^[a-z0-9_-]+$/.test(value) ? undefined : "must contain only lowercase alphanumeric characters, '-' or '_'";

  public static readonly alphanumeric: FlagRule = (value: string): string | undefined =>
    validator.isAlphanumeric(value) ? undefined : 'must contain only letters and numbers';

  /**
   * Matched as digits rather than through `Number`, which widens 'must be a whole number' to forms the user did not
   * write as one: `Number.isInteger` accepts scientific notation ('1e2') and a trailing period ('1.').
   */
  public static readonly integer: FlagRule = (value: string): string | undefined =>
    /^-?\d+$/.test(value.trim()) ? undefined : 'must be a whole number';

  public static atLeast(minimum: number): FlagRule {
    return (value: string): string | undefined =>
      Number(value) >= minimum ? undefined : `must be at least ${minimum}`;
  }

  public static oneOf(...allowed: string[]): FlagRule {
    return (value: string): string | undefined =>
      allowed.includes(value) ? undefined : `must be one of: ${allowed.join(', ')}`;
  }

  public static each(rule: FlagRule): FlagRule {
    return (value: string): string | undefined => {
      // Empty entries are dropped rather than rejected, matching Helpers.splitFlagInput, so a trailing
      // comma stays acceptable.
      for (const entry of value.split(',').map((entry: string): string => entry.trim())) {
        if (!entry) {
          continue;
        }

        const violation: string | undefined = rule(entry);

        if (violation) {
          return `entry '${entry}' ${violation}`;
        }
      }

      return undefined;
    };
  }
}
