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
import { expect } from 'chai'
import { afterEach, beforeEach, describe, it } from 'mocha'
import each from 'mocha-each'

import { constants, Helm, logging, Templates } from '../../../src/core/index.ts'
import { ShellRunner } from '../../../src/core/shell_runner.ts'

describe('Helm platform specific tests', () => {
  each(['linux', 'windows', 'darwin'])
    .describe('Helm on %s platform', function (osPlatform) {
      const logger = logging.NewLogger('debug', true)
      const helm = new Helm(logger, osPlatform)

      /** @type {sinon.SinonStub} */let shellStub

      const helmPath = Templates.installationPath(constants.HELM, osPlatform)

      // Stub the ShellRunner.prototype.run method for all tests
      beforeEach(() => {
        shellStub = sinon.stub(ShellRunner.prototype, 'run').resolves()
      })

      // Restore stubbed methods after each test
      afterEach(() => sinon.restore())

      it('should run helm install', async () => {
        await helm.install('arg')
        expect(shellStub).to.have.been.calledWith(`${helmPath} install arg`)
      })

      it('should run helm uninstall', async () => {
        await helm.uninstall('arg')
        expect(shellStub).to.have.been.calledWith(`${helmPath} uninstall arg`)
      })

      it('should run helm upgrade', async () => {
        await helm.upgrade('release', 'chart')
        expect(shellStub).to.have.been.calledWith(`${helmPath} upgrade release chart`)
      })

      it('should run helm list', async () => {
        await helm.list()
        expect(shellStub).to.have.been.calledWith(`${helmPath} list`)
      })

      it('should run helm dependency', async () => {
        await helm.dependency('update', 'chart')
        expect(shellStub).to.have.been.calledWith(`${helmPath} dependency update chart`)
      })

      it('should run helm repo', async () => {
        await helm.repo('add', 'name', 'url')
        expect(shellStub).to.have.been.calledWith(`${helmPath} repo add name url`)
      })
    })
})
