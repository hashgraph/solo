// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema_migration.js';
import {VersionRange} from '../../../../../business/utils/version_range.js';
import {Version} from '../../../../../business/utils/version.js';
import {deepClone} from 'deep-clone';

export class LocalConfigV1Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(0);
  }

  public get version(): Version<number> {
    return new Version(1);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw Error();
    }

    const clone = deepClone(source);

    if (clone.schemaVersion && clone.schemaVersion !== 0) {
      //this case should never happen considering the field was not present in version 0 and should default to zero
      // during this migration
      throw Error();
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
