// SPDX-License-Identifier: Apache-2.0

import {ConfigurationError} from '../../configuration/api/configuration-error.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';

/**
 * Registry and property decorator for aliasing a config-schema field to one or more fixed environment
 * variable names, in addition to the dynamically generated `SOLO_*` name. This eases migration off of
 * the fixed env vars read via `constants.ts` and lets users avoid the awkward hyphenated generated
 * names (see GitHub issue #5058).
 *
 * <p>The generated `SOLO_*` name always takes precedence; an alias only applies when the generated
 * name is absent (resolution happens in `EnvironmentConfigSource`).
 */
export class EnvironmentAliasRegistry {
  /** Maps a schema prototype to its (propertyKey -> fixed env var names) declared via {@link alias}. */
  private static readonly fieldAliases: Map<object, Map<string, string[]>> = new Map<object, Map<string, string[]>>();

  /** Root schema classes whose field tree is walked to build the alias map. */
  private static readonly rootSchemas: Set<ClassConstructor<object>> = new Set<ClassConstructor<object>>();

  /** Memoized `fixed env var name` -> `dotted config key path` (e.g. `tss.readyMaxAttempts`). */
  private static cachedAliasMap: Map<string, string> | undefined;

  /**
   * Property decorator that registers one or more fixed environment variable names for the annotated
   * field. Usage: `@EnvironmentAliasRegistry.alias('SOLO_TSS_READY_MAX_ATTEMPTS') public readyMaxAttempts: number;`
   */
  public static alias(...legacyNames: string[]): PropertyDecorator {
    return (target: object, propertyKey: string | symbol): void => {
      let byKey: Map<string, string[]> | undefined = EnvironmentAliasRegistry.fieldAliases.get(target);
      if (!byKey) {
        byKey = new Map<string, string[]>();
        EnvironmentAliasRegistry.fieldAliases.set(target, byKey);
      }
      byKey.set(propertyKey.toString(), legacyNames);
      EnvironmentAliasRegistry.cachedAliasMap = undefined;
    };
  }

  /** Registers a root schema class whose fields (and nested schemas) are scanned for aliases. */
  public static registerRootSchema(rootClass: ClassConstructor<object>): void {
    EnvironmentAliasRegistry.rootSchemas.add(rootClass);
    EnvironmentAliasRegistry.cachedAliasMap = undefined;
  }

  /**
   * Clears all registered root schemas and the memoized alias map. Intended for test isolation; the
   * decorator-declared field aliases are left intact (they are registered once at class-load time).
   */
  public static resetRootSchemas(): void {
    EnvironmentAliasRegistry.rootSchemas.clear();
    EnvironmentAliasRegistry.cachedAliasMap = undefined;
  }

  /**
   * Returns a memoized map of each fixed env var name to the dotted config key path it targets (the
   * same key form the environment backend produces, e.g. `tss.readyMaxAttempts`). Built by walking
   * every registered root schema.
   * @throws ConfigurationError if a single alias would map to more than one config key (i.e. it was
   *   placed on a schema type reused at multiple paths).
   */
  public static aliasMap(): ReadonlyMap<string, string> {
    if (EnvironmentAliasRegistry.cachedAliasMap) {
      return EnvironmentAliasRegistry.cachedAliasMap;
    }

    const result: Map<string, string> = new Map<string, string>();
    for (const rootClass of EnvironmentAliasRegistry.rootSchemas) {
      EnvironmentAliasRegistry.walk(new rootClass(), '', result);
    }

    EnvironmentAliasRegistry.cachedAliasMap = result;
    return result;
  }

  /** Recursively collects aliases from a schema instance, building dotted config paths as it descends. */
  private static walk(instance: object, prefix: string, result: Map<string, string>): void {
    const declaredAliases: Map<string, string[]> | undefined = EnvironmentAliasRegistry.fieldAliases.get(
      Object.getPrototypeOf(instance) as object,
    );
    if (declaredAliases) {
      for (const [key, legacyNames] of declaredAliases) {
        const path: string = prefix ? `${prefix}.${key}` : key;
        for (const legacyName of legacyNames) {
          const existing: string | undefined = result.get(legacyName);
          if (existing !== undefined && existing !== path) {
            throw new ConfigurationError(
              `Environment alias '${legacyName}' maps to multiple config keys ('${existing}' and ` +
                `'${path}'); an alias must target a uniquely-typed schema field.`,
            );
          }
          result.set(legacyName, path);
        }
      }
    }

    for (const key of Object.keys(instance)) {
      const value: unknown = (instance as Record<string, unknown>)[key];
      if (EnvironmentAliasRegistry.isSchemaInstance(value)) {
        EnvironmentAliasRegistry.walk(value, prefix ? `${prefix}.${key}` : key, result);
      }
    }
  }

  /** True for a nested class instance (a schema) as opposed to a primitive, array, or plain object. */
  private static isSchemaInstance(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && value.constructor !== Object;
  }
}
