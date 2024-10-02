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
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { constants, logging, KeyManager } from '../../../src/core/index.mjs'

describe('KeyManager', () => {
  const logger = logging.NewLogger('debug', true)
  const keyManager = new KeyManager(logger)

  it('should generate signing key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
    const nodeAlias = 'node1'
    const keyPrefix = constants.SIGNING_KEY_PREFIX

    const signingKey = await keyManager.generateSigningKey(nodeAlias)

    const nodeKeyFiles = keyManager.prepareNodeKeyFilePaths(nodeAlias, tmpDir, constants.SIGNING_KEY_PREFIX)
    const files = await keyManager.storeNodeKey(nodeAlias, signingKey, tmpDir, nodeKeyFiles, keyPrefix)
    expect(files.privateKeyFile).not.toBeNull()
    expect(files.certificateFile).not.toBeNull()

    const nodeKey = await keyManager.loadSigningKey(nodeAlias, tmpDir, KeyManager.SigningKeyAlgo, keyPrefix)
    expect(nodeKey.certificate).toStrictEqual(signingKey.certificate)
    expect(nodeKey.privateKeyPem).toStrictEqual(signingKey.privateKeyPem)
    expect(nodeKey.certificatePem).toStrictEqual(signingKey.certificatePem)
    expect(nodeKey.privateKey.algorithm).toStrictEqual(signingKey.privateKey.algorithm)
    expect(nodeKey.privateKey.type).toStrictEqual(signingKey.privateKey.type)

    await expect(signingKey.certificate.verify({
      publicKey: signingKey.certificate.publicKey,
      signatureOnly: true
    })).resolves.toBeTruthy()

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should generate TLS key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
    const nodeAlias = 'node1'
    const keyName = 'TLS'

    const tlsKey = await keyManager.generateGrpcTLSKey(nodeAlias)
    expect(tlsKey.certificate.subject).not.toBe('')
    expect(tlsKey.certificate.issuer).not.toBe('')

    const files = await keyManager.storeTLSKey(nodeAlias, tlsKey, tmpDir)
    expect(files.privateKeyFile).not.toBeNull()
    expect(files.certificateFile).not.toBeNull()

    const nodeKey = await keyManager.loadTLSKey(nodeAlias, tmpDir, KeyManager.TLSKeyAlgo, keyName)
    expect(nodeKey.certificate.subject).toStrictEqual(tlsKey.certificate.subject)
    expect(nodeKey.certificate.issuer).toStrictEqual(tlsKey.certificate.issuer)
    expect(nodeKey.certificate).toStrictEqual(tlsKey.certificate)
    expect(nodeKey.privateKeyPem).toStrictEqual(tlsKey.privateKeyPem)
    expect(nodeKey.certificatePem).toStrictEqual(tlsKey.certificatePem)
    expect(nodeKey.privateKey.algorithm).toStrictEqual(tlsKey.privateKey.algorithm)
    expect(nodeKey.privateKey.type).toStrictEqual(tlsKey.privateKey.type)

    await expect(tlsKey.certificate.verify({
      publicKey: tlsKey.certificate.publicKey,
      signatureOnly: true
    })).resolves.toBeTruthy()

    fs.rmSync(tmpDir, { recursive: true })
  }, 20000)
})
