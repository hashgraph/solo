// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {FileStorageBackend} from '../../../../../src/data/backend/impl/file-storage-backend.js';
import {getTmpDir} from '../../../../test-util.js';
import path from 'path';
import fs from 'fs';
import {StorageOperation} from '../../../../../src/data/backend/api/storage-operation.js';

describe('File Storage Backend', () => {
  const testName: string = 'file-storage-backend';
  const tempDir: string = getTmpDir();

  it('test empty string constructor', () => {
    expect(() => {
      new FileStorageBackend('');
    }).to.throw('basePath must not be null, undefined or empty');
  });

  it('test path that does not exist', () => {
    expect(() => {
      new FileStorageBackend('/path/does/not/exist');
    }).to.throw('basePath must exist and be valid');
  });

  it('test path that is not a directory', () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file.txt`);
    fs.writeFileSync(temporaryFile, 'test');
    expect(() => {
      new FileStorageBackend(temporaryFile);
    }).to.throw(`basePath must be a valid directory: ${temporaryFile}`);
  });

  it('test isSupported', () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    expect(backend.isSupported(StorageOperation.List)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.WriteBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.Delete)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadObject)).to.be.false;
  });

  it('test list', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    const files: string[] = await backend.list();
    expect(files).to.be.an('array');
  });

  it('test list on new temp directory that is empty', async () => {
    const tempDir2: string = getTmpDir();
    const backend: FileStorageBackend = new FileStorageBackend(tempDir2);
    const files: string[] = await backend.list();
    expect(files).to.be.an('array');
    expect(files.length).to.equal(0);
  });

  it('test readBytes', async () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file2.txt`);
    fs.writeFileSync(temporaryFile, 'test');
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    const data: Uint8Array = await backend.readBytes(`${testName}-file2.txt`);
    expect(Buffer.from(data.buffer).toString()).to.equal('test');
  });

  it('test readBytes with empty key', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.readBytes('')).to.be.rejectedWith('key must not be null, undefined or empty');
  });

  it('test readBytes with non-existent file', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.readBytes('non-existent-file.txt')).to.be.rejectedWith('error reading file');
  });

  it('test writeBytes', async () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file3.txt`);
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await backend.writeBytes(`${testName}-file3.txt`, new Uint8Array(Buffer.from('test')));
    expect(fs.readFileSync(temporaryFile, 'utf-8')).to.equal('test');
  });

  it('test writeBytes with empty key', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.writeBytes('', new Uint8Array(Buffer.from('test')))).to.be.rejectedWith(
      'key must not be null, undefined or empty',
    );
  });

  it('test writeBytes with null data', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.writeBytes('test', null)).to.be.rejectedWith('data must not be null');
  });

  it('test writeBytes with a file that already exists as a directory', async () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file-dir`);
    fs.mkdirSync(temporaryFile);
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.writeBytes(`${testName}-file-dir`, new Uint8Array(Buffer.from('test')))).to.be.rejectedWith(
      'error writing file',
    );
  });

  it('test delete', async () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file4.txt`);
    fs.writeFileSync(temporaryFile, 'test');
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await backend.delete(`${testName}-file4.txt`);
    expect(fs.existsSync(temporaryFile)).to.be.false;
  });

  it('test delete with empty key', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.delete('')).to.be.rejectedWith('key must not be null, undefined or empty');
  });

  it('test delete with non-existent file', async () => {
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.delete('non-existent-file.txt')).to.be.rejectedWith('file not found');
  });

  it('test delete with a directory as key', async () => {
    const temporaryFile: string = path.join(tempDir, `${testName}-file-dir2`);
    fs.mkdirSync(temporaryFile);
    const backend: FileStorageBackend = new FileStorageBackend(tempDir);
    await expect(backend.delete(`${testName}-file-dir2`)).to.be.rejectedWith('path is not a file');
  });
});
