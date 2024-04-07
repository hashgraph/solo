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
import util from 'util'
import { FullstackTestingError } from './errors.mjs'
import * as paths from 'path'
import { fileURLToPath } from 'url'
import * as semver from 'semver'
import { Templates } from './templates.mjs'

// cache current directory
const CUR_FILE_DIR = paths.dirname(fileURLToPath(import.meta.url))

export function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function parseNodeIds (input) {
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

export function createBackupDir (destDir, prefix = 'backup', curDate = new Date()) {
  const dateDir = util.format('%s%s%s_%s%s%s',
    curDate.getFullYear(),
    curDate.getMonth().toString().padStart(2, '0'),
    curDate.getDate().toString().padStart(2, '0'),
    curDate.getHours().toString().padStart(2, '0'),
    curDate.getMinutes().toString().padStart(2, '0'),
    curDate.getSeconds().toString().padStart(2, '0')
  )

  const backupDir = path.join(destDir, prefix, dateDir)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  return backupDir
}

export function makeBackup (fileMap = new Map(), removeOld = true) {
  for (const entry of fileMap) {
    const srcPath = entry[0]
    const destPath = entry[1]
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath)
      if (removeOld) {
        fs.rmSync(srcPath)
      }
    }
  }
}

export function backupOldPfxKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'gossip-pfx') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, `private-${nodeId}.pfx`)
    const destPath = path.join(backupDir, `private-${nodeId}.pfx`)
    fileMap.set(srcPath, destPath)
  }

  const srcPath = path.join(keysDir, 'public.pfx')
  const destPath = path.join(backupDir, 'public.pfx')
  fileMap.set(srcPath, destPath)
  makeBackup(fileMap, true)

  return backupDir
}

export function backupOldTlsKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'tls') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, Templates.renderTLSPemPrivateKeyFile(nodeId))
    const destPath = path.join(backupDir, Templates.renderTLSPemPublicKeyFile(nodeId))
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

export function backupOldPemKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'gossip-pem') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(nodeId))
    const destPath = path.join(backupDir, Templates.renderGossipPemPublicKeyFile(nodeId))
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

export function isNumeric (str) {
  if (typeof str !== 'string') return false // we only process strings!
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}
