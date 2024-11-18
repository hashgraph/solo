/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { Migration } from './migration.ts'
import { SoloError } from '../../errors.ts'
import * as k8s from '@kubernetes/client-node'
import type { EmailAddress, Namespace, RemoteConfigMetadataStructure, Version } from './types.ts'
import type { Optional, ToObject, Validate } from '../../../types/index.ts'

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
  private readonly _name: Namespace
  private readonly _lastUpdatedAt: Date
  private readonly _lastUpdateBy: EmailAddress
  private _migration?: Migration

  public constructor (name: Namespace, lastUpdatedAt: Date, lastUpdateBy: EmailAddress, migration?: Migration) {
    this._name = name
    this._lastUpdatedAt = lastUpdatedAt
    this._lastUpdateBy = lastUpdateBy
    this._migration = migration
    this.validate()
  }

  /* -------- Modifiers -------- */

  /** Simplifies making a migration */
  public makeMigration (email: EmailAddress, fromVersion: Version): void {
    this._migration = new Migration(new Date(), email, fromVersion)
  }

  /* -------- Getters -------- */

  /** Retrieves the namespace */
  public get name (): Namespace  { return this._name }

  /** Retrieves the date when the remote config metadata was last updated */
  public get lastUpdatedAt (): Date { return this._lastUpdatedAt }

  /** Retrieves the email of the user who last updated the remote config metadata */
  public get lastUpdateBy (): EmailAddress { return this._lastUpdateBy }

  /** Retrieves the migration if such exists */
  public get migration (): Optional<Migration> { return this._migration }

  /* -------- Utilities -------- */

  /** Handles conversion from plain object to instance */
  public static fromObject (metadata: RemoteConfigMetadataStructure): RemoteConfigMetadata {
    let migration: Optional<Migration> = undefined

    if (metadata.migration) {
      const { migration: { migratedAt, migratedBy, fromVersion } } = metadata
      migration = new Migration(new Date(migratedAt), migratedBy, fromVersion)
    }

    return new RemoteConfigMetadata(
      metadata.name,
      new Date(metadata.lastUpdatedAt),
      metadata.lastUpdateBy,
        migration
      )
  }

  public validate (): void {
    if (!this.name || typeof this.name !== 'string') {
      throw new SoloError(`Invalid name: ${this.name}`)
    }

    if (!(this.lastUpdatedAt instanceof Date)) {
      throw new SoloError(`Invalid lastUpdatedAt: ${this.lastUpdatedAt}`)
    }

    if (!this.lastUpdateBy || typeof this.lastUpdateBy !== 'string') {
      throw new SoloError(`Invalid lastUpdateBy: ${this.lastUpdateBy}`)
    }

    if (this.migration && !(this.migration instanceof Migration)) {
      throw new SoloError(`Invalid migration: ${this.migration}`)
    }
  }

  public toObject (): RemoteConfigMetadataStructure {
    const data = {
      name: this.name,
      lastUpdatedAt: new k8s.V1MicroTime(this.lastUpdatedAt),
      lastUpdateBy: this.lastUpdateBy,
    } as RemoteConfigMetadataStructure

    if (this.migration) data.migration = this.migration.toObject() as any

    return data
  }
}
