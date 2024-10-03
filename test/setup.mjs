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
'use strict'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

// eslint-disable-next-line no-unused-vars
const expect = chai.expect
chai.use(chaiAsPromised)

global.expect = expect

//* Implement the methods since they are not build into mocha

/**
 * @param {Array} cases - The array of test cases
 * @param {string} name - The description of the test suite
 * @param {Function} callback - The test function
 */
global.describe.each = (cases, name, callback) => {
  describe(name, () => {
    cases.forEach((input) => {
      describe(`when osPlatform is ${input.osPlatform}`, () => callback(input))
    })
  })
}

/**
 * @param {Array} cases - The array of test cases
 * @param {string} description - The description of the test
 * @param {Function} callback - The test function
 */
global.it.each = (cases, description, callback) => {
  cases.forEach((input) => {
    it(`${description} - ${JSON.stringify(input)}`, () => callback(input))
  })
}