// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Migration} from '../../../../../src/core/config/remote/migration.js';
import {type EmailAddress, type Version} from '../../../../../src/core/config/remote/types.js';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';

function createMigration() {
  const migratedAt = new Date();
  const migratedBy = 'test@test.test' as EmailAddress;
  const fromVersion = '1.0.0' as Version;

  return {
    migration: new Migration(migratedAt, migratedBy, fromVersion),
    values: {migratedAt, migratedBy, fromVersion},
  };
}
describe('Migration', () => {
  it('should be able to create new instance of the class with valid data', () => {
    expect(() => createMigration()).not.to.throw();
  });

  it('toObject method should return a valid object', () => {
    const {migration, values} = createMigration();

    expect(migration.toObject()).to.deep.equal(values);
  });

  describe('Values', () => {
    const migratedAt = new Date();
    const migratedBy = 'test@test.test' as EmailAddress;
    const fromVersion = '1.0.0' as Version;

    it('should not be able to create new instance of the class with invalid migratedAt', () => {
      // @ts-ignore
      expect(() => new Migration(null, migratedBy, fromVersion)).to.throw(SoloError, `Invalid migratedAt: ${null}`);

      // @ts-ignore
      expect(() => new Migration(1, migratedBy, fromVersion)).to.throw(SoloError, `Invalid migratedAt: ${1}`);
    });

    it('should not be able to create new instance of the class with invalid migratedBy', () => {
      // @ts-ignore
      expect(() => new Migration(migratedAt, null, fromVersion)).to.throw(SoloError, `Invalid migratedBy: ${null}`);

      // @ts-ignore
      expect(() => new Migration(migratedAt, 1, fromVersion)).to.throw(SoloError, `Invalid migratedBy: ${1}`);
    });

    it('should not be able to create new instance of the class with invalid fromVersion', () => {
      // @ts-ignore
      expect(() => new Migration(migratedAt, migratedBy, null)).to.throw(SoloError, `Invalid fromVersion: ${null}`);

      // @ts-ignore
      expect(() => new Migration(migratedAt, migratedBy, 1)).to.throw(SoloError, `Invalid fromVersion: ${1}`);
    });
  });
});
