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
import fs from 'fs'
import os from 'os'
import path from 'path'
import { constants, logging, KeyManager } from '../../../src/core/index.mjs'

describe('KeyManager', () => {
  const logger = logging.NewLogger('debug', true)
  const keyManager = new KeyManager(logger)

  it('should generate signing key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
    const nodeId = 'node1'
    const keyPrefix = constants.SIGNING_KEY_PREFIX

    const signingKey = await keyManager.generateSigningKey(nodeId)

    const nodeKeyFiles = keyManager.prepareNodeKeyFilePaths(nodeId, tmpDir, constants.SIGNING_KEY_PREFIX)
    const files = await keyManager.storeNodeKey(nodeId, signingKey, tmpDir, nodeKeyFiles, keyPrefix)
    expect(files.privateKeyFile).not.to.be.null
    expect(files.certificateFile).not.to.be.null

    const nodeKey = await keyManager.loadSigningKey(nodeId, tmpDir, KeyManager.SigningKeyAlgo, keyPrefix)
    expect(nodeKey.certificate).to.deep.equal(signingKey.certificate)
    expect(nodeKey.privateKeyPem).to.deep.equal(signingKey.privateKeyPem)
    expect(nodeKey.certificatePem).to.deep.equal(signingKey.certificatePem)
    expect(nodeKey.privateKey.algorithm).to.deep.equal(signingKey.privateKey.algorithm)
    expect(nodeKey.privateKey.type).to.deep.equal(signingKey.privateKey.type)

    await expect(signingKey.certificate.verify({
      publicKey: signingKey.certificate.publicKey,
      signatureOnly: true
    })).to.eventually.be.ok

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should generate TLS key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
    const nodeId = 'node1'
    const keyName = 'TLS'

    const tlsKey = await keyManager.generateGrpcTLSKey(nodeId)
    expect(tlsKey.certificate.subject).not.to.equal('')
    expect(tlsKey.certificate.issuer).not.to.equal('')

    const files = await keyManager.storeTLSKey(nodeId, tlsKey, tmpDir)
    expect(files.privateKeyFile).not.to.be.null
    expect(files.certificateFile).not.to.be.null

    const nodeKey = await keyManager.loadTLSKey(nodeId, tmpDir, KeyManager.TLSKeyAlgo, keyName)
    expect(nodeKey.certificate.subject).to.deep.equal(tlsKey.certificate.subject)
    expect(nodeKey.certificate.issuer).to.deep.equal(tlsKey.certificate.issuer)
    expect(nodeKey.certificate).to.deep.equal(tlsKey.certificate)
    expect(nodeKey.privateKeyPem).to.deep.equal(tlsKey.privateKeyPem)
    expect(nodeKey.certificatePem).to.deep.equal(tlsKey.certificatePem)
    expect(nodeKey.privateKey.algorithm).to.deep.equal(tlsKey.privateKey.algorithm)
    expect(nodeKey.privateKey.type).to.deep.equal(tlsKey.privateKey.type)

    await expect(tlsKey.certificate.verify({
      publicKey: tlsKey.certificate.publicKey,
      signatureOnly: true
    })).to.eventually.be.ok

    fs.rmSync(tmpDir, { recursive: true })
  }).timeout(20_000)
})
