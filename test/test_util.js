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
import fs from 'fs'
import path from 'path'
import { logging, constants } from '../src/core/index.mjs'

export const testLogger = logging.NewLogger('debug')

export function getTestCacheDir (appendDir) {
  const baseDir = 'test/data/tmp'
  const d = appendDir ? path.join(baseDir, appendDir) : baseDir

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d)
  }
  return d
}

export function getTmpDir () {
  return fs.mkdtempSync(path.join(constants.SOLO_TMP_DIR, 'solo-test-'))
}
