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

import { constants, Keytool, logging, Templates } from '../../../src/core/index.mjs'
import { ShellRunner } from '../../../src/core/shell_runner.mjs'

/** @type {NodeJS.Platform[]} */ const platforms = ['linux', 'windows', 'darwin']

describe('Keytool', () => {
  platforms.forEach((osPlatform) => {
    describe(`Keytool tests on ${osPlatform}`, () => {
      /** @type {sinon.SinonStub} */ let shellStub
      const logger = logging.NewLogger('debug', true)
      const keytool = new Keytool(logger, osPlatform)
      const keytoolPath = Templates.installationPath(constants.KEYTOOL, osPlatform)

      beforeEach(() => {
        shellStub = sinon.stub(ShellRunner.prototype, 'run').resolves()
      })
      afterEach(() => sinon.restore())

      it(`should run keytool -genkeypair on ${osPlatform}`, async () => {
        await keytool.genKeyPair('-alias s-node1')
        expect(shellStub).to.have.been.calledWith(`${keytoolPath} -genkeypair -alias s-node1`, true)
      })

      it(`should run keytool -certreq on ${osPlatform}`, async () => {
        await keytool.certReq('-alias s-node1')
        expect(shellStub).to.have.been.calledWith(`${keytoolPath} -certreq -alias s-node1`, true)
      })

      it(`should run keytool -gencert on ${osPlatform}`, async () => {
        await keytool.genCert('-alias s-node1')
        expect(shellStub).to.have.been.calledWith(`${keytoolPath} -gencert -alias s-node1`, true)
      })

      it(`should run keytool -importcert on ${osPlatform}`, async () => {
        await keytool.importCert('-alias s-node1')
        expect(shellStub).to.have.been.calledWith(`${keytoolPath} -importcert -alias s-node1`, true)
      })

      it(`should run keytool -exportcert on ${osPlatform}`, async () => {
        await keytool.exportCert('-alias s-node1')
        expect(shellStub).to.have.been.calledWith(`${keytoolPath} -exportcert -alias s-node1`, true)
      })
    })
  })
})
