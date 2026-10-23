// SPDX-License-Identifier: Apache-2.0

import {ConfigurationError} from '../../configuration/api/configuration-error.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';

/**
 * Registry and property decorators for aliasing a config-schema field to one or more fixed environment
 * variable names, in addition to the generated `SOLO_*` name (see GitHub issue #5058). An alias must be a
 * name the generated one cannot reproduce — never one that merely repeats it.
 *
 * <p>Two kinds, differing in intent rather than resolution:
 * <ul>
 *   <li>{@link alias} — a supported spelling, documented alongside the generated name. Used for the short
 *       `SOLO_FF_*` forms and for the `EXPERIMENTAL_*` name an experimental flag carries.</li>
 *   <li>{@link legacyAlias} — accepted only for backwards compatibility, typically an ad-hoc environment
 *       variable that predates the config field. Never recommend one in docs; it exists so existing CI
 *       jobs and scripts keep working.</li>
 * </ul>
 *
 * <p>The generated `SOLO_*` name always takes precedence; an alias only applies when the generated
 * name is absent (resolution happens in `EnvironmentConfigSource`).
 */
export class EnvironmentAliasRegistry {
  /** Maps a schema prototype to its (propertyKey -> fixed env var names) declared via the decorators. */
  private static readonly fieldAliases: Map<object, Map<string, string[]>> = new Map<object, Map<string, string[]>>();

  /**
   * Names declared via {@link legacyAlias}. Legacy-ness is a property of the name itself, not of the field
   * it targets, so a flat set is enough and needs no rebuild when the root schemas change.
   */
  private static readonly legacyNames: Set<string> = new Set<string>();

  /** Root schema classes whose field tree is walked to build the alias map. */
  private static readonly rootSchemas: Set<ClassConstructor<object>> = new Set<ClassConstructor<object>>();

  /** Memoized `fixed env var name` -> `dotted config key path` (e.g. `tss.readyMaxAttempts`). */
  private static cachedAliasMap: Map<string, string> | undefined;

  /** Memoized `leaf config key path` -> `typeof its schema default` for the registered root schemas. */
  private static cachedConfigLeaves: Map<string, string> | undefined;

  /**
   * Registers one or more supported fixed environment variable names for the annotated field.
   * Usage: `@EnvironmentAliasRegistry.alias('SOLO_FF_SKIP_NODE_PING') public skipNodePing: boolean;`
   */
  public static alias(...names: string[]): PropertyDecorator {
    return EnvironmentAliasRegistry.register(names, false);
  }

  /**
   * Registers one or more environment variable names kept only for backwards compatibility — typically an
   * ad-hoc variable the config field replaced.
   * Usage: `@EnvironmentAliasRegistry.legacyAlias('SKIP_NODE_PING') public skipNodePing: boolean;`
   */
  public static legacyAlias(...names: string[]): PropertyDecorator {
    return EnvironmentAliasRegistry.register(names, true);
  }

  /** True when the name is accepted only for backwards compatibility. */
  public static isLegacy(name: string): boolean {
    return EnvironmentAliasRegistry.legacyNames.has(name);
  }

  /** Records the declared names against the field, accumulating so a field may carry both decorators. */
  private static register(names: string[], legacy: boolean): PropertyDecorator {
    return (target: object, propertyKey: string | symbol): void => {
      let byKey: Map<string, string[]> | undefined = EnvironmentAliasRegistry.fieldAliases.get(target);
      if (!byKey) {
        byKey = new Map<string, string[]>();
        EnvironmentAliasRegistry.fieldAliases.set(target, byKey);
      }

      const key: string = propertyKey.toString();
      byKey.set(key, [...(byKey.get(key) ?? []), ...names]);
      if (legacy) {
        for (const name of names) {
          EnvironmentAliasRegistry.legacyNames.add(name);
        }
      }

      EnvironmentAliasRegistry.invalidate();
    };
  }

  /** Registers a root schema class whose fields (and nested schemas) are scanned for aliases. */
  public static registerRootSchema(rootClass: ClassConstructor<object>): void {
    EnvironmentAliasRegistry.rootSchemas.add(rootClass);
    EnvironmentAliasRegistry.invalidate();
  }

