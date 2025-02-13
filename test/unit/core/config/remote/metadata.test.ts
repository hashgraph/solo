/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Migration} from '../../../../../src/core/config/remote/migration.js';
import {SoloError} from '../../../../../src/core/errors.js';
import {RemoteConfigMetadata} from '../../../../../src/core/config/remote/metadata.js';
import {
  type EmailAddress,
  type NamespaceNameAsString,
  type Version,
} from '../../../../../src/core/config/remote/types.js';

export function createMetadata() {
  const name: NamespaceNameAsString = 'namespace';
  const lastUpdatedAt: Date = new Date();
  const lastUpdateBy: EmailAddress = 'test@test.test';
  const soloVersion: Version = '0.0.1';
  const migration = new Migration(lastUpdatedAt, lastUpdateBy, '0.0.0');

  return {
    metadata: new RemoteConfigMetadata(name, lastUpdatedAt, lastUpdateBy, soloVersion, migration),
    values: {name, lastUpdatedAt, lastUpdateBy, migration, soloVersion},
    migration,
  };
}

describe('RemoteConfigMetadata', () => {
  it('should be able to create new instance of the class with valid data', () => {
    expect(() => createMetadata()).not.to.throw();
  });

  it('toObject method should return a valid object', () => {
    const {
      metadata,
      migration,
      values: {name, lastUpdatedAt, lastUpdateBy, soloVersion},
    } = createMetadata();

    expect(metadata.toObject()).to.deep.equal({
      name,
      lastUpdatedAt,
      lastUpdateBy,
      soloVersion,
      migration: migration.toObject(),
    });
  });

  it('should successfully create instance using fromObject', () => {
    const {
      metadata,
      values: {name, lastUpdatedAt, lastUpdateBy, soloVersion},
    } = createMetadata();

    // @ts-ignore
    delete metadata._migration;

    const newMetadata = RemoteConfigMetadata.fromObject({
      name,
      lastUpdatedAt,
      lastUpdateBy,
      soloVersion,
    });

    expect(newMetadata.toObject()).to.deep.equal(metadata.toObject());

    expect(() => RemoteConfigMetadata.fromObject(metadata.toObject())).not.to.throw();
  });

  it('should successfully make migration with makeMigration()', () => {
    const {
      metadata,
      values: {lastUpdateBy},
    } = createMetadata();
    const version = '0.0.1';

    metadata.makeMigration(lastUpdateBy, version);

    expect(metadata.migration).to.be.ok;
    expect(metadata.migration.fromVersion).to.equal(version);
    expect(metadata.migration).to.be.instanceof(Migration);
  });

  describe('Values', () => {
    const {
      values: {name, lastUpdatedAt, lastUpdateBy, soloVersion},
    } = createMetadata();

    it('should not be able to create new instance of the class with invalid name', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(null, lastUpdatedAt, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid name: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(1, lastUpdatedAt, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid name: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid lastUpdatedAt', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(name, null, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdatedAt: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(name, 1, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdatedAt: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid lastUpdateBy', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(name, lastUpdatedAt, null, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdateBy: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(name, lastUpdatedAt, 1, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdateBy: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid migration', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(name, lastUpdatedAt, lastUpdateBy, soloVersion, {})).to.throw(
        SoloError,
        `Invalid migration: ${{}}`,
      );
    });
  });
});
