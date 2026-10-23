// SPDX-License-Identifier: Apache-2.0

import {ConfigurationError} from '../configuration/api/configuration-error.js';
import {EnvironmentAliasRegistry} from '../schema/decorators/environment-alias-registry.js';
import {EnvironmentKeyFormatter} from './environment-key-formatter.js';

/**
 * The environment variable name every config key the schema declares is read from.
 *
 * <p>Names use `_` for both nesting levels and camelCase word boundaries, so a name cannot be taken apart
 * again — `HELM_CHART_DIRECTORY` could be `helmChart.directory` or `helm.chart.directory`. Only the schema
 * can generate names, so the environment is read forwards from this map rather than scanned and mapped
 * back; a `SOLO_*` variable matching no declared key is not configuration and is ignored. Two keys
 * formatting to one name would both read that variable, which is a schema defect and fails fast.
 */
export class EnvironmentKeyRegistry {
  /** Memoized `environment variable name` (unprefixed) -> `dotted config key path`. */
  private static cachedKeyMap: Map<string, string> | undefined;

  /** The config leaves {@link cachedKeyMap} was built from; a new Map means the schemas changed. */
  private static cachedLeaves: ReadonlyMap<string, string> | undefined;

  private constructor() {}

  /**
   * Returns the environment variable name -> config key map, rebuilding it when the registered root schemas
   * have changed.
   * @throws ConfigurationError if two config keys format to the same environment variable name.
   */
  public static keyMap(): ReadonlyMap<string, string> {
    const leaves: ReadonlyMap<string, string> = EnvironmentAliasRegistry.configLeaves();
    if (EnvironmentKeyRegistry.cachedKeyMap && EnvironmentKeyRegistry.cachedLeaves === leaves) {
      return EnvironmentKeyRegistry.cachedKeyMap;
    }

    const result: Map<string, string> = new Map<string, string>();
    for (const path of leaves.keys()) {
      const name: string = EnvironmentKeyFormatter.instance().normalize(path);
      const existing: string | undefined = result.get(name);
      if (existing !== undefined) {
        throw new ConfigurationError(
          `Config keys '${existing}' and '${path}' both map to the environment variable name '${name}'; ` +
            'rename one of the schema fields so each key has a distinct environment variable name.',
        );
      }
      result.set(name, path);
    }

    EnvironmentKeyRegistry.cachedKeyMap = result;
    EnvironmentKeyRegistry.cachedLeaves = leaves;
    return result;
  }

  /** Every config key the environment may override, as dotted camelCase. */
  public static configKeys(): Iterable<string> {
    return EnvironmentKeyRegistry.keyMap().values();
  }
}
