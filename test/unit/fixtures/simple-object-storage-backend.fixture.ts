// SPDX-License-Identifier: Apache-2.0

import {type ObjectStorageBackend} from '../../../src/data/backend/api/object-storage-backend.js';
import {type StorageOperation} from '../../../src/data/backend/api/storage-operation.js';

export class SimpleObjectStorageBackend implements ObjectStorageBackend {
  public constructor(public map: Map<string, object>) {
    if (!map) {
      throw new Error('Map is required');
    }
  }

  public readObject(key: string): Promise<object> {
    return Promise.resolve(this.map.get(key));
  }

  public writeObject(key: string, data: object): Promise<void> {
    this.map.set(key, data);
    return Promise.resolve();
  }

  public list(): Promise<string[]> {
    return Promise.resolve([...this.map.keys()]);
  }

  public readBytes(key: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from(JSON.stringify(this.map.get(key))));
  }

  public writeBytes(key: string, data: Buffer): Promise<void> {
    this.map.set(key, JSON.parse(data.toString()));
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  public isSupported(op: StorageOperation): boolean {
    return true;
  }
}
