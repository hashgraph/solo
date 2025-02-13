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
  private readonly _name: NamespaceNameAsString;
  private readonly _lastUpdatedAt: Date;
  private readonly _lastUpdateBy: EmailAddress;
  private readonly _soloVersion: Version;
  private _migration?: Migration;

  public constructor(
    name: NamespaceNameAsString,
    lastUpdatedAt: Date,
    lastUpdateBy: EmailAddress,
    soloVersion: Version,
    migration?: Migration,
  ) {
    this._name = name;
    this._lastUpdatedAt = lastUpdatedAt;
    this._lastUpdateBy = lastUpdateBy;
    this._soloVersion = soloVersion;
    this._migration = migration;
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Simplifies making a migration */
  public makeMigration(email: EmailAddress, fromVersion: Version): void {
    this._migration = new Migration(new Date(), email, fromVersion);
  }

  /* -------- Getters -------- */

  /** Retrieves the namespace */
  public get name(): NamespaceNameAsString {
    return this._name;
  }

  /** Retrieves the date when the remote config metadata was last updated */
  public get lastUpdatedAt(): Date {
    return this._lastUpdatedAt;
  }

  /** Retrieves the email of the user who last updated the remote config metadata */
  public get lastUpdateBy(): EmailAddress {
    return this._lastUpdateBy;
  }

  /** Retrieves the version of solo */
  public get soloVersion(): Version {
    return this._soloVersion;
  }

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
      soloVersion: this.soloVersion,
    } as RemoteConfigMetadataStructure;

    if (this.migration) data.migration = this.migration.toObject() as any;

    return data;
  }
}
