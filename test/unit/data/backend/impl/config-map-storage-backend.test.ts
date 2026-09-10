// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {ConfigMapStorageBackend} from '../../../../../src/data/backend/impl/config-map-storage-backend.js';
import {StorageOperation} from '../../../../../src/data/backend/api/storage-operation.js';
import {StorageBackendError} from '../../../../../src/data/backend/api/storage-backend-error.js';
import {type ConfigMap} from '../../../../../src/integration/kube/resources/config-map/config-map.js';
import {K8ClientConfigMap} from '../../../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-map.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';

describe('ConfigMapStorageBackend', (): void => {
  let configMap: ConfigMap;
  let backend: ConfigMapStorageBackend;

  beforeEach((): void => {
    configMap = new K8ClientConfigMap(
      NamespaceName.of('test-ns'),
      'name',
      {label1: 'why', label2: 'not'},
      {foo: 'bar', baz: 'qux'},
    );
    backend = new ConfigMapStorageBackend(configMap);
  });

  it('should throw if configMap is missing', (): void => {
    expect((): ConfigMapStorageBackend => new ConfigMapStorageBackend(undefined)).to.throw(
      'ConfigMapStorageBackend is missing the configMap argument',
    );
  });

  describe('delete', (): void => {
    it('should delete a key', async (): Promise<void> => {
      await backend.delete('foo');
      expect(configMap.data).to.not.have.property('foo');
    });
    it('should throw if key not found', async (): Promise<void> => {
      await expect(backend.delete('notfound')).to.be.rejectedWith('key: notfound not found in config map');
    });
    it('should trigger unexpected errors in delete', async (): Promise<void> => {
      // Simulate configMap.data throwing an unexpected error
      const badBackend: ConfigMapStorageBackend = new ConfigMapStorageBackend({
        get data(): void {
          throw new Error('unexpected');
        },
        name: '',
        namespace: undefined,
      } as never);
      await expect(badBackend.delete('foo')).to.be.rejectedWith('error deleting config map data key: foo');
    });
  });

  describe('isSupported', (): void => {
    it('should return true for supported operations', (): void => {
      expect(backend.isSupported(StorageOperation.List)).to.be.true;
      expect(backend.isSupported(StorageOperation.ReadBytes)).to.be.true;
      expect(backend.isSupported(StorageOperation.WriteBytes)).to.be.true;
      expect(backend.isSupported(StorageOperation.Delete)).to.be.true;
    });
    it('should return false for unsupported operations', (): void => {
      expect(backend.isSupported(StorageOperation.ReadObject)).to.be.false;
    });
  });

  describe('list', (): void => {
    it('should return all keys in the configMap data', async (): Promise<void> => {
      const keys: string[] = await backend.list();
      expect(keys).to.have.members(['foo', 'baz']);
    });
    it('should return an empty array if data is missing', async (): Promise<void> => {
      backend = new ConfigMapStorageBackend({data: undefined, name: '', namespace: undefined});
      const keys: string[] = await backend.list();
      expect(keys).to.deep.equal([]);
    });
  });

  describe('readBytes', (): void => {
    it('should return Buffer for existing key', async (): Promise<void> => {
      const buf: Buffer<ArrayBufferLike> = await backend.readBytes('foo');
      expect(buf.toString('utf8')).to.equal('bar');
    });
    it('should name the missing key instead of failing on the Buffer construction', async (): Promise<void> => {
      await expect(backend.readBytes('notfound')).to.be.rejectedWith(
        StorageBackendError,
        'config map is missing key: notfound',
      );
    });
    it('should name the missing key when the value is present but not a string', async (): Promise<void> => {
      const nonStringBackend: ConfigMapStorageBackend = new ConfigMapStorageBackend({
        data: {foo: undefined} as unknown as Record<string, string>,
        name: '',
        namespace: undefined,
      });
      await expect(nonStringBackend.readBytes('foo')).to.be.rejectedWith('config map is missing key: foo');
    });
    it('should throw if configMap.data is empty or undefined in readBytes', async (): Promise<void> => {
      const emptyBackend: ConfigMapStorageBackend = new ConfigMapStorageBackend({
        data: undefined,
        name: '',
        namespace: undefined,
      });
      await expect(emptyBackend.readBytes('foo')).to.be.rejectedWith('config map is empty: foo');
    });
    it('should trigger unexpected errors in readBytes', async (): Promise<void> => {
      const badBackend: ConfigMapStorageBackend = new ConfigMapStorageBackend({
        get data(): void {
          throw new Error('unexpected');
        },
        name: '',
        namespace: undefined,
      } as never);
      await expect(badBackend.readBytes('foo')).to.be.rejectedWith('error reading config map: foo');
    });
  });

  describe('writeBytes', (): void => {
    it('should write buffer data to the configMap', async (): Promise<void> => {
      const buf: Buffer<ArrayBuffer> = Buffer.from('new-value', 'utf8');
      await backend.writeBytes('foo', buf);
      expect(configMap.data.foo).to.equal('new-value');
    });
    it('should add new key if not present', async (): Promise<void> => {
      const buf: Buffer<ArrayBuffer> = Buffer.from('another', 'utf8');
      await backend.writeBytes('new-key', buf);
      expect(configMap.data['new-key']).to.equal('another');
    });
    it('should throw if data is missing', async (): Promise<void> => {
      backend = new ConfigMapStorageBackend({data: undefined, name: '', namespace: undefined});
      const buf: Buffer<ArrayBuffer> = Buffer.from('something', 'utf8');
      await expect(backend.writeBytes('foo', buf)).to.be.rejectedWith(StorageBackendError);
    });
    it('should trigger unexpected errors in writeBytes', async (): Promise<void> => {
      const badBackend: ConfigMapStorageBackend = new ConfigMapStorageBackend({
        get data(): void {
          throw new Error('unexpected');
        },
        name: '',
        namespace: undefined,
      } as never);
      const buf: Buffer<ArrayBuffer> = Buffer.from('fail', 'utf8');
      await expect(badBackend.writeBytes('foo', buf)).to.be.rejectedWith('error writing config map: foo');
    });
  });
});
