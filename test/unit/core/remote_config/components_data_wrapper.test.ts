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
import { expect } from 'chai'
import { describe, it } from 'mocha'

import { RemoteConfigMetadata } from '../../../../src/core/config/remote/metadata.ts'
import { Migration } from '../../../../src/core/config/remote/migration.ts'
import type { EmailAddress, Namespace, Version } from '../../../../src/core/config/remote/types.ts'
import { SoloError } from "../../../../src/core/errors.js";

function createRemoteConfigMetadata () {
  const name: Namespace = 'namespace'
  const lastUpdatedAt: Date = new Date()
  const lastUpdateBy: EmailAddress = 'test@test.test'
  const migration: Migration = new Migration(lastUpdatedAt, lastUpdateBy, '0.0.0')

  const metadata = new RemoteConfigMetadata(name, lastUpdatedAt, lastUpdateBy, migration)

  return {
    metadata,
    values: { name, lastUpdatedAt, lastUpdateBy, migration }
  }
}

describe('RemoteConfigMetadata', () => {
  it('should be able to create instance', () => {
    expect(() => createRemoteConfigMetadata()).not.to.throw()
  })

  it('should be able to create new migration with makeMigration() method', () => {
    const { metadata } = createRemoteConfigMetadata()
    const email: EmailAddress = 'newMigration@test.test'
    const version: Version = '2.0.0'

    metadata.makeMigration(email, version)
    expect(metadata.migration).to.be.ok
    expect(metadata.migration?.migratedBy).to.equal(email)
    expect(metadata.migration?.fromVersion).to.equal(version)
  })

  it('should be able to create instance with fromObject() method', () => {
    const { values } = createRemoteConfigMetadata()

    expect(() => RemoteConfigMetadata.fromObject(values)).not.to.throw()
  })

  it ('should be able to create feed otput from toObject() and then convert  with fromObject()', () => {
    const { metadata } = createRemoteConfigMetadata()

    const metadataObject = metadata.toObject()

    expect(() => RemoteConfigMetadata.fromObject(metadataObject)).not.to.throw
  })

  describe('Values', () => {
    const name = 'name'
    const lastUpdatedAt = new Date()
    const lastUpdateBy = 'test@test.test' as EmailAddress

    it('should not be able to create new instance of the class with invalid migratedAt', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(null, lastUpdatedAt, lastUpdateBy))
        .to.throw(SoloError, `Invalid name: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(1,lastUpdatedAt, lastUpdateBy))
        .to.throw(SoloError, `Invalid name: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid lastUpdatedAt', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name, null, lastUpdateBy))
        .to.throw(SoloError, `Invalid lastUpdatedAt: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,1, lastUpdateBy))
        .to.throw(SoloError, `Invalid lastUpdatedAt: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid lastUpdateBy', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name, lastUpdatedAt, null))
        .to.throw(SoloError, `Invalid lastUpdateBy: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,lastUpdatedAt, 1))
        .to.throw(SoloError, `Invalid lastUpdateBy: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid lastUpdateBy', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name, lastUpdatedAt, lastUpdateBy, {}))
        .to.throw(SoloError, `Invalid migration: ${{}}`)
    })

  })
})