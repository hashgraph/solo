// SPDX-License-Identifier: Apache-2.0

import {getTmpDir} from '../../../../test-util.js';
import {YamlFileStorageBackend} from '../../../../../src/data/backend/impl/yaml-file-storage-backend.js';
import {expect} from 'chai';
import path from 'path';
import fs from 'fs';

describe('YAML File Storage Backend', () => {
  const testName: string = 'yaml-file-storage-backend';
  const tempDir: string = getTmpDir();

  it('test readObject and writeObject', async () => {
    const key: string = `${testName}-file.yaml`;
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    await backend.writeObject(key, {key: 'value'});
    const data: object = await backend.readObject(key);
    expect(data).to.be.an('object');
    expect(data).to.deep.equal({key: 'value'});
  });

  it('test readObject with empty file', async () => {
    const key: string = `${testName}-file2.yaml`;
    const temporaryFile: string = path.join(tempDir, key);
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    fs.writeFileSync(temporaryFile, '');
    await expect(backend.readObject(key)).to.be.rejectedWith('file is empty');
  });
});
