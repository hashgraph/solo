// SPDX-License-Identifier: Apache-2.0

import {SchemaMigrationError} from './schema-migration-error.js';

export class InvalidSchemaVersionError extends SchemaMigrationError {
  public constructor(version: number, expected?: number) {
    super(
      expected
        ? `Invalid schema version '${version}'; expected version '${expected}'`
        : `Invalid schema version '${version}'`,
    );
  }
}
