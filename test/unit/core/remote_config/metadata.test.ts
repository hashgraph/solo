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
import { Migration } from '../../../../src/core/config/remote/migration.ts'
import { SoloError } from '../../../../src/core/errors.ts'
import { RemoteConfigMetadata } from '../../../../src/core/config/remote/metadata.ts'
import type { EmailAddress, Namespace } from '../../../../src/core/config/remote/types.ts'

function createMetadata () {
  const name: Namespace = 'namespace'
  const lastUpdatedAt: Date = new Date()
  const lastUpdateBy: EmailAddress = 'test@test.test'
  const migration = new Migration(lastUpdatedAt, lastUpdateBy, '0.0.0')

  return {
    metadata: new RemoteConfigMetadata(name, lastUpdatedAt, lastUpdateBy, migration),
    values: { name, lastUpdatedAt, lastUpdateBy, migration },
    migration
  }
}

describe('RemoteConfigMetadata', () => {
   it('should be able to create new instance of the class with valid data', () => {
     expect(() => createMetadata()).not.to.throw()
   })

  it('toObject method should return a valid object', () => {
    const { metadata, migration, values: { name, lastUpdatedAt, lastUpdateBy } } = createMetadata()

    expect(metadata.toObject()).to.deep.equal({ name, lastUpdatedAt, lastUpdateBy, migration: migration.toObject() })
  })

  it('should successfully create instance using fromObject', () => {
    const { metadata, values: { name, lastUpdatedAt, lastUpdateBy } } = createMetadata()

    // @ts-ignore
    delete metadata._migration

    const newMetadata = RemoteConfigMetadata.fromObject({ name, lastUpdatedAt, lastUpdateBy })

    expect(newMetadata.toObject()).to.deep.equal(metadata.toObject())

    expect(() => RemoteConfigMetadata.fromObject(metadata.toObject())).not.to.throw()
  })

  it('should successfully make migration with makeMigration()', () => {
    const { metadata, values: { lastUpdateBy } } = createMetadata()
    const version = '0.0.1'

    metadata.makeMigration(lastUpdateBy, version)

    expect(metadata.migration).to.be.ok
    expect(metadata.migration.fromVersion).to.equal(version)
    expect(metadata.migration).to.be.instanceof(Migration)
  })

  describe('Values', () => {
    const { values: { name, lastUpdatedAt, lastUpdateBy } } = createMetadata()

    it('should not be able to create new instance of the class with invalid name', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(null,lastUpdatedAt, lastUpdateBy))
        .to.throw(SoloError, `Invalid name: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(1,lastUpdatedAt, lastUpdateBy))
        .to.throw(SoloError, `Invalid name: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid lastUpdatedAt', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,null, lastUpdateBy))
        .to.throw(SoloError, `Invalid lastUpdatedAt: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,1, lastUpdateBy))
        .to.throw(SoloError, `Invalid lastUpdatedAt: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid lastUpdateBy', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,lastUpdatedAt, null))
        .to.throw(SoloError, `Invalid lastUpdateBy: ${null}`)

      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,lastUpdatedAt, 1))
        .to.throw(SoloError, `Invalid lastUpdateBy: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid migration', () => {
      // @ts-ignore
      expect( () => new RemoteConfigMetadata(name,lastUpdatedAt, lastUpdateBy, {}))
        .to.throw(SoloError, `Invalid migration: ${{}}`)
    })
  })
})