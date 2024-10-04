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
import * as helpers from '../../../src/core/helpers.mjs'
import { HEDERA_PLATFORM_VERSION } from '../../../version.mjs'

describe('Helpers', () => {
  it.each([
    {
      input: '',
      output: []
    },
    {
      input: 'node1',
      output: ['node1']
    },
    {
      input: 'node1,node3',
      output: ['node1', 'node3']
    }
  ])('should be able to parse node aliases', (t) => {
    expect(helpers.parseNodeAliases(t.input)).toStrictEqual(t.output)
  })

  it.each([
    {
      input: [],
      output: []
    },
    {
      input: [1, 2, 3],
      output: [1, 2, 3]
    },
    {
      input: ['a', '2', '3'],
      output: ['a', '2', '3']
    }
  ])('should be able to clone array', (t) => {
    expect(helpers.cloneArray(t.input)).toStrictEqual(t.output)
    expect(helpers.cloneArray(t.input)).not.toBe(t.input)
  })

  it('should be able to load version from package json', () => {
    const p = helpers.loadPackageJSON()
    expect(p).not.toBeNull()
    expect(p.version).not.toBeNull()
    expect(p.version).toStrictEqual(helpers.packageVersion())
  })

  it.each([
    { input: 'v0.42.5', output: 'hashgraph/solo-containers/ubi8-init-java17' },
    { input: 'v0.45.1', output: 'hashgraph/solo-containers/ubi8-init-java17' },
    { input: 'v0.46.0', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: 'v0.47.1', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: 'v0.47.1-alpha.0', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: HEDERA_PLATFORM_VERSION, output: 'hashgraph/solo-containers/ubi8-init-java21' }
  ])('should be able to determine root-image based on Hedera platform version', (t) => {
    expect(helpers.getRootImageRepository(t.input)).toStrictEqual(t.output)
  })
})
