// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {ReflectAssist} from '../../business/utils/reflect-assist.js';
import {EnvironmentAliasRegistry} from '../schema/decorators/environment-alias-registry.js';

/**
 * Normalises flattened configuration values against the type their schema field declares.
 *
 * <p>Every source stores its values as strings and they reach the schema through {@code JSON.parse},
 * which does not check the target type: {@code FALSE} would stay a truthy string on a boolean flag, and
 * {@code abc} a string on a numeric field where {@code 0 < 'abc'} is false. YAML makes the same trap
 * easier to fall into — the {@code yaml} package reads YAML 1.2, where {@code off}, {@code no} and
 * {@code yes} are plain strings rather than booleans, so {@code skipNodePing: off} in a config file would
 * otherwise read as *on*.
 *
 * <p>Applied by every {@link ConfigSource} that flattens into a {@link Forest}, so a value means the same
 * thing whether it was set in the environment, in a bundled {@code resources/config} file, or in the
 * operator's own {@code ~/.solo/solo-config.yaml}.
 */
export class DeclaredTypeCoercer {
  /**
   * Rewrites each value of {@code data} in place into the canonical form of its declared type. Keys the
   * schema does not declare are left untouched, so a forest holding something other than
   * {@code SoloConfigSchema} (local or remote config) passes through unchanged.
   *
   * @param data - flattened config key to raw string value; mutated in place.
   * @param originFor - describes where a key's value came from, for the error message.
   * @throws ConfigValueTypeMismatchSoloError when a value cannot be read as its declared type.
   */
  public static coerce(data: Map<string, string>, originFor: (configKey: string) => string): void {
    const declaredTypes: ReadonlyMap<string, string> = EnvironmentAliasRegistry.configLeaves();

    for (const [key, value] of data) {
      // Strings are taken verbatim; objects and arrays are already serialized JSON.
      switch (declaredTypes.get(key)) {
        case 'boolean': {
          data.set(key, String(DeclaredTypeCoercer.asBoolean(key, value, originFor)));
          break;
        }
        case 'number': {
          data.set(key, String(DeclaredTypeCoercer.asNumber(key, value, originFor)));
          break;
        }
      }
    }
  }

  /**
   * Reads a stored leaf value back out as the type its schema field declares.
   *
   * <p>A key the schema declares as a string is returned verbatim: {@code JSON.parse} would otherwise turn
   * a chart version of {@code 1.0} into the number {@code 1} and a directory of {@code true} into a
   * boolean. Everything else keeps the existing permissive parse, which is what carries nested objects and
   * arrays stored as serialized JSON.
   *
   * <p>Reading is corrected here rather than by re-encoding the stored value, because the value is also
   * served verbatim by {@code asString()} — storing {@code JSON.stringify(value)} would fix this path and
   * give that one back its surrounding quotes.
   *
   * @param configKey - the dotted path of the leaf, as {@code Node.path()} renders it.
   * @param value - the raw stored value.
   */
  public static readLeafValue(configKey: string, value: string | null): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    return EnvironmentAliasRegistry.configLeaves().get(configKey) === 'string' ? value : ReflectAssist.coerce(value);
  }

  private static asBoolean(key: string, value: string, originFor: (configKey: string) => string): boolean {
    switch (value.trim().toLowerCase()) {
      case 'true':
      case '1': {
        return true;
      }
      case 'false':
      case '0': {
        return false;
      }
      default: {
        throw new SoloErrors.validation.configValueTypeMismatch(originFor(key), key, value, 'boolean');
      }
    }
  }

  private static asNumber(key: string, value: string, originFor: (configKey: string) => string): number {
    const parsed: number = Number(value.trim());
    if (value.trim() === '' || !Number.isFinite(parsed)) {
      throw new SoloErrors.validation.configValueTypeMismatch(originFor(key), key, value, 'number');
    }

    return parsed;
  }
}
