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
import Sequencer from '@jest/test-sequencer'
import Seedrandom from 'seedrandom'
import { NewLogger } from '../src/core/logging.mjs'
import chalk from 'chalk'

export default class testSequencer extends Sequencer.default {
  logger = NewLogger('debug')
  sort (tests) {
    // get value of environment variable RANDOM_SEED if it is set
    // or use current timestamp
    let seed
    if (process.env.RANDOM_SEED) {
      seed = process.env.RANDOM_SEED
      this.logger.showUser(chalk.green(`Using preset seed ${seed} for random test order`))
    } else {
      seed = new Date().getTime().toString()
      this.logger.showUser(chalk.green(`Using timestamp seed ${seed} for random test order`))
    }

    const randomNumGenerator = new Seedrandom(seed)
    const copyTests = Array.from(tests)

    // use randomNumGenerator.int32() to generate random even or odd nuber
    return copyTests.sort((testA, testB) => (randomNumGenerator.int32() % 2 === 0 ? -1 : 1))
  }
}
