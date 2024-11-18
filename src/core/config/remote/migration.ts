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
import { SoloError } from '../../errors.ts'
import type { EmailAddress, IMigration, Version } from './types.ts'

export class Migration implements IMigration {
  private readonly _migratedAt: Date
  private readonly _migratedBy: EmailAddress
  private readonly _fromVersion: Version

  public constructor (migratedAt: Date, migratedBy: EmailAddress, fromVersion: Version) {
    this._migratedAt = migratedAt
    this._migratedBy = migratedBy
    this._fromVersion = fromVersion
    this.validate()
  }

  //! -------- Getters -------- //

  get migratedAt (): Date { return this._migratedAt }
  get migratedBy (): EmailAddress { return this._migratedBy }
  get fromVersion (): Version { return this._fromVersion }

  //! -------- Utilities -------- //

  validate () {
    if (!(this.migratedAt instanceof Date)) {
      throw new SoloError(`Invalid migratedAt: ${this.migratedAt}`)
    }

    if (!this.migratedBy || typeof this.migratedBy !== 'string') {
      throw new SoloError(`Invalid migratedBy: ${this.migratedBy}`)
    }

    if (!this.fromVersion || typeof this.fromVersion !== 'string') {
      throw new SoloError(`Invalid fromVersion: ${this.fromVersion}`)
    }
  }

  toObject (): IMigration {
    return {
      migratedAt: this.migratedAt,
      migratedBy: this.migratedBy,
      fromVersion: this.fromVersion,
    }
  }
}