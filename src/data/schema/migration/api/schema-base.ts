// SPDX-License-Identifier: Apache-2.0

import {type Schema} from './schema.js';
import {type SchemaMigration} from './schema-migration.js';
import {Version} from '../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../business/utils/class-constructor.type.js';
import {deepClone} from 'deep-clone';
import {type ObjectMapper} from '../../../mapper/api/object-mapper.js';

export abstract class SchemaBase<T> implements Schema<T> {
  public abstract get classCtor(): ClassConstructor<T>;
  public abstract get migrations(): SchemaMigration[];
  public abstract get name(): string;
  public abstract get version(): Version<number>;

  protected constructor(protected readonly mapper: ObjectMapper) {}

  public async transform(data: object, sourceVersion?: Version<number>): Promise<T> {
    if (data === undefined || data === null) {
      return null;
    }

    const clone = deepClone(data);
    let dataVersion: number = clone.schemaVersion;
    if (!dataVersion) {
      dataVersion = sourceVersion ? sourceVersion.value : 0;
    }

    const migrated = await this.applyMigrations(clone, new Version(dataVersion));
    return this.mapper.fromObject(this.classCtor, migrated);
  }

  public async validateMigrations(): Promise<void> {
    if (this.migrations.length === 0) {
      return;
    }

    const versionJumps: number[] = this.migrations.map(value => value.version.value).sort();

    for (let i = 1; i < versionJumps.length; i++) {
      if (versionJumps[i] === versionJumps[i - 1]) {
        throw new Error();
      }
    }

    let currentVersion: Version<number> = this.nextVersionJump(new Version(0));

    for (let i = 0; i < versionJumps.length; i++) {
      const v: Version<number> = new Version(versionJumps[i]);
      if (!v.equals(currentVersion)) {
        throw new Error();
      }

      currentVersion = this.nextVersionJump(currentVersion);
    }

    return;
  }

  protected nextVersionJump(currentVersion: Version<number>): Version<number> {
    const targetMigrations: SchemaMigration[] = this.findMigrations(currentVersion);
    if (!targetMigrations || targetMigrations.length === 0) {
      // No migration found for the current version - fail with an error
      throw new Error();
    }

    return targetMigrations[0].version;
  }

  /*
   * DV < version = 1 >
   * M1 < range = [0, 6), version = 6>
   * M1.1 < range = [0, 4), version = 5>
   * M2 < range = [6, 7), version = 8>
   */
  protected async applyMigrations(data: object, dataVersion: Version<number>): Promise<object> {
    let migrations: SchemaMigration[] = this.findMigrations(dataVersion);

    while (migrations.length > 0) {
      const migration = migrations[0];
      data = await migration.migrate(data);
      dataVersion = migration.version;
      migrations = this.findMigrations(dataVersion);
    }

    return data;
  }

  protected findMigrations(dataVersion: Version<number>): SchemaMigration[] {
    const eligibleMigrations: SchemaMigration[] = this.migrations.filter(value => value.range.contains(dataVersion));

    if (eligibleMigrations.length > 0) {
      eligibleMigrations.sort((l, r) => l.version.compare(r.version) * -1);
    }

    return eligibleMigrations;
  }
}
