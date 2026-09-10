// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {FileStorageBackend} from '../../../../../src/data/backend/impl/file-storage-backend.js';
import {getTemporaryDirectory} from '../../../../test-utility.js';
import fs from 'node:fs';
import {StorageOperation} from '../../../../../src/data/backend/api/storage-operation.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';

describe('File Storage Backend', (): void => {
  const testName: string = 'file-storage-backend';
  const temporaryDirectory: string = getTemporaryDirectory();

  it('test empty string constructor', (): void => {
    expect((): void => {
      new FileStorageBackend('');
    }).to.throw('basePath must not be null, undefined or empty');
  });

  it('test path that does not exist', (): void => {
    expect((): void => {
      new FileStorageBackend('/path/does/not/exist');
    }).to.throw('basePath must exist and be valid');
  });

  it('test path that is not a directory', (): void => {
    const temporaryFile: string = PathEx.join(temporaryDirectory, `${testName}-file.txt`);
    fs.writeFileSync(temporaryFile, 'test');
    expect((): void => {
      new FileStorageBackend(temporaryFile);
    }).to.throw(`basePath must be a valid directory: ${temporaryDirectory}`);
  });

  it('test isSupported', (): void => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    expect(backend.isSupported(StorageOperation.List)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.WriteBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.Delete)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadObject)).to.be.false;
  });

  it('test list', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    const files: string[] = await backend.list();
    expect(files).to.be.an('array');
  });

  it('test list on new temp directory that is empty', async (): Promise<void> => {
    const temporaryDirectory1: string = getTemporaryDirectory();
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory1);
    const files: string[] = await backend.list();
    expect(files).to.be.an('array');
    expect(files.length).to.equal(0);
  });

  it('test readBytes', async (): Promise<void> => {
    const key: string = `${testName}-file2.txt`;
    const temporaryFile: string = PathEx.join(temporaryDirectory, key);
    fs.writeFileSync(temporaryFile, 'test');
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    const data: Buffer = await backend.readBytes(key);
    expect(data.toString('utf8')).to.equal('test');
  });

  it('test readBytes with empty key', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.readBytes('')).to.be.rejectedWith('key must not be null, undefined or empty');
  });

  it('test readBytes with non-existent file', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.readBytes('non-existent-file.txt')).to.be.rejectedWith('error reading file');
  });

  it('test writeBytes', async (): Promise<void> => {
    const key: string = `${testName}-file3.txt`;
    const temporaryFile: string = PathEx.join(temporaryDirectory, key);
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await backend.writeBytes(key, Buffer.from('test', 'utf8'));
    expect(fs.readFileSync(temporaryFile, 'utf8')).to.equal('test');
  });

  it('replaces existing file contents without leaving temporary files behind', async (): Promise<void> => {
    const key: string = `${testName}-atomic-write.txt`;
    const targetFilePath: string = PathEx.join(temporaryDirectory, key);
    fs.writeFileSync(targetFilePath, 'old-value');

    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await backend.writeBytes(key, Buffer.from('new-value', 'utf8'));

    expect(fs.readFileSync(targetFilePath, 'utf8')).to.equal('new-value');
    expect(fs.readdirSync(temporaryDirectory).filter((entry: string): boolean => entry.includes('.solo-write-'))).to.be
      .empty;
  });

  it('test writeBytes with empty key', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.writeBytes('', Buffer.from('test', 'utf8'))).to.be.rejectedWith(
      'key must not be null, undefined or empty',
    );
  });

  it('test writeBytes with null data', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.writeBytes('test', null)).to.be.rejectedWith('data must not be null');
  });

  it('test writeBytes with a file that already exists as a directory', async (): Promise<void> => {
    const key: string = `${testName}-file-dir`;
    const temporaryFile: string = PathEx.join(temporaryDirectory, key);
    fs.mkdirSync(temporaryFile);
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.writeBytes(key, Buffer.from('test', 'utf8'))).to.be.rejectedWith('error writing file');
    expect(fs.readdirSync(temporaryDirectory).filter((entry: string): boolean => entry.includes('.solo-write-'))).to.be
      .empty;
  });

  it('test delete', async (): Promise<void> => {
    const key: string = `${testName}-file4.txt`;
    const temporaryFile: string = PathEx.join(temporaryDirectory, key);
    fs.writeFileSync(temporaryFile, 'test');
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await backend.delete(key);
    expect(fs.existsSync(temporaryFile)).to.be.false;
  });

  it('test delete with empty key', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.delete('')).to.be.rejectedWith('key must not be null, undefined or empty');
  });

  it('test delete with non-existent file', async (): Promise<void> => {
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.delete('non-existent-file.txt')).to.be.rejectedWith('file not found');
  });

  it('test delete with a directory as key', async (): Promise<void> => {
    const key: string = `${testName}-file-dir2`;
    const temporaryFile: string = PathEx.join(temporaryDirectory, key);
    fs.mkdirSync(temporaryFile);
    const backend: FileStorageBackend = new FileStorageBackend(temporaryDirectory);
    await expect(backend.delete(key)).to.be.rejectedWith('path is not a file');
  });
});
