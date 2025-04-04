// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Migration} from '../../../../../src/core/config/remote/migration.js';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';
import {RemoteConfigMetadata} from '../../../../../src/core/config/remote/metadata.js';
import {type EmailAddress, type RemoteConfigMetadataStructure} from '../../../../../src/core/config/remote/types.js';
import {DeploymentStates} from '../../../../../src/core/config/remote/enumerations/deployment-states.js';

interface MetadataTestStructure {
  metadata: RemoteConfigMetadata;
  migration: Migration;
  values: RemoteConfigMetadataStructure;
}

export function createMetadata(): MetadataTestStructure {
  const lastUpdatedAt: Date = new Date();
  const lastUpdateBy: EmailAddress = 'test@test.test';

  const values: RemoteConfigMetadataStructure = {
    namespace: 'namespace',
    deploymentName: 'kind-namespace',
    state: DeploymentStates.PRE_GENESIS,
    soloVersion: '0.0.1',
    migration: new Migration(lastUpdatedAt, lastUpdateBy, '0.0.0'),
    lastUpdatedAt,
    lastUpdateBy,
    soloChartVersion: '1.0.0',
    hederaPlatformVersion: '1.0.0',
    hederaMirrorNodeChartVersion: '1.0.0',
    hederaExplorerChartVersion: '1.0.0',
    hederaJsonRpcRelayChartVersion: '1.0.0',
  };

  return {
    metadata: new RemoteConfigMetadata(
      values.namespace,
      values.deploymentName,
      values.state,
      values.lastUpdatedAt,
      values.lastUpdateBy,
      values.soloVersion,
      values.soloChartVersion,
      values.hederaPlatformVersion,
      values.hederaMirrorNodeChartVersion,
      values.hederaExplorerChartVersion,
      values.hederaJsonRpcRelayChartVersion,
      values.migration as Migration,
    ),
    migration: values.migration as Migration,
    values,
  };
}

describe('RemoteConfigMetadata', () => {
  it('should be able to create new instance of the class with valid data', () => {
    expect(() => createMetadata()).not.to.throw();
  });

  it('toObject method should return a valid object', () => {
    const {metadata, migration, values} = createMetadata();

    expect(metadata.toObject()).to.deep.equal({
      namespace: values.namespace,
      deploymentName: values.deploymentName,
      state: values.state,
      lastUpdatedAt: values.lastUpdatedAt,
      lastUpdateBy: values.lastUpdateBy,
      soloVersion: values.soloVersion,
      soloChartVersion: values.soloChartVersion,
      hederaPlatformVersion: values.hederaPlatformVersion,
      hederaMirrorNodeChartVersion: values.hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion: values.hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion: values.hederaJsonRpcRelayChartVersion,
      migration: (migration as Migration).toObject(),
    });
  });

  it('should successfully create instance using fromObject', () => {
    const {metadata, values} = createMetadata();

    // @ts-expect-error - TS234: to access private property
    delete metadata._migration;

    const newMetadata: RemoteConfigMetadata = RemoteConfigMetadata.fromObject({
      namespace: values.namespace,
      deploymentName: values.deploymentName,
      state: values.state,
      lastUpdatedAt: values.lastUpdatedAt,
      lastUpdateBy: values.lastUpdateBy,
      soloVersion: values.soloVersion,
      soloChartVersion: values.soloChartVersion,
      hederaPlatformVersion: values.hederaPlatformVersion,
      hederaMirrorNodeChartVersion: values.hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion: values.hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion: values.hederaJsonRpcRelayChartVersion,
    });

    expect(newMetadata.toObject()).to.deep.equal(metadata.toObject());

    expect(() => RemoteConfigMetadata.fromObject(metadata.toObject())).not.to.throw();
  });

  it('should successfully make migration with makeMigration()', () => {
    const {
      metadata,
      values: {lastUpdateBy},
    } = createMetadata();
    const version: string = '0.0.1';

    metadata.makeMigration(lastUpdateBy, version);

    expect(metadata.migration).to.be.ok;
    expect(metadata.migration.fromVersion).to.equal(version);
    expect(metadata.migration).to.be.instanceof(Migration);
  });

  describe('Values', () => {
    const {values} = createMetadata();

    it('should not be able to create new instance of the class with invalid migration', () => {
      expect(
        () =>
          new RemoteConfigMetadata(
            values.namespace,
            values.deploymentName,
            values.state,
            values.lastUpdatedAt,
            values.lastUpdateBy,
            values.soloVersion,
            values.soloChartVersion,
            values.hederaPlatformVersion,
            values.hederaMirrorNodeChartVersion,
            values.hederaExplorerChartVersion,
            values.hederaJsonRpcRelayChartVersion,
            // @ts-expect-error - TS2345: to inject wrong migration
            {},
          ),
      ).to.throw(SoloError, `Invalid migration: ${{}}`);
    });
  });
});
