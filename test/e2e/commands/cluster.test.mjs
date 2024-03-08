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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from '@jest/globals'
import {
  ChartManager,
  ConfigManager, constants,
  Helm,
  K8, PackageDownloader, Zippy
} from '../../../src/core/index.mjs'
import { DependencyManager, HelmDependencyManager } from '../../../src/core/dependency_managers/index.mjs'
import { getTestCacheDir, testLogger } from '../../test_util.js'
import path from 'path'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import { ClusterCommand } from '../../../src/commands/cluster.mjs'
import { ShellRunner } from "../../../src/core/shell_runner.mjs"

describe('ClusterCommand', () => {
  let clusterCmd
  let configManager
  let k8
  let helm
  let chartManager
  let argv = {}
  const CLUSTER_NAME = 'solo-test-cluster-cmd'
  const shellRunner = new ShellRunner(testLogger)

  beforeAll(async () => {
    await shellRunner.run('kind create cluster -n ' + CLUSTER_NAME)

    configManager = new ConfigManager(testLogger, path.join(getTestCacheDir('clusterCmd'), 'solo.config'))
    k8 = new K8(configManager, testLogger)
    helm = new Helm(testLogger)
    chartManager = new ChartManager(helm, testLogger)

    // prepare dependency manger registry
    const downloader = new PackageDownloader(testLogger)
    const zippy = new Zippy(testLogger)
    const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
    const depManagerMap = new Map().set(constants.HELM, helmDepManager)
    const depManager = new DependencyManager(testLogger, depManagerMap)

    clusterCmd = new ClusterCommand({
      logger: testLogger,
      helm,
      k8,
      chartManager,
      configManager,
      depManager
    })
  }, 70000)

  afterAll(async () => {
    await shellRunner.run('kind delete cluster -n ' + CLUSTER_NAME)
  }, 30000)

  beforeEach(() => {
    configManager.reset()
    argv = {}
    argv[flags.cacheDir.name] = getTestCacheDir('clusterCmd')
    argv[flags.namespace.name] = CLUSTER_NAME
    argv[flags.clusterName.name] = CLUSTER_NAME
    argv[flags.clusterSetupNamespace.name] = CLUSTER_NAME + '-cluster'
  })

  afterEach(async () => {
    await sleep(5) // give a few ticks so that connections can close
  })

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'

    argv[flags.deployPrometheusStack.name] = true
    argv[flags.deployMinio.name] = true
    argv[flags.deployCertManager.name] = true
    argv[flags.deployCertManagerCrds.name] = true

    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.setup(argv)).rejects.toThrowError('Error on cluster setup')
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('solo cluster setup should work with valid args', async () => {
    argv[flags.deployPrometheusStack.name] = true
    argv[flags.deployMinio.name] = true
    argv[flags.deployCertManager.name] = true
    argv[flags.deployCertManagerCrds.name] = true
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.setup(argv)).resolves.toBeTruthy()
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'

    argv[flags.force.name] = true
    argv[flags.deletePvcs.name] = true
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.reset(argv)).rejects.toThrowError('Error on cluster reset')
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('solo cluster reset should work with valid args', async () => {
    argv[flags.force.name] = true
    argv[flags.deletePvcs.name] = true
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.reset(argv)).resolves.toBeTruthy()
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)
})
