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
import { describe, it } from 'mocha'

import fs from 'fs'
import os from 'os'
import path from 'path'
import { constants, logging, KeyManager } from '../../../src/core/index.ts'
import { SECONDS } from '../../../src/core/constants.ts'
import type { NodeAlias } from '../../../src/types/aliases.ts'

describe('KeyManager', () => {
  const logger = logging.NewLogger('debug', true)
  const keyManager = new KeyManager(logger)

  it('should generate signing key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
    const nodeAlias = 'node1' as NodeAlias
    const keyPrefix = constants.SIGNING_KEY_PREFIX

    const signingKey = await keyManager.generateSigningKey(nodeAlias)

    const nodeKeyFiles = keyManager.prepareNodeKeyFilePaths(nodeAlias, tmpDir, constants.SIGNING_KEY_PREFIX)
    const files = await keyManager.storeNodeKey(nodeAlias, signingKey, tmpDir, nodeKeyFiles, keyPrefix)
    expect(files.privateKeyFile).not.to.be.null
    expect(files.certificateFile).not.to.be.null

    const nodeKey = await keyManager.loadSigningKey(nodeAlias, tmpDir)
    expect(nodeKey.certificate).to.deep.equal(signingKey.certificate)
    // @ts-ignore
    expect(nodeKey.privateKeyPem).to.deep.equal(signingKey.privateKeyPem) // TODO: Can't explain this
    // @ts-ignore
    expect(nodeKey.certificatePem).to.deep.equal(signingKey.certificatePem) // TODO: Can't explain this
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
    const nodeAlias = 'node1'
    const keyName = 'TLS'

    const tlsKey = await keyManager.generateGrpcTLSKey(nodeAlias)
    expect(tlsKey.certificate.subject).not.to.equal('')
    expect(tlsKey.certificate.issuer).not.to.equal('')

    const files = await keyManager.storeTLSKey(nodeAlias, tlsKey, tmpDir)
    expect(files.privateKeyFile).not.to.be.null
    expect(files.certificateFile).not.to.be.null

    const nodeKey = await keyManager.loadTLSKey(nodeAlias, tmpDir)
    expect(nodeKey.certificate.subject).to.deep.equal(tlsKey.certificate.subject)
    expect(nodeKey.certificate.issuer).to.deep.equal(tlsKey.certificate.issuer)
    expect(nodeKey.certificate).to.deep.equal(tlsKey.certificate)
    // @ts-ignore
    expect(nodeKey.privateKeyPem).to.deep.equal(tlsKey.privateKeyPem) // TODO: Can't explain this
    // @ts-ignore
    expect(nodeKey.certificatePem).to.deep.equal(tlsKey.certificatePem )// TODO: Can't explain this
    expect(nodeKey.privateKey.algorithm).to.deep.equal(tlsKey.privateKey.algorithm)
    expect(nodeKey.privateKey.type).to.deep.equal(tlsKey.privateKey.type)

    await expect(tlsKey.certificate.verify({
      publicKey: tlsKey.certificate.publicKey,
      signatureOnly: true
    })).to.eventually.be.ok

    fs.rmSync(tmpDir, { recursive: true })
  }).timeout(20 * SECONDS)
})
