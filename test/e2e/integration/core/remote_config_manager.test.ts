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
import { it, describe, after, before } from 'mocha'
import { expect } from 'chai'

import { constants, LocalConfig, RemoteConfigManager } from '../../../../src/core/index.ts'
import * as fs from 'fs'

import {
  e2eTestSuite,
  getDefaultArgv,
  getTestCacheDir,
  TEST_CLUSTER,
  testLogger
} from '../../../test_util.ts'
import { flags } from '../../../../src/commands/index.ts'
import * as version from '../../../../version.ts'
import { MINUTES, SECONDS } from '../../../../src/core/constants.ts'
import path from "path";
import { Listr } from "listr2";

const defaultTimeout = 20 * SECONDS

const namespace = 'remote-config-manager-e2e'
const argv = getDefaultArgv()
const testCacheDir = getTestCacheDir()
argv[flags.cacheDir.name] = testCacheDir
argv[flags.namespace.name] = namespace
argv[flags.nodeAliasesUnparsed.name] = 'node1'
argv[flags.clusterName.name] = TEST_CLUSTER
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
argv[flags.generateGossipKeys.name] = true
argv[flags.generateTlsKeys.name] = true
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false, (bootstrapResp) => {
  describe('RemoteConfigManager', async () => {
    const k8 = bootstrapResp.opts.k8
    const logger = bootstrapResp.opts.logger
    const configManager = bootstrapResp.opts.configManager
    const filePath = path.join(constants.SOLO_CACHE_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE)

    const localConfig = new LocalConfig(filePath, logger)
    const remoteConfigManager = new RemoteConfigManager(k8, logger, localConfig, configManager)

    after(async function () {
      this.timeout(3 * MINUTES)

      await k8.deleteNamespace(namespace)
    })

    before(function () {
      this.timeout(defaultTimeout)

      if (!fs.existsSync(testCacheDir)) {
        fs.mkdirSync(testCacheDir)
      }
    })
  })
})
