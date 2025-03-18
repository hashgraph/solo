// SPDX-License-Identifier: Apache-2.0

import {getTmpDir} from '../../../../test-util.js';
import {YamlFileStorageBackend} from '../../../../../src/data/backend/impl/yaml-file-storage-backend.js';
import {expect} from 'chai';
import fs from 'fs';
import {PathEx} from '../../../../../src/core/util/path-ex.js';

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
    const temporaryFile: string = PathEx.join(tempDir, key);
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    fs.writeFileSync(temporaryFile, '');
    await expect(backend.readObject(key)).to.be.rejectedWith('file is empty');
  });

  it('test readObject with invalid yaml file', async () => {
    const key: string = `${testName}-file3.yaml`;
    const temporaryFile: string = PathEx.join(tempDir, key);
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    fs.writeFileSync(temporaryFile, 'playing_playlist: {{ action }} playlist {{ playlist_name }}');
    await expect(backend.readObject(key)).to.be.rejectedWith('error parsing yaml file');
  });

  it('test writeObject with null data', async () => {
    const key: string = `${testName}-file4.yaml`;
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    await expect(backend.writeObject(key, null)).to.be.rejectedWith('data must not be null');
  });

  it('test writeObject with invalid key', async () => {
    const key: string = '';
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    await expect(backend.writeObject(key, {key: 'value'})).to.be.rejectedWith('error writing yaml file');
  });
});
