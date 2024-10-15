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
import { ProcessOutput } from 'listr2'
import { type SoloLogger} from "./logging.ts";

/** Uses the solo logger to handle process output from Listr2 */
export class CustomProcessOutput extends ProcessOutput {
  constructor (private readonly logger: SoloLogger) {
    super()
  }

  toStdout (chunk: string, eol = true) {
    chunk.toString().split('\n').forEach(line => {
      this.logger.debug(line)
    })
    return super.toStdout(chunk, eol)
  }

  toStderr (chunk: string, eol = true) {
    this.logger.error(chunk.toString())
    return super.toStderr(chunk, eol)
  }
}
