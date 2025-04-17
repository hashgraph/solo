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

  it('list with no process.env', async () => {
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      delete process.env;
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
      const keys: string[] = await backend.list();
      expect(keys).to.be.an('array');
      expect(keys).to.have.lengthOf(0);
    } catch {
      expect.fail();
    } finally {
      process.env = environment;
    }
  });

  it('readBytes from environment variable with prefix', async () => {
    process.env.ENV_TEST_NBR1 = '42';
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('env');
    const data: string = Buffer.from(await backend.readBytes('test.nbr1')).toString();
    expect(data).to.be.a('string');
    expect(data).to.equal('42');
  });

  it('readBytes from environment variable', async () => {
    process.env.ENV_TEST_NBR1 = '42';
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    const data: string = Buffer.from(await backend.readBytes('env.test.nbr1')).toString();
    expect(data).to.be.a('string');
    expect(data).to.equal('42');
  });

  it('readBytes with empty key', async () => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.readBytes('');
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('key must not be null, undefined, or empty');
    }
  });

  it('readBytes with no process.env', async () => {
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      delete process.env;
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
      try {
        await backend.readBytes('test');
        expect.fail();
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('key not found');
      }
    } catch {
      expect.fail();
    } finally {
      process.env = environment;
    }
  });

  it('writeBytes', async () => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.writeBytes('test', Buffer.from('test'));
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('writeBytes is not supported by the environment storage backend');
    }
  });

  it('delete', async () => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.delete('test');
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('delete is not supported by the environment storage backend');
    }
  });
});
