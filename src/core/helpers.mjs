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
import os from 'os'
import path from 'path'
import { FullstackTestingError } from './errors.mjs'
import * as paths from 'path'
import { fileURLToPath } from 'url'
import * as semver from 'semver'

// cache current directory
const CUR_FILE_DIR = paths.dirname(fileURLToPath(import.meta.url))

export function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function parseNodeIDs (input) {
  if (typeof input === 'string') {
    const nodeIds = []
    input.split(',').forEach(item => {
      const nodeId = item.trim()
      if (nodeId) {
        nodeIds.push(nodeId)
      }
    })

    return nodeIds
  }

  throw new FullstackTestingError('node IDs is not a comma separated string')
}

export function cloneArray (arr) {
  return JSON.parse(JSON.stringify(arr))
}

/**
 * load package.json
 * @returns {any}
 */
export function loadPackageJSON () {
  try {
    const raw = fs.readFileSync(`${CUR_FILE_DIR}/../../package.json`)
    return JSON.parse(raw.toString())
  } catch (e) {
    throw new FullstackTestingError('failed to load package.json', e)
  }
}

export function packageVersion () {
  const packageJson = loadPackageJSON()
  return packageJson.version
}

/**
 * Return the required root image for a platform version
 * @param releaseTag platform version
 * @return {string}
 */
export function getRootImageRepository (releaseTag) {
  const releaseVersion = semver.parse(releaseTag, { includePrerelease: true })
  if (releaseVersion.minor < 46) {
    return 'hashgraph/full-stack-testing/ubi8-init-java17'
  }

  return 'hashgraph/full-stack-testing/ubi8-init-java21'
}
export function getTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'))
}
