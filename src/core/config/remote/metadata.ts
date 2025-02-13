/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Migration} from './migration.js';
import {SoloError} from '../../errors.js';
import * as k8s from '@kubernetes/client-node';
import {
  type EmailAddress,
  type NamespaceNameAsString,
  type RemoteConfigMetadataStructure,
  type Version,
} from './types.js';
import {type Optional, type ToObject, type Validate} from '../../../types/index.js';

/**
 * Represent the remote config metadata object and handles:
 * - Validation
 * - Reading
 * - Making a migration
 * - Converting from and to plain object
 */
export class RemoteConfigMetadata
  implements RemoteConfigMetadataStructure, Validate, ToObject<RemoteConfigMetadataStructure>
{
  private _migration?: Migration;

  public constructor(
    public readonly name: NamespaceNameAsString,
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
  public static fromObject(metadata: RemoteConfigMetadataStructure): RemoteConfigMetadata {
    let migration: Optional<Migration> = undefined;

    if (metadata.migration) {
      const {
        migration: {migratedAt, migratedBy, fromVersion},
      } = metadata;
      migration = new Migration(new Date(migratedAt), migratedBy, fromVersion);
    }

    return new RemoteConfigMetadata(
      metadata.name,
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
    if (!this.name || !(typeof this.name === 'string')) {
      throw new SoloError(`Invalid name: ${this.name}, is type string: ${typeof this.name === 'string'}`);
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

    if (this.migration && !(this.migration instanceof Migration)) {
      throw new SoloError(`Invalid migration: ${this.migration}`);
    }
  }

  public toObject(): RemoteConfigMetadataStructure {
    const data = {
      name: this.name,
      lastUpdatedAt: new k8s.V1MicroTime(this.lastUpdatedAt),
      lastUpdateBy: this.lastUpdateBy,
      soloChartVersion: this.soloChartVersion,
      hederaPlatformVersion: this.hederaPlatformVersion,
      hederaMirrorNodeChartVersion: this.hederaMirrorNodeChartVersion,
      hederaExplorerChartVersion: this.hederaExplorerChartVersion,
      hederaJsonRpcRelayChartVersion: this.hederaJsonRpcRelayChartVersion,
      soloVersion: this.soloVersion,
    } as RemoteConfigMetadataStructure;

    if (this.migration) data.migration = this.migration.toObject() as any;

    return data;
  }
}
