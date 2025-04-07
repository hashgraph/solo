// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Migration} from '../../../../../src/core/config/remote/migration.js';

import {type MigrationStruct} from '../../../../../src/core/config/remote/interfaces/migration-struct.js';

describe('Migration', () => {
  const values: MigrationStruct = {migratedAt: new Date(), migratedBy: 'test@test.test', fromVersion: '1.0.0'};
  let migration: Migration;

  beforeEach(() => {
    migration = new Migration(values.migratedAt, values.migratedBy, values.fromVersion);
  });

  it('toObject method should return a valid object', () => {
    expect(migration.toObject()).to.deep.equal(values);
  });
});
