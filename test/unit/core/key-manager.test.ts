// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import fs from 'fs';
import os from 'os';
import path from 'path';
import {type KeyManager} from '../../../src/core/key-manager.js';
import * as constants from '../../../src/core/constants.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';

describe('KeyManager', () => {
  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);

  it('should generate signing key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'));
    const nodeAlias = 'node1' as NodeAlias;
    const keyPrefix = constants.SIGNING_KEY_PREFIX;

    const signingKey = await keyManager.generateSigningKey(nodeAlias);

    const nodeKeyFiles = keyManager.prepareNodeKeyFilePaths(nodeAlias, tmpDir);
    const files = await keyManager.storeNodeKey(nodeAlias, signingKey, tmpDir, nodeKeyFiles, keyPrefix);
    expect(files.privateKeyFile).not.to.be.null;
    expect(files.certificateFile).not.to.be.null;

    const nodeKey = await keyManager.loadSigningKey(nodeAlias, tmpDir);
    expect(nodeKey.certificate.rawData.toString()).to.equal(signingKey.certificate.rawData.toString());
    expect(nodeKey.privateKey.algorithm).to.deep.equal(signingKey.privateKey.algorithm);
    expect(nodeKey.privateKey.type).to.deep.equal(signingKey.privateKey.type);

    expect(
      await signingKey.certificate.verify({
        publicKey: signingKey.certificate.publicKey,
        signatureOnly: true,
      }),
    ).to.be.true;

    fs.rmSync(tmpDir, {recursive: true});
  });

  it('should generate TLS key', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'));
    const nodeAlias = 'node1';

    const tlsKey = await keyManager.generateGrpcTlsKey(nodeAlias);
    expect(tlsKey.certificate.subject).not.to.equal('');
    expect(tlsKey.certificate.issuer).not.to.equal('');

    const files = await keyManager.storeTLSKey(nodeAlias, tlsKey, tmpDir);
    expect(files.privateKeyFile).not.to.be.null;
    expect(files.certificateFile).not.to.be.null;

    const nodeKey = await keyManager.loadTLSKey(nodeAlias, tmpDir);
    expect(nodeKey.certificate.subject).to.deep.equal(tlsKey.certificate.subject);
    expect(nodeKey.certificate.issuer).to.deep.equal(tlsKey.certificate.issuer);
    expect(nodeKey.certificate.rawData.toString()).to.deep.equal(tlsKey.certificate.rawData.toString());
    expect(nodeKey.privateKey.algorithm).to.deep.equal(tlsKey.privateKey.algorithm);
    expect(nodeKey.privateKey.type).to.deep.equal(tlsKey.privateKey.type);

    expect(
      await tlsKey.certificate.verify({
        publicKey: tlsKey.certificate.publicKey,
        signatureOnly: true,
      }),
    ).to.be.true;

    fs.rmSync(tmpDir, {recursive: true});
  }).timeout(Duration.ofSeconds(20).toMillis());
});
