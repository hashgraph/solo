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
import each from 'mocha-each'

import * as helpers from '../../../src/core/helpers.ts'
import { HEDERA_PLATFORM_VERSION } from '../../../version.ts'

describe('Helpers', () => {
  each([
    { input: '', output: [] },
    { input: 'node1', output: ['node1'] },
    { input: 'node1,node3', output: ['node1', 'node3'] }
  ])
    .it('should parse node aliases for input', ({ input, output }: {input: string, output: string[]}) => {
      expect(helpers.parseNodeAliases(input)).to.deep.equal(output)
    })

  each([
    { input: [], output: [] },
    { input: [1, 2, 3], output: [1, 2, 3] },
    { input: ['a', '2', '3'], output: ['a', '2', '3'] }
  ])
    .it('should clone array for input', ({ input, output }: {input: number[], output: number[]}) => {
      const clonedArray = helpers.cloneArray(input)
      expect(clonedArray).to.deep.equal(output)
      expect(clonedArray).not.to.equal(input) // ensure cloning creates a new array
    })

  it('should be able to load version from package json', () => {
    const p = helpers.loadPackageJSON()
    expect(p).not.to.be.null
    expect(p.version).not.to.be.null
    expect(p.version).to.deep.equal(helpers.packageVersion())
  })

  each([
    { input: 'v0.42.5', output: 'hashgraph/solo-containers/ubi8-init-java17' },
    { input: 'v0.45.1', output: 'hashgraph/solo-containers/ubi8-init-java17' },
    { input: 'v0.46.0', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: 'v0.47.1', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: 'v0.47.1-alpha.0', output: 'hashgraph/solo-containers/ubi8-init-java21' },
    { input: HEDERA_PLATFORM_VERSION, output: 'hashgraph/solo-containers/ubi8-init-java21' }
  ])
    .it('should determine root-image for Hedera platform version', ({ input, output }: {input: string, output: string}) => {
      expect(helpers.getRootImageRepository(input)).to.equal(output)
    })
})
