// SPDX-License-Identifier: Apache-2.0

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../../business/utils/path-ex.js';
import {KubeContainerInvalidPathError} from '../../errors/kube-container-invalid-path-error.js';
import {KubeIllegalArgumentError} from '../../errors/kube-illegal-argument-error.js';

interface ResumableCopyChunk {
  readonly checksum: string;
  readonly length: number;
  readonly path: string;
}

export class ResumableCopySource {
  private constructor(
    public readonly sourcePath: string,
    public readonly sourceSize: number,
    public readonly sourceChecksum: string,
    public readonly chunks: readonly ResumableCopyChunk[],
    private readonly temporaryDirectory: string,
  ) {}

  public static create(sourcePath: string, chunkSizeBytes: number): ResumableCopySource {
    if (!Number.isSafeInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
      throw new KubeIllegalArgumentError('chunk size must be a positive safe integer');
    }

    let sourceHandle: number;
    try {
      sourceHandle = fs.openSync(sourcePath, 'r');
    } catch (error) {
      const errorCode: string | undefined = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (errorCode === 'ENOENT') {
        throw new KubeContainerInvalidPathError('source', sourcePath);
      }
      throw error;
    }

    let sourceSize: number;
    let temporaryDirectory: string;
    try {
      sourceSize = fs.fstatSync(sourceHandle).size;
      temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-resumable-copy-'));
    } catch (error) {
      fs.closeSync(sourceHandle);
      throw error;
    }
    const sourceChecksum: crypto.Hash = crypto.createHash('sha256');
    const chunks: ResumableCopyChunk[] = [];
    const buffer: Buffer = Buffer.allocUnsafe(Math.min(16 * 1024 * 1024, chunkSizeBytes));
    let sourcePosition: number = 0;

    try {
      const chunkCount: number = Math.ceil(sourceSize / chunkSizeBytes);
      for (let chunkIndex: number = 0; chunkIndex < chunkCount; chunkIndex++) {
        const chunkLength: number = Math.min(chunkSizeBytes, sourceSize - chunkIndex * chunkSizeBytes);
        const chunkPath: string = PathEx.join(temporaryDirectory, `chunk-${chunkIndex.toString().padStart(6, '0')}`);
        const chunkHandle: number = fs.openSync(chunkPath, 'w');
        const chunkChecksum: crypto.Hash = crypto.createHash('sha256');
        let remaining: number = chunkLength;

        try {
          while (remaining > 0) {
            const bytesToRead: number = Math.min(buffer.length, remaining);
            const bytesRead: number = fs.readSync(sourceHandle, buffer, 0, bytesToRead, sourcePosition);
            if (bytesRead === 0) {
              throw new KubeIllegalArgumentError(`source file ended before chunk ${chunkIndex} was complete`);
            }
            fs.writeSync(chunkHandle, buffer, 0, bytesRead);
            sourceChecksum.update(buffer.subarray(0, bytesRead));
            chunkChecksum.update(buffer.subarray(0, bytesRead));
            sourcePosition += bytesRead;
            remaining -= bytesRead;
          }
        } finally {
          fs.closeSync(chunkHandle);
        }

        chunks.push({checksum: chunkChecksum.digest('hex'), length: chunkLength, path: chunkPath});
      }
    } catch (error) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      throw error;
    } finally {
      fs.closeSync(sourceHandle);
    }

    return new ResumableCopySource(sourcePath, sourceSize, sourceChecksum.digest('hex'), chunks, temporaryDirectory);
  }

  public dispose(): void {
    fs.rmSync(this.temporaryDirectory, {recursive: true, force: true});
  }
}
