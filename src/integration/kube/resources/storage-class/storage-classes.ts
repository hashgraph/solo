// SPDX-License-Identifier: Apache-2.0

import {type StorageClass} from './storage-class.js';

export interface StorageClasses {
  /**
   * List all StorageClasses in the cluster.
   *
   * @returns a list of StorageClasses
   * @throws SoloError if failed to list StorageClasses
   */
  list(): Promise<StorageClass[]>;
}
