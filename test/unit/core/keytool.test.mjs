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
import { describe, expect, it, jest } from '@jest/globals'
import { constants, Keytool, logging, Templates } from '../../../src/core/index.mjs'
import { ShellRunner } from '../../../src/core/shell_runner.mjs'

describe.each([
  { osPlatform: 'linux' },
  { osPlatform: 'windows' },
  { osPlatform: 'darwin' }
])('Keytool', (input) => {
  const logger = logging.NewLogger('debug')
  const keytool = new Keytool(logger, input.osPlatform)
  const shellSpy = jest.spyOn(ShellRunner.prototype, 'run').mockImplementation()
  const keytoolPath = Templates.installationPath(constants.KEYTOOL, input.osPlatform)

  it(`should run keytool -genkeypair [${input.osPlatform}]`, async () => {
    await keytool.genKeyPair('-alias s-node0')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -genkeypair -alias s-node0`, true)
  })

  it(`should run keytool -certreq [${input.osPlatform}]`, async () => {
    await keytool.certReq('-alias s-node0')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -certreq -alias s-node0`, true)
  })

  it(`should run keytool -gencert [${input.osPlatform}]`, async () => {
    await keytool.genCert('-alias s-node0')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -gencert -alias s-node0`, true)
  })

  it(`should run keytool -importcert [${input.osPlatform}]`, async () => {
    await keytool.importCert('-alias s-node0')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -importcert -alias s-node0`, true)
  })

  it(`should run keytool -exportcert [${input.osPlatform}]`, async () => {
    await keytool.exportCert('-alias s-node0')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -exportcert -alias s-node0`, true)
  })

  it(`should run keytool -list [${input.osPlatform}]`, async () => {
    await keytool.list('-keystore private-node0.pfx')
    expect(shellSpy).toHaveBeenCalledWith(`${keytoolPath} -list -keystore private-node0.pfx`, true)
  })
})
