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
import type { EmailAddress, Version } from '../../../../src/core/config/remote/types.ts'
import { SoloError } from "../../../../src/core/errors.js";

function createMigration () {
  const migratedAt = new Date()
  const migratedBy = 'test@test.test' as EmailAddress
  const fromVersion = '1.0.0' as Version

  return {
    migration: new Migration(migratedAt, migratedBy, fromVersion),
    values: { migratedAt, migratedBy, fromVersion }
  }
}
describe('Migration', () => {
   it('should be able to create new instance of the class with valid data', () => {
     expect(() => createMigration()).not.to.throw()
   })

  it('toObject method should return a valid object', () => {
    const { migration, values } = createMigration()

    expect(migration.toObject()).to.deep.equal(values)
  })

  describe('Values', () => {
    const migratedAt = new Date()
    const migratedBy = 'test@test.test' as EmailAddress
    const fromVersion = '1.0.0' as Version

    it('should not be able to create new instance of the class with invalid migratedAt', () => {
      // @ts-ignore
      expect( () => new Migration(null,migratedBy, fromVersion))
        .to.throw(SoloError, `Invalid migratedAt: ${null}`)

      // @ts-ignore
      expect( () => new Migration(1,migratedBy, fromVersion))
        .to.throw(SoloError, `Invalid migratedAt: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid migratedBy', () => {
      // @ts-ignore
      expect( () => new Migration(migratedAt,null, fromVersion))
        .to.throw(SoloError, `Invalid migratedBy: ${null}`)

      // @ts-ignore
      expect( () => new Migration(migratedAt,1, fromVersion))
        .to.throw(SoloError, `Invalid migratedBy: ${1}`)
    })

    it('should not be able to create new instance of the class with invalid fromVersion', () => {
      // @ts-ignore
      expect( () => new Migration(migratedAt,migratedBy, null))
        .to.throw(SoloError, `Invalid fromVersion: ${null}`)

      // @ts-ignore
      expect( () => new Migration(migratedAt,migratedBy, 1))
        .to.throw(SoloError, `Invalid fromVersion: ${1}`)
    })
  })
})