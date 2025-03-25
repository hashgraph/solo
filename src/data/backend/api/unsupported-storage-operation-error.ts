// SPDX-License-Identifier: Apache-2.0

import {StorageBackendError} from './storage-backend-error.js';

export class UnsupportedStorageOperationError extends StorageBackendError {
  public constructor(message: string, cause?: Error, meta?: object) {
    super(message, cause, meta);
  }
}
