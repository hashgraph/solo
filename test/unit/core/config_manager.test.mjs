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
import { afterAll, describe, expect, it } from '@jest/globals'
import os from 'os'
import path from 'path'
import { ConfigManager } from '../../../src/core/index.mjs'
import * as flags from '../../../src/commands/flags.mjs'
import fs from 'fs'
import { testLogger } from '../../test_util.js'
import * as helpers from '../../../src/core/helpers.mjs'

describe('ConfigManager', () => {
  it('should persist config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.json')

    expect(fs.existsSync(tmpFile)).toBeFalsy()
    const cm = new ConfigManager(testLogger, tmpFile)
    cm.persist()
    expect(fs.existsSync(tmpFile)).toBeTruthy()

    const configJSON = fs.readFileSync(tmpFile)
    const cachedConfig = JSON.parse(configJSON.toString())

    expect(cachedConfig.version).toStrictEqual(helpers.packageVersion())
    expect(cachedConfig.flags).toStrictEqual({})
    expect(cachedConfig.updatedAt).not.toStrictEqual('')

    expect(cachedConfig.updatedAt).toStrictEqual(cm.getUpdatedAt())
    expect(cachedConfig.version).toStrictEqual(cm.getVersion())
    expect(cachedConfig.flags).toStrictEqual(cm.config.flags)

    fs.rmSync(tmpDir, { recursive: true })
  })

  describe('update values using argv', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.json')

    it('should update string flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)
      const argv = {}
      argv[flags.releaseTag.name] = 'v0.42.5'

      cm.update(argv)
      expect(cm.getFlag(flags.releaseTag)).toStrictEqual(argv[flags.releaseTag.name])

      // ensure non-string values are converted to string
      cm.reset()
      argv[flags.releaseTag.name] = true
      cm.update(argv)
      expect(cm.getFlag(flags.releaseTag)).not.toStrictEqual(argv[flags.releaseTag.name])
      expect(cm.getFlag(flags.releaseTag)).toStrictEqual(`${argv[flags.releaseTag.name]}`)
    })

    it('should update number flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)
      const argv = {}
      argv[flags.replicaCount.name] = 1

      cm.update(argv)
      expect(cm.getFlag(flags.replicaCount)).toStrictEqual(argv[flags.replicaCount.name])

      // ensure string values are converted to integer
      cm.reset()
      argv[flags.replicaCount.name] = '1'
      cm.update(argv)
      expect(cm.getFlag(flags.replicaCount)).not.toStrictEqual(argv[flags.replicaCount.name])
      expect(cm.getFlag(flags.replicaCount)).toStrictEqual(Number.parseInt(argv[flags.replicaCount.name]))
    })

    it('should update boolean flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)

      // boolean values should work
      const argv = {}
      argv[flags.devMode.name] = true
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).toStrictEqual(argv[flags.devMode.name])

      // ensure string "false" is converted to boolean
      cm.reset()
      argv[flags.devMode.name] = 'false'
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).not.toStrictEqual(argv[flags.devMode.name])
      expect(cm.getFlag(flags.devMode)).toStrictEqual(false)

      // ensure string "true" is converted to boolean
      cm.reset()
      argv[flags.devMode.name] = 'true'
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).not.toStrictEqual(argv[flags.devMode.name])
      expect(cm.getFlag(flags.devMode)).toStrictEqual(true)
    })

    afterAll(() => {
      fs.rmdirSync(tmpDir, { recursive: true })
    })
  })

  describe('should apply precedence', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.json')
    const aliases = {}
    aliases[flags.devMode.name] = [flags.devMode.name, flags.devMode.definition.alias] // mock

    it('should take user input as the first preference', () => {
      // Given: config has value, argv has a different value
      // Expected:  argv should retain the value
      const cm = new ConfigManager(testLogger, tmpFile)
      cm.setFlag(flags.devMode, false)
      expect(cm.getFlag(flags.devMode)).toBeFalsy()

      const argv = {}
      argv[flags.devMode.name] = true // devMode flag is set in argv but cached config has it

      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.getFlag(flags.devMode)).toBeFalsy() // shouldn't have changed the config yet
      expect(argv2[flags.devMode.name]).toBeTruthy() // retain the value
    })

    it('should take cached config as the second preference', () => {
      // Given: config has value, argv doesn't have the flag value
      // Expected:  argv should inherit the flag value from cached config
      const cm = new ConfigManager(testLogger, tmpFile)

      cm.setFlag(flags.devMode, false)
      expect(cm.getFlag(flags.devMode)).toBeFalsy()

      const argv = {} // devMode flag is not set in argv
      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.getFlag(flags.devMode)).toBeFalsy() // shouldn't have changed
      expect(argv2[flags.devMode.name]).toStrictEqual(cm.getFlag(flags.devMode)) // should inherit from config
    })

    it('should take default as the last preference', () => {
      // Given: neither config nor argv has the flag value set
      // Expected:  argv should inherit the default flag value
      const cm = new ConfigManager(testLogger, tmpFile)
      expect(cm.hasFlag(flags.devMode)).toBeFalsy() // shouldn't have set

      const argv = {} // devMode flag is not set in argv and cached config doesn't have it either
      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.hasFlag(flags.devMode)).toBeFalsy() // shouldn't have set
      expect(argv2[flags.devMode.name]).toBeFalsy() // should have set from the default
    })

    afterAll(() => {
      fs.rmdirSync(tmpDir, { recursive: true })
    })
  })

  describe('load a cached config file', () => {
    const configFilePath = process.cwd() + '/test/data/solo-test-1.config'
    const cm = new ConfigManager(testLogger, configFilePath)
    cm.load()

    it('config file match: dev=false', () => {
      expect(cm.config.flags[flags.devMode.name]).toBeFalsy()
    })

    it('config file match: namespace=solo-user', () => {
      expect(cm.config.flags[flags.namespace.name]).toBe('solo-user')
    })

    it('config file match: chartDirectory is empty', () => {
      expect(cm.config.flags[flags.chartDirectory.name]).toBe('')
    })

    it('config file match: clusterName=kind-kind', () => {
      expect(cm.config.flags[flags.clusterName.name]).toBe('kind-kind')
    })

    it('config file match: deployPrometheusStack=false', () => {
      expect(cm.config.flags[flags.deployPrometheusStack.name]).toBeFalsy()
    })

    it('config file match: deployMinio=false', () => {
      expect(cm.config.flags[flags.deployMinio.name]).toBeFalsy()
    })

    it('config file match: deployCertManager=false', () => {
      expect(cm.config.flags[flags.deployCertManager.name]).toBeFalsy()
    })

    it('config file match: deployCertManagerCrds=false', () => {
      expect(cm.config.flags[flags.deployCertManagerCrds.name]).toBeFalsy()
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.enablePrometheusSvcMonitor.name]).toBeUndefined()
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.enableHederaExplorerTls.name]).toBeUndefined()
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.hederaExplorerTlsHostName.name]).toBeUndefined()
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.deletePvcs.name]).toBeUndefined()
    })
  })

  describe('handle argv overrides', () => {
    const configFilePath = process.cwd() + '/test/data/solo-test-2.config'
    const cm = new ConfigManager(testLogger, configFilePath)
    const configJSON = fs.readFileSync(process.cwd() + '/test/data/solo-test-2.config')
    const cachedConfig = JSON.parse(configJSON.toString())

    it('override config using argv', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).toBe(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).toBe(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = 'new-cluster'
      argv[flags.namespace.name] = 'new-namespace'
      cm.update(argv)

      expect(cm.getFlag(flags.clusterName)).toBe(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).toBe(argv[flags.namespace.name])
    })

    it('config file takes precedence over empty namespace', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).toBe(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).toBe(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = 'new-cluster'
      argv[flags.namespace.name] = ''
      cm.update(argv)
      expect(cm.getFlag(flags.clusterName)).toBe(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).not.toBe(argv[flags.namespace.name])
      expect(cm.getFlag(flags.namespace)).toBe(cachedConfig.flags[flags.namespace.name])
    })

    it('config file takes precedence over empty cluster name', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).toBe(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).toBe(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = ''
      argv[flags.namespace.name] = 'new-namespace'
      cm.update(argv)
      expect(cm.getFlag(flags.clusterName)).not.toBe(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.clusterName)).toBe(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).toBe(argv[flags.namespace.name])
    })
  })
})
