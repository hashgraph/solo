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
	ConfigManager,
	constants,
	DependencyManager,
	Helm,
	K8
} from '../../../src/core/index.mjs'
import { getTestCacheDir, testLogger } from '../../test_util.js'
import path from 'path'
import { AccountManager } from '../../../src/core/account_manager.mjs'
import { AccountCommand } from '../../../src/commands/account.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import {ClusterCommand} from "../../../src/commands/cluster.mjs";
import {NetworkCommand} from "../../../src/commands/network.mjs";

describe('network commands should work correctly', () => {
	const defaultTimeout = 20000
	let networkCmd
	let accountManager
	let configManager
	let k8
	let helm
	let chartManager
	let depManager
	let argv = {}

	beforeAll(() => {
		configManager = new ConfigManager(testLogger, path.join(getTestCacheDir('accountCmd'), 'solo.config'))
		k8 = new K8(configManager, testLogger)
		accountManager = new AccountManager(testLogger, k8, constants)
		helm = new Helm(testLogger)
		chartManager = new ChartManager(helm, testLogger)
		depManager = new DependencyManager(testLogger)
		networkCmd = new NetworkCommand({
			logger: testLogger,
			helm,
			k8,
			chartManager,
			configManager,
			depManager
		})
	})

	// afterAll(() => {
	// 	networkCmd.reset(argv)
	// })

	beforeEach(() => {
		configManager.reset()
		argv = {}
		argv[flags.cacheDir.name] = getTestCacheDir('networkCmd')
		argv[flags.namespace.name] = 'solo-e2e'
		argv[flags.clusterName.name] = 'kind-solo-e2e'
		argv[flags.clusterSetupNamespace.name] = 'solo-e2e-cluster'
		argv[flags.deployMirrorNode.name] = false
		argv[flags.deployHederaExplorer.name] = false
		argv[flags.releaseTag.name] = "v0.42.5" //flags.releaseTag.definition.defaultValue
		argv[flags.tlsClusterIssuerType.name] = flags.tlsClusterIssuerType.definition.defaultValue
		argv[flags.hederaExplorerTlsHostName.name] = flags.hederaExplorerTlsHostName.definition.defaultValue
		argv[flags.enablePrometheusSvcMonitor.name] = flags.enablePrometheusSvcMonitor.definition.defaultValue
		argv[flags.enableHederaExplorerTls.name] = flags.enableHederaExplorerTls.definition.defaultValue
		argv[flags.nodeIDs.name] = 'node0,node1,node2'
		configManager.update(argv, true)
	})

	afterEach(() => {
		sleep(5).then().catch() // give a few ticks so that connections can close
	})

	it('network setup should succeed', async () => {
		expect.assertions(1)
		try {
			await expect(networkCmd.deploy(argv)).resolves.toBeTruthy()
		} catch (e) {
			networkCmd.logger.showUserError(e)
			expect(e).toBeNull()
		}
	}, 60000)
})
