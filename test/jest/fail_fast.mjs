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

import { TestEnvironment } from 'jest-environment-node'

/**
 * Custom Jest Environment where a failed test would ensure later tests are skipped
 *
 * This code is customized based on the following sources:
 *  *  - https://github.com/jestjs/jest/issues/6527#issuecomment-734917527
 *  *  - https://stackoverflow.com/questions/51250006/jest-stop-test-suite-after-first-fail
 */
export default class JestEnvironmentFailFast extends TestEnvironment {
  failedMap = new Map()

  async handleTestEvent (event, state) {
    switch (event.name) {
      case 'hook_failure': {
        // hook errors are not displayed if tests are skipped, so display them manually
        event.hook.parent.name = `[${event.hook.type} - ERROR]: ${event.hook.parent.name}`
        this.failedMap.set(event.hook.parent.name, true)
        break
      }

      case 'test_fn_failure': {
        this.failedMap.set(event.test.parent.name, true)
        break
      }

      case 'test_start': {
        if (this.failedMap.has(event.test.parent.name)) {
          event.test.mode = 'todo'
        }
        break
      }

      case 'test_skip': {
        event.test.name = `SKIPPED: ${event.test.name}`
        break
      }
    }

    if (super.handleTestEvent) {
      super.handleTestEvent(event, state)
    }
  }
}
