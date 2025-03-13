// SPDX-License-Identifier: Apache-2.0

import {type VersionRange} from '../../../business/utils/version-range.js';

/**
 * Represents a schema migration which can be applied to a source object to bring it up to date with the schema version
 * of this migration.
 */
export interface SchemaMigration {
  /**
   * The resulting schema version after the migration.
   */
  readonly version: number;

  /**
   * The range of schema versions which can be migrated by this SchemaMigration instance.
   */
  readonly range: VersionRange<number>;

  /**
   * Migrates the given source object to match the new schema. The source object is not a copy of the original object and
   * care must be taken to ensure that the original object is not modified.
   *
   * @param source - the copy of the source object to migrate.
   * @returns a promise which resolves to the migrated object.
   */
  migrate(source: object): Promise<object>;
}
