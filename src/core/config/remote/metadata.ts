// SPDX-License-Identifier: Apache-2.0

import {Migration} from './migration.js';
import {SoloError} from '../../errors/solo-error.js';
import {type DeploymentName, type EmailAddress, type NamespaceNameAsString, type Version} from './types.js';
import {type Optional, type ToObject, type Validate} from '../../../types/index.js';

import {DeploymentStates} from './enumerations/deployment-states.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type RemoteConfigMetadataStruct} from './interfaces/remote-config-metadata-struct.js';

/**
 * Represent the remote config metadata object and handles:
 * - Validation
 * - Reading
 * - Making a migration
 * - Converting from and to plain object
 */
export class RemoteConfigMetadata
  implements RemoteConfigMetadataStruct, Validate, ToObject<RemoteConfigMetadataStruct>
{
  private _migration?: Migration;

  public constructor(
    public readonly namespace: NamespaceNameAsString,
    public readonly deploymentName: DeploymentName,
    public readonly state: DeploymentStates,
    public readonly lastUpdatedAt: Date,
    public readonly lastUpdateBy: EmailAddress,
    public readonly soloVersion: Version,
    public soloChartVersion: Version = '',
    public hederaPlatformVersion: Version = '',
    public hederaMirrorNodeChartVersion: Version = '',
    public hederaExplorerChartVersion: Version = '',
    public hederaJsonRpcRelayChartVersion: Version = '',
    migration?: Migration,
  ) {
    this._migration = migration;
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Simplifies making a migration */
  public makeMigration(email: EmailAddress, fromVersion: Version): void {
    this._migration = new Migration(new Date(), email, fromVersion);
  }

  /* -------- Getters -------- */

  /** Retrieves the migration if such exists */
  public get migration(): Optional<Migration> {
    return this._migration;
  }

  /* -------- Utilities -------- */

  /** Handles conversion from a plain object to instance */
  public static fromObject(metadata: RemoteConfigMetadataStruct): RemoteConfigMetadata {
    let migration: Optional<Migration> = undefined;

    if (metadata.migration) {
      const {
        migration: {migratedAt, migratedBy, fromVersion},
      } = metadata;
      migration = new Migration(new Date(migratedAt), migratedBy, fromVersion);
    }

    return new RemoteConfigMetadata(
      metadata.namespace,
      metadata.deploymentName,
      metadata.state,
      new Date(metadata.lastUpdatedAt),
      metadata.lastUpdateBy,
      metadata.soloVersion,
      metadata.soloChartVersion,
      metadata.hederaPlatformVersion,
      metadata.hederaMirrorNodeChartVersion,
      metadata.hederaExplorerChartVersion,
      metadata.hederaJsonRpcRelayChartVersion,
      migration,
    );
  }

  public validate(): void {
    if (!this.namespace || !(typeof this.namespace === 'string')) {
      throw new SoloError(
        `Invalid namespace: ${this.namespace}, is type string: ${typeof this.namespace === 'string'}`,
      );
    }

    if (!this.deploymentName || !(typeof this.deploymentName === 'string')) {
      throw new SoloError(
        `Invalid deploymentName: ${this.deploymentName}, is type string: ${typeof this.deploymentName === 'string'}`,
      );
    }

    if (!(this.lastUpdatedAt instanceof Date)) {
      throw new SoloError(`Invalid lastUpdatedAt: ${this.lastUpdatedAt}`);
    }

    if (!this.lastUpdateBy || typeof this.lastUpdateBy !== 'string') {
      throw new SoloError(`Invalid lastUpdateBy: ${this.lastUpdateBy}`);
    }

    if (!this.soloVersion || typeof this.soloVersion !== 'string') {
      throw new SoloError(`Invalid soloVersion: ${this.soloVersion}`);
    }

    if (!isValidEnum(this.state, DeploymentStates)) {
      throw new SoloError(`Invalid cluster state: ${this.state}`);
    }

    if (this.migration && !(this.migration instanceof Migration)) {
      throw new SoloError(`Invalid migration: ${this.migration}`);
    }
  }

  public toObject(): RemoteConfigMetadataStruct {
    const data: RemoteConfigMetadataStruct = {
      namespace: this.namespace,
      deploymentName: this.deploymentName,
      state: this.state,
      lastUpdatedAt: this.lastUpdatedAt,
      lastUpdateBy: this.lastUpdateBy,
      soloChartVersion: this.soloChartVersion,
      hederaPlatformVersion: this.hederaPlatformVersion,
      hederaMirrorNodeChartVersion: this.hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion: this.hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion: this.hederaJsonRpcRelayChartVersion,
      soloVersion: this.soloVersion,
    } as RemoteConfigMetadataStruct;

    if (this.migration) {
      data.migration = this.migration.toObject();
    }

    return data;
  }
}
