// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {LayeredConfigSource} from './layered-config-source.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {EnvironmentAliasRegistry} from '../../schema/decorators/environment-alias-registry.js';
import {DeclaredTypeCoercer} from '../../key/declared-type-coercer.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are normalized against the type the schema declares, and rejected when the value
 * cannot be read as that type.
 * Objects, arrays of objects, and arrays of primitives are assumed to be stored as serialized JSON strings.
 */
export class EnvironmentConfigSource extends LayeredConfigSource implements ConfigSource, Refreshable {
  /**
   * The data read from the environment.
   * @private
   */
  private readonly data: Map<string, string>;

  /** Typed reference to the backend for reading fixed/legacy env var aliases verbatim. */
  private readonly environmentBackend: EnvironmentStorageBackend;

  /** Config key -> the environment variable name that supplied it, so errors can name what the user set. */
  private readonly sourceNames: Map<string, string>;

  public constructor(mapper: ObjectMapper, prefix?: string) {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend(prefix);
    super(backend, mapper, prefix);
    this.environmentBackend = backend;
    this.data = new Map<string, string>();
    this.sourceNames = new Map<string, string>();
  }

  public get name(): string {
    return 'EnvironmentConfigSource';
  }

  public get ordinal(): number {
    return 100;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }

  public async load(): Promise<void> {
    this.data.clear();
    this.sourceNames.clear();
    this.forest = undefined;

    const configKeys: string[] = await this.backend.list();
    for (const configKey of configKeys) {
      const variableName: string = this.environmentBackend.variableNameFor(configKey);
      try {
        const value: Buffer = await this.backend.readBytes(configKey);
        this.data.set(configKey, value.toString('utf8'));
        this.sourceNames.set(configKey, variableName);
      } catch (error) {
        throw new ConfigurationError(`Failed to read environment variable: ${variableName}`, error);
      }
    }

    this.applyAliases();
    this.rejectEnvironmentOverrides();
    this.coerceToDeclaredTypes();

    this.forest = Forest.from(this.data);
  }

  /**
   * Config key prefixes that may never be sourced from the environment.
   *
   * `subprocess.*` controls which environment variables Solo forwards to external commands. A
   * setting that relaxes environment filtering must not itself be settable from the environment
   * being filtered — otherwise `SOLO_SUBPROCESS_ADDITIONAL_ENVIRONMENT_VARIABLES=LD_PRELOAD`
   * would let anything that can set a variable switch the filter off using the filter's own
   * configuration. It is configurable from the config file only.
   */
  private static readonly ENVIRONMENT_OVERRIDE_FORBIDDEN_PREFIXES: readonly string[] = ['subprocess.'];

  /**
   * Drops any loaded key under a forbidden prefix, warning so the attempt is visible rather than
   * silently ignored.
   */
  private rejectEnvironmentOverrides(): void {
    const forbiddenKeys: string[] = [...this.data.keys()].filter((key: string): boolean =>
      EnvironmentConfigSource.ENVIRONMENT_OVERRIDE_FORBIDDEN_PREFIXES.some((prefix: string): boolean =>
        key.toLowerCase().startsWith(prefix),
      ),
    );
    for (const key of forbiddenKeys) {
      this.data.delete(key);
      console.warn(
        `Ignoring environment override for config key '${key}': this setting controls environment ` +
          'filtering for external commands and can only be set in the Solo config file.',
      );
    }
  }

  /**
   * Applies fixed environment variable aliases, in descending precedence: the generated `SOLO_*` name,
   * then supported aliases, then legacy ones. An alias is used only when nothing higher has already set
   * its canonical key.
   */
  private applyAliases(): void {
    const aliases: [string, string][] = [...EnvironmentAliasRegistry.aliasMap()];

    // Ordered explicitly rather than relying on declaration order: property decorators evaluate bottom-up,
    // so a field's legacy alias would otherwise be registered before the supported one above it and win.
    const ordered: [string, string][] = [
      ...aliases.filter(([name]: [string, string]): boolean => !EnvironmentAliasRegistry.isLegacy(name)),
      ...aliases.filter(([name]: [string, string]): boolean => EnvironmentAliasRegistry.isLegacy(name)),
    ];

    const generatedKeys: Set<string> = new Set<string>(this.data.keys());

    for (const [name, canonicalKey] of ordered) {
      const value: string | undefined = this.environmentBackend.readRawValue(name);
      if (value === undefined) {
        continue;
      }

      // Aliases are a supported, documented spelling — routine use is not worth a warning. Only the
      // ambiguous case earns one: two spellings set at once, with the higher-precedence one silently
      // winning. Warning unconditionally would put a console.warn (which bypasses SoloLogger and
      // SOLO_SILENT_MODE) into every CI run, since CI sets ENABLE_IMAGE_CACHE and
      // DISABLE_IMPORTER_SPRING_PROFILES.
      if (this.data.has(canonicalKey)) {
        const winner: string = generatedKeys.has(canonicalKey) ? 'the generated name' : 'a higher-precedence alias';
        console.warn(
          `Environment variable '${name}' is ignored because ${winner} for config key ` +
            `'${canonicalKey}' is also set and takes precedence.`,
        );
        continue;
      }

      this.data.set(canonicalKey, value);
      this.sourceNames.set(canonicalKey, name);
    }
  }

  /**
   * Normalises each value against the type its schema field declares, naming the environment variable the
   * user actually set when a value is rejected. The rule itself is shared with the file sources, so a flag
   * cannot mean one thing in the environment and another in `solo-config.yaml`.
   */
  private coerceToDeclaredTypes(): void {
    DeclaredTypeCoercer.coerce(this.data, (key: string): string => `Environment variable ${this.sourceNames.get(key)}`);
  }
}
