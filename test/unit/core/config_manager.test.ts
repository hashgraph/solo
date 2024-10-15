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
import { expect } from 'chai'
import { describe, it, after } from 'mocha'

import os from 'os'
import path from 'path'
import { ConfigManager } from '../../../src/core/index'
import * as flags from '../../../src/commands/flags'
import fs from 'fs'
import { testLogger } from '../../test_util'
import * as helpers from '../../../src/core/helpers'
import { yamlToObject } from '../../../src/core/helpers'

describe('ConfigManager', () => {
  it('should persist config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.yaml')

    expect(fs.existsSync(tmpFile)).to.not.be.ok
    const cm = new ConfigManager(testLogger, tmpFile)
    cm.persist()
    expect(fs.existsSync(tmpFile)).to.be.ok

    const cachedConfig = yamlToObject(tmpFile)

    expect(cachedConfig.version).to.equal(helpers.packageVersion())
    expect(cachedConfig.flags).to.deep.equal({})
    expect(cachedConfig.updatedAt).not.to.equal('')

    expect(cachedConfig.updatedAt).to.equal(cm.getUpdatedAt())
    expect(cachedConfig.version).to.equal(cm.getVersion())
    expect(cachedConfig.flags).to.deep.equal(cm.config.flags)

    fs.rmSync(tmpDir, { recursive: true })
  })

  describe('update values using argv', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.yaml')

    it('should update string flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)
      const argv = {}
      argv[flags.releaseTag.name] = 'v0.42.5'

      cm.update(argv)
      expect(cm.getFlag(flags.releaseTag)).to.equal(argv[flags.releaseTag.name])

      // ensure non-string values are converted to string
      cm.reset()
      argv[flags.releaseTag.name] = true
      cm.update(argv)
      expect(cm.getFlag(flags.releaseTag)).not.to.equal(argv[flags.releaseTag.name])
      expect(cm.getFlag(flags.releaseTag)).to.equal(`${argv[flags.releaseTag.name]}`)
    })

    it('should update number flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)
      const argv = {}
      argv[flags.replicaCount.name] = 1

      cm.update(argv)
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(argv[flags.replicaCount.name])

      // ensure string values are converted to integer
      cm.reset()
      argv[flags.replicaCount.name] = '1'
      cm.update(argv)
      expect(cm.getFlag(flags.replicaCount)).not.to.deep.equal(argv[flags.replicaCount.name])
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(Number.parseInt(argv[flags.replicaCount.name]))
    })

    it('should update boolean flag value', () => {
      const cm = new ConfigManager(testLogger, tmpFile)

      // boolean values should work
      const argv = {}
      argv[flags.devMode.name] = true
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).to.equal(argv[flags.devMode.name])

      // ensure string "false" is converted to boolean
      cm.reset()
      argv[flags.devMode.name] = 'false'
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv[flags.devMode.name])
      expect(cm.getFlag(flags.devMode)).to.equal(false)

      // ensure string "true" is converted to boolean
      cm.reset()
      argv[flags.devMode.name] = 'true'
      cm.update(argv)
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv[flags.devMode.name])
      expect(cm.getFlag(flags.devMode)).to.equal(true)
    })

    after(() => {
      fs.rmdirSync(tmpDir, { recursive: true })
    })
  })

  describe('should apply precedence', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'))
    const tmpFile = path.join(tmpDir, 'test.yaml')
    const aliases = {}
    aliases[flags.devMode.name] = [flags.devMode.name, flags.devMode.definition.alias] // mock

    it('should take user input as the first preference', () => {
      // Given: config has value, argv has a different value
      // Expected:  argv should retain the value
      const cm = new ConfigManager(testLogger, tmpFile)
      cm.setFlag(flags.devMode, false)
      expect(cm.getFlag(flags.devMode)).not.to.be.ok

      const argv = {}
      argv[flags.devMode.name] = true // devMode flag is set in argv but cached config has it

      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.getFlag(flags.devMode)).to.not.be.ok // shouldn't have changed the config yet
      expect(argv2[flags.devMode.name]).to.be.ok // retain the value
    })

    it('should take cached config as the second preference', () => {
      // Given: config has value, argv doesn't have the flag value
      // Expected:  argv should inherit the flag value from cached config
      const cm = new ConfigManager(testLogger, tmpFile)

      cm.setFlag(flags.devMode, false)
      expect(cm.getFlag(flags.devMode)).to.not.be.ok

      const argv = {} // devMode flag is not set in argv
      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.getFlag(flags.devMode)).to.not.be.ok // shouldn't have changed
      expect(argv2[flags.devMode.name]).to.equal(cm.getFlag(flags.devMode)) // should inherit from config
    })

    it('should take default as the last preference', () => {
      // Given: neither config nor argv has the flag value set
      // Expected:  argv should inherit the default flag value
      const cm = new ConfigManager(testLogger, tmpFile)
      expect(cm.hasFlag(flags.devMode)).not.to.be.ok // shouldn't have set

      const argv = {} // devMode flag is not set in argv and cached config doesn't have it either
      const argv2 = cm.applyPrecedence(argv, aliases)
      expect(cm.hasFlag(flags.devMode)).to.not.be.ok // shouldn't have set
      expect(argv2[flags.devMode.name]).to.not.be.ok // should have set from the default
    })

    after(() => {
      fs.rmdirSync(tmpDir, { recursive: true })
    })
  })

  describe('load a cached config file', () => {
    const configFilePath = process.cwd() + '/test/data/solo-test-1.config'
    const cm = new ConfigManager(testLogger, configFilePath)
    cm.load()

    it('config file match: dev=false', () => {
      expect(cm.config.flags[flags.devMode.name]).to.not.be.ok
    })

    it('config file match: namespace=solo-user', () => {
      expect(cm.config.flags[flags.namespace.name]).to.equal('solo-user')
    })

    it('config file match: chartDirectory is empty', () => {
      expect(cm.config.flags[flags.chartDirectory.name]).to.equal('')
    })

    it('config file match: clusterName=kind-kind', () => {
      expect(cm.config.flags[flags.clusterName.name]).to.equal('kind-kind')
    })

    it('config file match: deployPrometheusStack=false', () => {
      expect(cm.config.flags[flags.deployPrometheusStack.name]).to.not.be.ok
    })

    it('config file match: deployMinio=false', () => {
      expect(cm.config.flags[flags.deployMinio.name]).to.not.be.ok
    })

    it('config file match: deployCertManager=false', () => {
      expect(cm.config.flags[flags.deployCertManager.name]).to.not.be.ok
    })

    it('config file match: deployCertManagerCrds=false', () => {
      expect(cm.config.flags[flags.deployCertManagerCrds.name]).to.not.be.ok
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.enablePrometheusSvcMonitor.name]).to.be.undefined
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.enableHederaExplorerTls.name]).to.be.undefined
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.hederaExplorerTlsHostName.name]).to.be.undefined
    })

    it('not set, it should be undefined', () => {
      expect(cm.config.flags[flags.deletePvcs.name]).to.be.undefined
    })
  })

  describe('handle argv overrides', () => {
    const configFilePath = process.cwd() + '/test/data/solo-test-2.config'
    const cm = new ConfigManager(testLogger, configFilePath)
    const cachedConfig = yamlToObject(process.cwd() + '/test/data/solo-test-2.config')

    it('override config using argv', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).to.equal(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).to.equal(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = 'new-cluster'
      argv[flags.namespace.name] = 'new-namespace'
      cm.update(argv)

      expect(cm.getFlag(flags.clusterName)).to.equal(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).to.equal(argv[flags.namespace.name])
    })

    it('config file takes precedence over empty namespace', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).to.equal(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).to.equal(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = 'new-cluster'
      argv[flags.namespace.name] = ''
      cm.update(argv)
      expect(cm.getFlag(flags.clusterName)).to.equal(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).not.to.equal(argv[flags.namespace.name])
      expect(cm.getFlag(flags.namespace)).to.equal(cachedConfig.flags[flags.namespace.name])
    })

    it('config file takes precedence over empty cluster name', () => {
      cm.load()
      expect(cm.getFlag(flags.clusterName)).to.equal(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).to.equal(cachedConfig.flags[flags.namespace.name])

      const argv = {}
      argv[flags.clusterName.name] = ''
      argv[flags.namespace.name] = 'new-namespace'
      cm.update(argv)
      expect(cm.getFlag(flags.clusterName)).not.to.equal(argv[flags.clusterName.name])
      expect(cm.getFlag(flags.clusterName)).to.equal(cachedConfig.flags[flags.clusterName.name])
      expect(cm.getFlag(flags.namespace)).to.equal(argv[flags.namespace.name])
    })
  })
})
