// SPDX-License-Identifier: Apache-2.0

import {getTmpDir} from '../../../../test-util.js';
import {YamlFileStorageBackend} from '../../../../../src/data/backend/impl/yaml-file-storage-backend.js';
import {expect} from 'chai';

describe('YAML File Storage Backend', () => {
  const testName: string = 'yaml-file-storage-backend';
  const tempDir: string = getTmpDir();

  it('test writeObject', async () => {
    const key: string = `${testName}-file.yaml`;
    const backend: YamlFileStorageBackend = new YamlFileStorageBackend(tempDir);
    await backend.writeObject(key, {key: 'value'});
    const data: object = await backend.readObject(key);
    expect(data).to.be.an('object');
    expect(data).to.deep.equal({key: 'value'});
  });
});
