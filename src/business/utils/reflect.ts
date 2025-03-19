// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../errors/unsupported-operation-error.js';
import {type Refreshable} from '../../data/configuration/spi/refreshable.js';
import {type ObjectStorageBackend} from '../../data/backend/api/object-storage-backend.js';

export class Reflect {
  private constructor() {
    throw new UnsupportedOperationError('utility classes and cannot be instantiated');
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements Refreshable.
   *
   * @param v - The object to check.
   * @returns true if the object implements Refreshable, false otherwise.
   * @private
   */
  public static isRefreshable(v: object): v is Refreshable {
    return typeof v === 'object' && !!v && 'refresh' in v;
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements ObjectStorageBackend.
   *
   * @param v - The object to check.
   * @returns true if the object implements ObjectStorageBackend, false otherwise.
   * @private
   */
  private static isObjectStorageBackend(v: object): v is ObjectStorageBackend {
    return typeof v === 'object' && !!v && 'readObject' in v;
  }
}
