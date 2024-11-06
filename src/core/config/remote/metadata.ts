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

import type { EmailAddress, Namespace, RemoteConfigMetadataStructure } from './types.ts'
import type { Migration } from './migration.ts'

export class RemoteConfigMetadata implements RemoteConfigMetadataStructure {
  constructor (
    public readonly name: Namespace,
    public readonly lastUpdatedAt: Date,
    public readonly lastUpdateBy: EmailAddress,
    public readonly migration?: Migration,
  ) {
    this.validate()
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
  }

  toObject () {
    const data = {
      name: this.name,
      lastUpdatedAt: this.lastUpdatedAt,
      lastUpdateBy: this.lastUpdateBy,
    } as Omit<RemoteConfigMetadataStructure, 'toObject' | 'validate'>

    if (this.migration) data.migration = this.migration.toObject() as any

    return data
  }
}
