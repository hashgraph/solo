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
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { flags } from '../src/commands/index.mjs'
import { sleep } from '../src/core/helpers.mjs'
import { ConfigManager, constants, logging } from '../src/core/index.mjs'

export const testLogger = logging.NewLogger('debug')
export const TEST_CLUSTER = 'solo-e2e'

export function getTestCacheDir (testName) {
  const baseDir = 'test/data/tmp'
  const d = testName ? path.join(baseDir, testName) : baseDir

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d)
  }
  return d
}

export function getTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'))
}

/**
 * Return a config manager with the specified config file name
 * @param fileName solo config file name
 * @return {ConfigManager}
 */
export function getTestConfigManager (fileName = 'solo-test.config') {
  return new ConfigManager(testLogger, path.join(getTestCacheDir(), fileName))
}

/**
 * Get argv with defaults
 */
export function getDefaultArgv () {
  const argv = {}
  for (const f of flags.allFlags) {
    argv[f.name] = f.definition.defaultValue
  }
  return argv
}

/**
 * Bootstrap network in a given namespace
 *
 * @param argv argv for commands
 * @param namespace namespace name
 * @param k8 instance of K8
 * @param initCmd instance of InitCommand
 * @param clusterCmd instance of ClusterCommand
 * @param networkCmd instance of NetworkCommand
 * @param nodeCmd instance of NodeCommand
 */
export function bootstrapNetwork (argv, namespace, k8, initCmd, clusterCmd, networkCmd, nodeCmd) {
  describe('Bootstrap network for test', () => {
    it('should cleanup previous deployment', async () => {
      await initCmd.init(argv)

      if (await k8.hasNamespace(namespace)) {
        await k8.deleteNamespace(namespace)

        while (await k8.hasNamespace(namespace)) {
          testLogger.debug(`Namespace ${namespace} still exist. Waiting...`)
          await sleep(1500)
        }
      }

      if (!await k8.hasNamespace(constants.FULLSTACK_SETUP_NAMESPACE)) {
        await clusterCmd.setup(argv)
      }
    }, 60000)

    it('should succeed with network deploy', async () => {
      await networkCmd.deploy(argv)
    }, 60000)

    it('should succeed with node setup command', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.setup(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 120000)

    it('should succeed with node start command', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.start(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 600000)
  })
}
