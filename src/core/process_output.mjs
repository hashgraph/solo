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

export class CustomProcessOutput extends ProcessOutput {
  /** @param {SoloLogger} logger */
  constructor (logger) {
    super()
    /** @private */
    this._logger = logger
  }

  /**
   * @param {Buffer<string|number>} chunk
   * @param {string} encoding
   * @param {process.stdout.fd|process.stderr.fd|unknown} fd
   */
  write (chunk, encoding, fd) {
    const message = chunk.toString()

    // Capture stdout as debug, stderr as error
    if (fd === process.stdout.fd) {
      this._logger.debug(`Listr Process stdout: ${message}`)
    } else if (fd === process.stderr.fd) {
      this._logger.error(`Listr Process stderr: ${message}`)
    } else {
      this._logger.info(`Listr Process log: ${message}`)
    }
  }
}
