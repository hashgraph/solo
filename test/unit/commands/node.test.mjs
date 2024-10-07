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
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals'

import { NodeCommand } from '../../../src/commands/node/index.mjs'

function getBaseCommandOpts () {
  const opts = {}
  opts.logger = jest.fn()
  opts.helm = jest.fn()
  opts.k8 = jest.fn()
  opts.chartManager = jest.fn()
  opts.configManager = jest.fn()
  opts.depManager = jest.fn()
  return opts
}

describe('NodeCommand unit tests', () => {
  describe('constructor error handling', () => {
    let opts

    beforeEach(() => {
      opts = getBaseCommandOpts()
    })

    it('should throw an error if downloader is not provided', () => {
      expect(() => new NodeCommand(opts)).toThrow('An instance of core/PackageDownloader is required')
    })

    it('should throw an error if platformInstaller is not provided', () => {
      opts.downloader = jest.fn()
      expect(() => new NodeCommand(opts)).toThrow('An instance of core/PlatformInstaller is required')
    })

    it('should throw an error if keyManager is not provided', () => {
      opts.downloader = jest.fn()
      opts.platformInstaller = jest.fn()
      expect(() => new NodeCommand(opts)).toThrow('An instance of core/KeyManager is required')
    })

    it('should throw an error if accountManager is not provided', () => {
      opts.downloader = jest.fn()
      opts.platformInstaller = jest.fn()
      opts.keyManager = jest.fn()
      expect(() => new NodeCommand(opts)).toThrow('An instance of core/AccountManager is required')
    })

    it('should throw an error if keytoolDepManager is not provided', () => {
      opts.downloader = jest.fn()
      opts.platformInstaller = jest.fn()
      opts.keyManager = jest.fn()
      opts.accountManager = jest.fn()
      expect(() => new NodeCommand(opts)).toThrow('An instance of KeytoolDependencyManager is required')
    })
  })
})
