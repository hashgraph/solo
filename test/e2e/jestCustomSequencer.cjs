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
const Sequencer = require('@jest/test-sequencer').default

const isEndToEnd = (test) => {
  const contextConfig = test.context.config
  return contextConfig.displayName.name === 'end-to-end'
}

class CustomSequencer extends Sequencer {
  sort (tests) {
    const copyTests = Array.from(tests)
    const normalTests = copyTests.filter((t) => !isEndToEnd(t))
    const endToEndTests = copyTests.filter((t) => isEndToEnd(t))
    return super.sort(normalTests).concat(endToEndTests.sort((a, b) => (a.path > b.path ? 1 : -1)))
  }
}

module.exports = CustomSequencer
