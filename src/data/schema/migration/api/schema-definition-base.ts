// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from './schema-definition.js';
import {type SchemaMigration} from './schema-migration.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';
import {type ClassConstructor} from '../../../../business/utils/class-constructor.type.js';
import {type ObjectMapper} from '../../../mapper/api/object-mapper.js';
import {SchemaValidationError} from './schema-validation-error.js';

export abstract class SchemaDefinitionBase<T> implements SchemaDefinition<T> {
  public abstract get classConstructor(): ClassConstructor<T>;
  public abstract get migrations(): SchemaMigration[];
  public abstract get name(): string;
  public abstract get version(): SemanticVersion<number>;

  protected constructor(protected readonly mapper: ObjectMapper) {}

  public get latestSupportedVersion(): SemanticVersion<number> {
    let latest: SemanticVersion<number> = this.version;
    for (const migration of this.migrations) {
      if (migration.version.compare(latest) > 0) {
        latest = migration.version;
      }
    }
    return latest;
  }

  public async transform(data: object, sourceVersion?: SemanticVersion<number>): Promise<T> {
    if (data === undefined || data === null) {
      return null;
    }

    const clone: any = structuredClone(data);
    let dataVersion: number = clone.schemaVersion;
    if (!dataVersion) {
      dataVersion = sourceVersion ? sourceVersion.major : 0;
    }

    const migrated: object = await this.applyMigrations(clone, new SemanticVersion(dataVersion));
    return this.mapper.fromObject(this.classConstructor, migrated);
  }

  public async validateMigrations(): Promise<void> {
    if (this.migrations.length === 0) {
      return;
    }
    const versionJumps: number[] = this.migrations.map((value): number => value.version.major);
    versionJumps.sort((left: number, right: number): number => left - right);

    for (let index: number = 1; index < versionJumps.length; index++) {
      if (versionJumps[index] === versionJumps[index - 1]) {
        throw new SchemaValidationError(`Duplicate migration version '${versionJumps[index]}'`);
      }
    }

    // A migration which produces data newer than the declared schema version means the declared version was never
    // bumped alongside the migration. Newly created configurations would then be stamped with a stale version and
    // needlessly re-migrated on the next load.
    const newestMigrationVersion: number = versionJumps.at(-1);
    if (newestMigrationVersion > this.version.major) {
      throw new SchemaValidationError(
        `Migration version '${newestMigrationVersion}' is newer than the declared schema version ` +
          `'${this.version.major}'; the declared schema version must be bumped alongside the migration`,
      );
    }

    // Walk the chain from the unversioned form (version zero) and assert that every jump lands exactly on the next
    // registered migration version. The walk stops on the newest migration; looking beyond it would always report a
    // gap because no migration exists to advance past the current schema version.
    let currentVersion: SemanticVersion<number> = new SemanticVersion(0);

    for (const versionJump of versionJumps) {
      const nextVersion: SemanticVersion<number> = this.nextVersionJump(currentVersion);
      if (!nextVersion.equals(new SemanticVersion(versionJump))) {
        throw new SchemaValidationError(
          `Invalid migration version sequence detected; expected version '${versionJump}' but got '${nextVersion.major}'`,
        );
      }

      currentVersion = nextVersion;
    }

    return;
  }

  protected nextVersionJump(currentVersion: SemanticVersion<number>): SemanticVersion<number> {
    const targetMigrations: SchemaMigration[] = this.findMigrations(currentVersion);
    if (!targetMigrations || targetMigrations.length === 0) {
      // No migration found for the current version - fail with an error
      throw new SchemaValidationError(
        `No migration found for version '${currentVersion.major}'; there is a gap in the migration sequence`,
      );
    }

    return targetMigrations[0].version;
  }

  /*
   * DV < version = 1 >
   * M1 < range = [0, 6), version = 6 >
   * M1.1 < range = [0, 4), version = 5 >
   * M2 < range = [6, 7), version = 8 >
   */
  protected async applyMigrations(data: object, dataVersion: SemanticVersion<number>): Promise<object> {
    let migrations: SchemaMigration[] = this.findMigrations(dataVersion);

    while (migrations.length > 0) {
      const migration: SchemaMigration = migrations[0];
      data = await migration.migrate(data);
      dataVersion = migration.version;
      migrations = this.findMigrations(dataVersion);
    }

    return data;
  }

  protected findMigrations(dataVersion: SemanticVersion<number>): SchemaMigration[] {
    const eligibleMigrations: SchemaMigration[] = this.migrations.filter((value): boolean =>
      value.range.contains(dataVersion),
    );

    if (eligibleMigrations.length > 0) {
      eligibleMigrations.sort((l, r): number => l.version.compare(r.version));
    }

    return eligibleMigrations;
  }
}
