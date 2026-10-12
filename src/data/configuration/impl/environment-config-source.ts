// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {LayeredConfigSource} from './layered-config-source.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {EnvironmentAliasRegistry} from '../../schema/decorators/environment-alias-registry.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are converted from strings using the JSON parser.
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

  public constructor(mapper: ObjectMapper, prefix?: string) {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend(prefix);
    super(backend, mapper, prefix);
    this.environmentBackend = backend;
    this.data = new Map<string, string>();
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
    this.forest = undefined;

    const variables: string[] = await this.backend.list();
    for (const k of variables) {
      try {
        const va: Buffer = await this.backend.readBytes(k);
        this.data.set(k, va.toString('utf8'));
      } catch (error) {
        throw new ConfigurationError(`Failed to read environment variable: ${k}`, error);
      }
    }

    this.applyAliases();
    this.rejectEnvironmentOverrides();

    this.forest = Forest.from(this.data);
  }

  /**
   * Config key prefixes that may never be sourced from the environment.
   *
   * `subprocess.*` controls which environment variables Solo forwards to external commands. A
   * setting that relaxes environment filtering must not itself be settable from the environment
   * being filtered — otherwise `SOLO_SUBPROCESS_ADDITIONAL-ENVIRONMENT-VARIABLES=LD_PRELOAD`
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
   * Applies fixed/legacy environment variable aliases.
   * The generated `SOLO_*` name always wins,
   * so an alias is only used when its canonical key
   * was not already set from a generated name.
   */
  private applyAliases(): void {
    for (const [legacyName, canonicalKey] of EnvironmentAliasRegistry.aliasMap()) {
      if (this.data.has(canonicalKey)) {
        continue;
      }

      const value: string | undefined = this.environmentBackend.readRawValue(legacyName);
      if (value === undefined) {
        continue;
      }

      this.data.set(canonicalKey, value);

      console.warn(
        `Using environment variable alias '${legacyName}' for config key '${canonicalKey}'; ` +
          'the generated SOLO_* name takes precedence when both are set.',
      );
    }
  }
}
