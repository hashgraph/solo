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
  const namespace: NamespaceNameAsString = 'namespace';
  const deploymentName = 'kind-namespace';
  const lastUpdatedAt: Date = new Date();
  const lastUpdateBy: EmailAddress = 'test@test.test';
  const soloVersion: Version = '0.0.1';
  const migration = new Migration(lastUpdatedAt, lastUpdateBy, '0.0.0');
  const soloChartVersion = '';
  const hederaPlatformVersion = '';
  const hederaMirrorNodeChartVersion = '';
  const hederaExplorerChartVersion = '';
  const hederaJsonRpcRelayChartVersion = '';

  return {
    metadata: new RemoteConfigMetadata(
      namespace,
      deploymentName,
      lastUpdatedAt,
      lastUpdateBy,
      soloVersion,
      '',
      '',
      '',
      '',
      '',
      migration,
    ),
    values: {
      namespace,
      deploymentName,
      lastUpdatedAt,
      lastUpdateBy,
      migration,
      soloVersion,
      soloChartVersion,
      hederaPlatformVersion,
      hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion,
    },
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
      values: {
        namespace,
        deploymentName,
        lastUpdatedAt,
        lastUpdateBy,
        soloVersion,
        soloChartVersion,
        hederaPlatformVersion,
        hederaMirrorNodeChartVersion,
        hederaExplorerChartVersion,
        hederaJsonRpcRelayChartVersion,
      },
    } = createMetadata();

    expect(metadata.toObject()).to.deep.equal({
      namespace,
      deploymentName,
      lastUpdatedAt,
      lastUpdateBy,
      soloVersion,
      soloChartVersion,
      hederaPlatformVersion,
      hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion,
      migration: migration.toObject(),
    });
  });

  it('should successfully create instance using fromObject', () => {
    const {
      metadata,
      values: {namespace, deploymentName, lastUpdatedAt, lastUpdateBy, soloVersion},
    } = createMetadata();

    // @ts-ignore
    delete metadata._migration;

    const newMetadata = RemoteConfigMetadata.fromObject({
      namespace,
      deploymentName,
      lastUpdatedAt,
      lastUpdateBy,
      soloVersion,
      soloChartVersion: '',
      hederaPlatformVersion: '',
      hederaMirrorNodeChartVersion: '',
      hederaExplorerChartVersion: '',
      hederaJsonRpcRelayChartVersion: '',
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
      values: {namespace, deploymentName, lastUpdatedAt, lastUpdateBy, soloVersion},
    } = createMetadata();

    it('should not be able to create new instance of the class with invalid name', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(null, deploymentName, lastUpdatedAt, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid namespace: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(1, deploymentName, lastUpdatedAt, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid namespace: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid lastUpdatedAt', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(namespace, deploymentName, null, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdatedAt: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(namespace, deploymentName, 1, lastUpdateBy, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdatedAt: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid lastUpdateBy', () => {
      // @ts-ignore
      expect(() => new RemoteConfigMetadata(namespace, deploymentName, lastUpdatedAt, null, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdateBy: ${null}`,
      );

      // @ts-ignore
      expect(() => new RemoteConfigMetadata(namespace, deploymentName, lastUpdatedAt, 1, soloVersion)).to.throw(
        SoloError,
        `Invalid lastUpdateBy: ${1}`,
      );
    });

    it('should not be able to create new instance of the class with invalid migration', () => {
      expect(
        () =>
          new RemoteConfigMetadata(
            namespace,
            deploymentName,
            lastUpdatedAt,
            lastUpdateBy,
            soloVersion,
            '',
            '',
            '',
            '',
            '',
            // @ts-ignore
            {},
          ),
      ).to.throw(SoloError, `Invalid migration: ${{}}`);
    });
  });
});
