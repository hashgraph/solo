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
  constructor (
    public readonly migratedAt: Date,
    public readonly migratedBy: EmailAddress,
    public readonly fromVersion: Version,
  ) {
    this.validate()
  }

  validate () {
    if (!(this.migratedAt instanceof Date)) {
      throw new SoloError(`Invalid migration.migratedAt: ${this.migratedAt}`)
    }

    if (typeof this.migratedBy !== 'string') {
      throw new SoloError(`Invalid migration.migratedBy: ${this.migratedBy}`)
    }

    if (typeof this.fromVersion !== 'string') {
      throw new SoloError(`Invalid migration.fromVersion: ${this.fromVersion}`)
    }
  }

  toObject (): Omit<IMigration, 'toObject' | 'validate'> {
    return {
      migratedAt: this.migratedAt,
      migratedBy: this.migratedBy,
      fromVersion: this.fromVersion,
    }
  }
}