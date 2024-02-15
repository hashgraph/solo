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
import { describe, expect, it } from '@jest/globals'
import { FullstackTestingError } from '../../../src/core/errors.mjs'
import * as helpers from '../../../src/core/helpers.mjs'

describe('Helpers', () => {
  it.each([
    ['v0.42.5', { major: 0, minor: 42, patch: 5 }],
    ['v0.42.5-alpha.0', { major: 0, minor: 42, patch: 5 }]
  ])('should parse release tag into major, minor and patch numbers', (input, expected) => {
    const result = helpers.parseSemver(input)
    expect(result).toEqual(expected)
  })

  it.each([
    ['', new FullstackTestingError('invalid version. Expected \'v<MAJOR>.<MINOR>.<PATCH>\', found \'\'')],
    ['0.42.5', new FullstackTestingError('invalid version. Expected \'v<MAJOR>.<MINOR>.<PATCH>\', found \'0.42.5\'')],
    ['v0.42', new FullstackTestingError("version 'v0.42' must have the format MAJOR.MINOR.PATCH")],
    ['v0.NEW', new FullstackTestingError("version 'v0.NEW' must have the format MAJOR.MINOR.PATCH")]
  ])('should throw error in parsing release tag', (input, expectedError) => {
    expect.assertions(1)
    try {
      helpers.parseSemver(input) // Error(new FullstackTestingError('releaseTag must have the format MAJOR.MINOR.PATCH'))
    } catch (e) {
      expect(e).toEqual(expectedError)
    }
  })

  describe('compareVersion', () => {
    it('should succeed with same version', () => {
      expect(helpers.compareVersion('v3.14.0', 'v3.14.0')).toBe(0)
    })

    it('should succeed with patch higher than target', () => {
      expect(helpers.compareVersion('v3.14.0', 'v3.14.1')).toBe(1)
    })

    it('should succeed with minor version higher than target', () => {
      expect(helpers.compareVersion('v3.14.0', 'v3.15.0')).toBe(1)
    })

    it('should succeed with major version higher than target', () => {
      expect(helpers.compareVersion('v3.14.0', 'v4.14.0')).toBe(1)
    })

    it('should fail with major version lower than target', () => {
      expect(helpers.compareVersion('v3.14.0', 'v2.14.0')).toBe(-1)
    })

    it('should fail with minor version lower than target', () => {
      expect(helpers.compareVersion('v3.14.0', 'v3.11.0')).toBe(-1)
    })

    it('should succeed with a later version', () => {
      expect(helpers.compareVersion('v3.12.3', 'v3.14.0')).toBe(1)
    })
  })
})
