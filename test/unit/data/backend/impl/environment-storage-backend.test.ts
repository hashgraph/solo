// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {EnvironmentStorageBackend} from '../../../../../src/data/backend/impl/environment-storage-backend.js';
import {StorageOperation} from '../../../../../src/data/backend/api/storage-operation.js';

describe('EnvironmentStorageBackend', () => {
  before(() => {
    process.env.ENV_STORAGE_PATH = 'test';
  });

  it('test isSupported', () => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    expect(backend.isSupported(StorageOperation.List)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.WriteBytes)).to.be.false;
    expect(backend.isSupported(StorageOperation.Delete)).to.be.false;
    expect(backend.isSupported(StorageOperation.ReadObject)).to.be.false;
  });

  it('test list', async () => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    const keys: string[] = await backend.list();
    expect(keys).to.be.an('array');
    const expectedKey: string = 'ENV_STORAGE_PATH'.toLowerCase().replaceAll('_', '.');
    expect(keys.filter(key => key === expectedKey)).to.have.lengthOf(1);
  });
});
