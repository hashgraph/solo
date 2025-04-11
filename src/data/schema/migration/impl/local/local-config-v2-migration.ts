// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';
import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';

// Adds `realm` and `shard` to every deployment
export class LocalConfigV2Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(1);
  }

  public get version(): Version<number> {
    return new Version(2);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    const clone: any = structuredClone(source);

    if (clone.schemaVersion !== 1) {
      throw new InvalidSchemaVersionError(clone.schemaVersion, 0);
    }

    // Migrate the deployments to an array
    const mdeps: object[] = [];
    for (const k in clone.deployments) {
      const d = clone.deployments[k];
      d.realm = d.realm ? d.realm : 0;
      d.shard = d.shard ? d.shard : 0;
      mdeps.push(d);
    }
    clone.deployments = mdeps;

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
