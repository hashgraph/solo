// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';

export class RemoteConfigV1Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(0);
  }

  public get version(): Version<number> {
    return new Version(1);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    const clone: any = structuredClone(source);

    // TODO implement the migration

    if (clone.schemaVersion && clone.schemaVersion !== 0) {
      // this case should never happen considering the field was not present in version 0 and should default to zero
      // during this migration
      throw new InvalidSchemaVersionError(clone.schemaVersion, 0);
    }

    return clone;
  }
}
