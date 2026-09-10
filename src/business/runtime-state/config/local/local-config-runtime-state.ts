// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../core/errors/solo-errors.js';
import {IncompleteLocalConfigError} from '../../../../core/errors/classes/config/incomplete-local-config-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {LocalConfigSource} from '../../../../data/configuration/impl/local-config-source.js';
import {YamlFileStorageBackend} from '../../../../data/backend/impl/yaml-file-storage-backend.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {ClassToObjectMapper} from '../../../../data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../data/key/config-key-formatter.js';
import {LocalConfigSchemaDefinition} from '../../../../data/schema/migration/impl/local/local-config-schema-definition.js';
import {LocalConfigSchema} from '../../../../data/schema/model/local/local-config-schema.js';
import {PathEx} from '../../../utils/path-ex.js';
import fs, {existsSync, mkdirSync} from 'node:fs';
import {LocalConfig} from './local-config.js';
import path from 'node:path';
import {Templates} from '../../../../core/templates.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {Flags as flags} from '../../../../commands/flags.js';

@injectable()
export class LocalConfigRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: YamlFileStorageBackend;
  private readonly objectMapper: ObjectMapper;
  public isLoaded: boolean = false;

  private _localConfig: LocalConfig;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.backend = new YamlFileStorageBackend(this.basePath);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new LocalConfigSource(
      fileName,
      new LocalConfigSchemaDefinition(this.objectMapper),
      this.objectMapper,
      this.backend,
      LocalConfigSchema.EMPTY,
    );
  }

  public get configuration(): LocalConfig {
    if (!this.isLoaded) {
      throw new Error('configuration: Local configuration is not loaded yet. Please call load() first.');
    }

    return this._localConfig;
  }

  // Loads the source data and writes it back in case of migrations.
  public async load(): Promise<void> {
    // TODO this needs to be a migration, not a load
    // Stage a legacy config (from the old cache path) at the current path without deleting the legacy
    // file yet, so validation can run before the legacy copy is retired.
    const legacyConfigFile: string = PathEx.join(this.basePath, 'cache', this.fileName);
    const legacyMigrationPending: boolean = this.stageLegacyLocalConfig(legacyConfigFile);

    this.refresh();
    if (!this.configFileExists()) {
      return await this.persist();
    }

    const configFilePath: string = PathEx.join(this.basePath, this.fileName);
    try {
      await this.assertConfigFileComplete(configFilePath);
      await this.source.refresh();
      this.refresh();
    } catch (error) {
      if (legacyMigrationPending) {
        // A legacy config failed validation (unparseable or incomplete): discard the corrupt copy and
        // keep the legacy file in place so nothing is lost, then surface an actionable error naming it.
        this.removeFileSafely(configFilePath);
        throw new SoloErrors.config.migrateLegacyLocalConfig(error, legacyConfigFile);
      }
      if (error instanceof IncompleteLocalConfigError) {
        throw error;
      }
      throw new SoloErrors.config.refreshLocalConfigSource(configFilePath, error);
    }
    await this.persist();

    if (legacyMigrationPending) {
      // Validated and persisted (unknown fields pruned by the mapper): retire the legacy file.
      this.removeFileSafely(legacyConfigFile);
      this.logger?.warn(
        `Migrated legacy local configuration from ${legacyConfigFile} to ${PathEx.join(this.basePath, this.fileName)}`,
      );
    }

    await this.migrateCacheDirectories();
    this.isLoaded = true;
  }

  /**
   * Moves the unloadable config file aside to `<file>.invalid` so a fresh config can be regenerated
   * without destroying the original, keeping a failed import retry-able and manual repair possible.
   * @returns the path the original file was moved to
   */
  public backupInvalidConfigFile(): string {
    const configFilePath: string = PathEx.join(this.basePath, this.fileName);
    const backupFilePath: string = `${configFilePath}.invalid`;
    fs.renameSync(configFilePath, backupFilePath);
    return backupFilePath;
  }

  // Every schema version of the local config, including legacy pre-schemaVersion files, carries these keys.
  private static readonly REQUIRED_TOP_LEVEL_KEYS: string[] = ['clusterRefs', 'deployments'];

  /**
   * Rejects a config file that parses as YAML but is missing required top-level keys, so a partial
   * file (interrupted write, manual edit) fails fast instead of silently loading as an empty config.
   */
  private async assertConfigFileComplete(configFilePath: string): Promise<void> {
    const rawConfig: object = await this.backend.readObject(this.fileName);
    const isRecord: boolean = typeof rawConfig === 'object' && rawConfig !== null && !Array.isArray(rawConfig);
    const missingKeys: string[] = isRecord
      ? LocalConfigRuntimeState.REQUIRED_TOP_LEVEL_KEYS.filter((key: string): boolean => !(key in rawConfig))
      : LocalConfigRuntimeState.REQUIRED_TOP_LEVEL_KEYS;
    if (missingKeys.length > 0) {
      throw new SoloErrors.config.incompleteLocalConfig(configFilePath, missingKeys);
    }
  }

  /**
   * Stages a legacy local config (from the old cache path) at the current path without deleting the
   * legacy file, so it can be validated before the legacy copy is retired. Returns true when a legacy
   * file was copied and is awaiting validation; false when there is nothing to migrate or a current
   * config already exists (in which case the redundant legacy file is removed).
   */
  private stageLegacyLocalConfig(legacyConfigFile: string): boolean {
    if (!existsSync(legacyConfigFile)) {
      return false;
    }

    // A current config already exists: the legacy copy is redundant — remove it, keep the current one.
    if (this.configFileExists()) {
      this.removeFileSafely(legacyConfigFile);
      return false;
    }

    try {
      mkdirSync(this.basePath, {recursive: true});
      fs.copyFileSync(legacyConfigFile, PathEx.join(this.basePath, this.fileName));
    } catch (error) {
      throw new SoloErrors.config.migrateLegacyLocalConfig(error, legacyConfigFile);
    }
    return true;
  }

  /** Removes a file if it exists, wrapping any filesystem failure in a typed error. */
  private removeFileSafely(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        fs.rmSync(filePath);
      }
    } catch (error) {
      throw new SoloErrors.config.migrateLegacyLocalConfig(error, filePath);
    }
  }

  /**
   * Migrates the cache directories to the new structure.
   * It will look for directories in the format 'v0.58/staging/v0.58.10' and move them to current staging directory.
   */
  private async migrateCacheDirectories(): Promise<void> {
    if (!this.isLoaded) {
      throw new Error('migrateCacheDirectories: Local configuration is not loaded yet. Please call load() first.');
    }
    const cacheDirectory: string = PathEx.join(this.basePath, 'cache').toString();
    const releaseTag: string = this.configManager.getFlag(flags.consensusNodeVersion);
    const currentStagingDirectory: string = Templates.renderStagingDir(cacheDirectory, releaseTag);

    if (fs.existsSync(currentStagingDirectory)) {
      return;
    }

    // migrate the staging directory if it exists
    const foundStagingDirectory: string[] = await this.findMatchingSoloCacheDirectories(
      PathEx.join(this.basePath, 'cache').toString(),
    );
    if (foundStagingDirectory && foundStagingDirectory.length > 0) {
      for (const stagingDirectory of foundStagingDirectory) {
        // Guard against accidental self-copy when the discovered path already points to
        // the current release staging directory.
        if (stagingDirectory === currentStagingDirectory) {
          continue;
        }
        // Keep source staging directories intact to avoid deleting another command's active staging path
        // when multiple commands run concurrently (for example one-shot parallel subcommands).
        fs.cpSync(stagingDirectory, currentStagingDirectory, {recursive: true, force: true});
      }
    }
  }

  private async findMatchingSoloCacheDirectories(baseDirectory: string): Promise<string[]> {
    if (!this.isLoaded) {
      throw new Error(
        'findMatchingSoloCacheDirectories: Local configuration is not loaded yet. Please call load() first.',
      );
    }
    // Regex to match directory names like 'v0.58' or 'v0.60'
    // This will capture the version number.
    const versionDirectionRegex: RegExp = /^v(\d+\.\d+)$/;

    // Regex to match the full path structure like 'v0.58/staging/v0.58.10'
    // This captures the major.minor version and the patch version.
    const fullPathRegex: RegExp = /^v(\d+\.\d+)\/staging\/v(\d+\.\d+\.\d+)$/;
    const matchingDirectories: string[] = [];

    try {
      // 1. Read the contents of the baseCacheDir (e.g., '.solo/cache/')
      const versionDirectories: string[] = fs.readdirSync(baseDirectory);

      for (const versionDirectory of versionDirectories) {
        const versionMatch: string[] | null = versionDirectory.match(versionDirectionRegex);
        if (versionMatch) {
          // If the version directory matches (e.g., 'v0.58')
          const fullVersionPath: string = PathEx.join(baseDirectory, versionDirectory, 'staging');

          // Check if 'staging' directory exists within the version directory
          if (fs.existsSync(fullVersionPath)) {
            // Read the contents of the 'staging' directory
            const stagingContents: string[] = fs.readdirSync(fullVersionPath);

            for (const stagingItem of stagingContents) {
              const fullItemPath: string = PathEx.join(fullVersionPath, stagingItem);
              const relativeItemPath: string = path.relative(baseDirectory, fullItemPath); // Get path relative to baseCacheDir

              // Check if the full relative path matches the desired pattern
              if (fullPathRegex.test(relativeItemPath) && fs.existsSync(fullItemPath)) {
                matchingDirectories.push(fullItemPath);
              }
            }
          }
        }
      }
    } catch {
      // The Directory isn't found or any other error
      return undefined;
    }
    return matchingDirectories;
  }

  public async persist(): Promise<void> {
    try {
      await this.source.persist();
      this.isLoaded = true;
    } catch (error) {
      throw new SoloErrors.config.writeLocalConfig(error);
    }
  }

  private refresh(): void {
    this._localConfig = new LocalConfig(this.source.modelData);
  }

  public configFileExists(): boolean {
    try {
      return fs.existsSync(PathEx.join(this.basePath, this.fileName));
    } catch {
      return false;
    }
  }
}