  /** Drops the memoized maps so the next read rebuilds them. */
  private static invalidate(): void {
    EnvironmentAliasRegistry.cachedAliasMap = undefined;
    EnvironmentAliasRegistry.cachedConfigLeaves = undefined;
  }

  /**
   * Clears all registered root schemas and the memoized alias map. Intended for test isolation; the
   * decorator-declared field aliases are left intact (they are registered once at class-load time).
   */
  public static resetRootSchemas(): void {
    EnvironmentAliasRegistry.rootSchemas.clear();
    EnvironmentAliasRegistry.invalidate();
  }

  /**
   * Returns a memoized map of each fixed env var name to the dotted config key path it targets (the
   * same key form the environment backend produces, e.g. `tss.readyMaxAttempts`). Built by walking
   * every registered root schema.
   * @throws ConfigurationError if a single alias would map to more than one config key (i.e. it was
   *   placed on a schema type reused at multiple paths).
   */
  public static aliasMap(): ReadonlyMap<string, string> {
    EnvironmentAliasRegistry.build();
    return EnvironmentAliasRegistry.cachedAliasMap;
  }

  /**
   * Returns every leaf config key path reachable from the registered root schemas, as dotted camelCase
   * (e.g. `helmChart.directory`), mapped to the `typeof` its schema default — the authoritative list of
   * keys the environment can override, and of the type each one expects. A fresh Map is built on each
   * invalidation, so dependents can cache against its identity.
   */
  public static configLeaves(): ReadonlyMap<string, string> {
    EnvironmentAliasRegistry.build();
    return EnvironmentAliasRegistry.cachedConfigLeaves;
  }

  /** Builds and memoizes both derived maps in a single walk of the registered root schemas. */
  private static build(): void {
    if (EnvironmentAliasRegistry.cachedAliasMap && EnvironmentAliasRegistry.cachedConfigLeaves) {
      return;
    }

    const aliases: Map<string, string> = new Map<string, string>();
    const leaves: Map<string, string> = new Map<string, string>();
    for (const rootClass of EnvironmentAliasRegistry.rootSchemas) {
      EnvironmentAliasRegistry.walk(new rootClass(), '', aliases, leaves);
    }

    EnvironmentAliasRegistry.cachedAliasMap = aliases;
    EnvironmentAliasRegistry.cachedConfigLeaves = leaves;
  }

  /**
   * Recursively collects aliases and leaf config paths from a schema instance, building dotted config paths
   * as it descends. Each leaf records the `typeof` of its default, which is the type the schema declares
   * for that field.
   */
  private static walk(
    instance: object,
    prefix: string,
    result: Map<string, string>,
    leaves: Map<string, string>,
  ): void {
    const declaredAliases: Map<string, string[]> | undefined = EnvironmentAliasRegistry.fieldAliases.get(
      Object.getPrototypeOf(instance) as object,
    );
    if (declaredAliases) {
      for (const [key, names] of declaredAliases) {
        const path: string = prefix ? `${prefix}.${key}` : key;
        for (const name of names) {
          const existing: string | undefined = result.get(name);
          if (existing !== undefined && existing !== path) {
            throw new ConfigurationError(
              `Environment alias '${name}' maps to multiple config keys ('${existing}' and ` +
                `'${path}'); an alias must target a uniquely-typed schema field.`,
            );
          }
          result.set(name, path);
        }
      }
    }

    for (const key of Object.keys(instance)) {
      const value: unknown = (instance as Record<string, unknown>)[key];
      const path: string = prefix ? `${prefix}.${key}` : key;
      if (EnvironmentAliasRegistry.isSchemaInstance(value)) {
        EnvironmentAliasRegistry.walk(value, path, result, leaves);
      } else {
        leaves.set(path, typeof value);
      }
    }
  }

  /** True for a nested class instance (a schema) as opposed to a primitive, array, or plain object. */
  private static isSchemaInstance(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && value.constructor !== Object;
  }
}
