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
import sinon from 'sinon'
import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'

import { NodeCommand } from '../../../src/commands/node/index.js'

const getBaseCommandOpts = () => ({
  logger: sinon.stub(),
  helm: sinon.stub(),
  k8: sinon.stub(),
  chartManager: sinon.stub(),
  configManager: sinon.stub(),
  depManager: sinon.stub(),
  localConfig: sinon.stub()
})

describe('NodeCommand unit tests', () => {
  describe('constructor error handling', () => {
    let opts: any

    beforeEach(() => { opts = getBaseCommandOpts() })

    it('should throw an error if platformInstaller is not provided', () => {
      opts.downloader = sinon.stub()
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/PlatformInstaller is required')
    })

    it('should throw an error if keyManager is not provided', () => {
      opts.downloader = sinon.stub()
      opts.platformInstaller = sinon.stub()
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/KeyManager is required')
    })

    it('should throw an error if accountManager is not provided', () => {
      opts.downloader = sinon.stub()
      opts.platformInstaller = sinon.stub()
      opts.keyManager = sinon.stub()
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/AccountManager is required')
    })
  })
})
