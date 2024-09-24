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
import { ProcessOutput } from 'listr2'

/**
 * Uses the solo logger to handle process output from Listr2
 * @class CustomProcessOutput
 * @augments ProcessOutput
 */
export class CustomProcessOutput extends ProcessOutput {
  /** @param {SoloLogger} logger */
  constructor (logger) {
    super()
    /** @private */
    this._logger = logger
  }

  /** @inheritDoc */
  toStdout (chunk, eol = true) {
    this._logger.debug(chunk.toString())
    return super.toStdout(chunk, eol)
  }

  /** @inheritDoc */
  toStderr (chunk, eol = true) {
    this._logger.error(chunk.toString())
    return super.toStderr(chunk, eol)
  }
}
