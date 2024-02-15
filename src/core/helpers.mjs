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
import { FullstackTestingError } from './errors.mjs'
import * as paths from 'path'
import { fileURLToPath } from 'url'

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
 * Split semantic version into its major, minor and patch number
 * @param semver release version
 * @return {{patch: number, major: number, minor: number}}
 */
export function parseSemver (semver) {
  if (!semver || semver[0] !== 'v') {
    throw new FullstackTestingError(`invalid version. Expected 'v<MAJOR>.<MINOR>.<PATCH>', found '${semver}'`)
  }

  const version = semver.replace('v', '') // remove first 'v'
  const parts = version.split('-')[0].split('.') // just take the major.minor.patch part of the version
  if (parts.length < 3) {
    throw new FullstackTestingError(`version '${semver}' must have the format MAJOR.MINOR.PATCH`)
  }

  return {
    major: Number.parseInt(parts[0]),
    minor: Number.parseInt(parts[1]),
    patch: Number.parseInt(parts[2])
  }
}

/**
 * Compare two version
 *
 * It returns 1, 0, -1 depending on the following three cases:
 *  - candidate > target: 1
 *  - candidate == target: 0
 *  - candidate < target: -1
 *
 * @param target target version
 * @param candidate candidate version
 * @return {number}
 */
export function compareVersion (target, candidate) {
  const v1 = parseSemver(target)
  const v2 = parseSemver(candidate)

  if (v2.major === v1.major && v2.minor === v1.minor && v2.patch === v1.patch) {
    return 0
  }

  if ((v2.major > v1.major) ||
    (v2.major >= v1.major && v2.minor > v1.minor) ||
    (v2.major >= v1.major && v2.minor >= v1.minor && v2.patch >= v1.patch)
  ) {
    return 1
  }

  return -1
}

/**
 * Return the required root image for a platform version
 * @param releaseTag platform version
 * @return {string}
 */
export function getRootImageRepository (releaseTag) {
  const releaseVersion = parseSemver(releaseTag)
  if (releaseVersion.minor < 46) {
    return 'hashgraph/full-stack-testing/ubi8-init-java17'
  }

  return 'hashgraph/full-stack-testing/ubi8-init-java21'
}
