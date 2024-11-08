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

export class RemoteConfigMetadata implements RemoteConfigMetadataStructure {
  public readonly _name: Namespace
  public readonly _lastUpdatedAt: Date
  public readonly _lastUpdateBy: EmailAddress
  public _migration?: Migration

  constructor (name: Namespace, lastUpdatedAt: Date, lastUpdateBy: EmailAddress, migration?: Migration) {
    this._name = name
    this._lastUpdatedAt = lastUpdatedAt
    this._lastUpdateBy = lastUpdateBy
    this._migration = migration
    this.validate()
  }

  get name () { return this._name }
  get lastUpdatedAt () { return this._lastUpdatedAt }
  get lastUpdateBy () { return this._lastUpdateBy }
  get migration () { return this._migration }

  makeMigration (email: EmailAddress, fromVersion: Version) {
    this._migration = new Migration(new Date(), email, fromVersion)
  }

  static fromObject (metadata: RemoteConfigMetadataStructure) {
    return new RemoteConfigMetadata(
      metadata.name,
      new Date(metadata.lastUpdatedAt),
      metadata.lastUpdateBy,
      metadata.migration
    )
  }

  validate () {
    if (typeof this.name !== 'string') {
      throw new SoloError(`Invalid metadata.name: ${this.name}`)
    }

    if (!(this.lastUpdatedAt instanceof Date)) {
      throw new SoloError(`Invalid metadata.lastUpdatedAt: ${this.lastUpdatedAt}`)
    }

    if (typeof this.lastUpdateBy !== 'string') {
      throw new SoloError(`Invalid metadata.lastUpdateBy: ${this.lastUpdateBy}`)
    }

    if (this.migration && !(this.migration instanceof Migration)) {
      throw new SoloError(`Invalid metadata.migration: ${this.migration}`)
    }
  }

  toObject () {
    const data = {
      name: this.name,
      lastUpdatedAt: new k8s.V1MicroTime(this.lastUpdatedAt),
      lastUpdateBy: this.lastUpdateBy,
    } as RemoteConfigMetadataStructure

    if (this.migration) data.migration = this.migration.toObject() as any

    return data
  }
}
