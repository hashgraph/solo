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
import { after, afterEach, before, beforeEach, describe, it } from 'mocha'

import { CertificateManager, ConfigManager, K8 } from '../../../src/core/index.ts'
import jest from 'jest-mock'
import { flags } from '../../../src/commands/index.ts'
import { testLogger } from '../../test_util.ts'
import {MissingArgumentError, SoloError} from '../../../src/core/errors.ts';
import { type NodeAlias} from '../../../src/types/aliases.ts'
import {CertificateTypes} from "../../../src/core/enumerations.js";

describe('Certificate Manager', () => {

  const argv = {}
  // @ts-ignore
  const k8InitSpy = jest.spyOn(K8.prototype, 'init').mockImplementation(() => {})
  const k8CreateSecret = jest.spyOn(K8.prototype, 'createSecret').mockResolvedValue(true)
  let k8: K8
  let certificateManager: CertificateManager

  before(() => {
    argv[flags.namespace.name] = 'namespace'
    const configManager = new ConfigManager(testLogger)
    configManager.update(argv)
    k8 = new K8(configManager, testLogger)
    certificateManager = new CertificateManager(k8, testLogger, configManager)
  })

  after(() => {
    k8InitSpy.mockRestore()
    k8CreateSecret.mockRestore()
  })

  it ('should throw if and error if nodeAlias is not provided', async () => {
    // @ts-ignore to access private method
    await expect(certificateManager.copyTlsCertificate('' as NodeAlias, '', CertificateTypes.GRPC))
      .to.be.rejectedWith(MissingArgumentError, 'nodeAlias is required')
  })


  it ('should throw if and error if cert is not provided', async () => {
    // @ts-ignore to access private method
    await expect(certificateManager.copyTlsCertificate('node1', '', CertificateTypes.GRPC))
      .to.be.rejectedWith(MissingArgumentError, 'cert is required')
  })

  it ('should throw if and error if type is not provided', async () => {
    // @ts-ignore to access private method
    await expect(certificateManager.copyTlsCertificate('node1', '/etc/path', null))
      .to.be.rejectedWith(MissingArgumentError, 'type is required')
  })


  it ('should throw if and error if type is not valid', () => {
    const path = '/invalid/path'
    // @ts-ignore to access private method
    expect(certificateManager.copyTlsCertificate('node1', path, CertificateTypes.GRPC))
      .to.be.rejectedWith(SoloError, `certificate path doesn't exists - ${path}`)
  })
})
