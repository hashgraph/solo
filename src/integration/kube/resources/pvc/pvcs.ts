// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type Pvc} from './pvc.js';
import {type PvcReference} from './pvc-reference.js';
import {type PvcDetail} from './pvc-detail.js';

export interface Pvcs {
  /**
   * Delete a persistent volume claim
   * @param pvcReference - the persistent volume claim reference
   * @returns true if the persistent volume claim was deleted
   * @throws {SoloError} if the persistent volume claim could not be deleted
   */
  delete(pvcReference: PvcReference): Promise<boolean>;

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   * @throws {SoloError} if the persistent volume claims could not be listed
   */
  list(namespace: NamespaceName, labels?: string[]): Promise<string[]>;

  /**
   * Get the persistent volume claims for the given namespace with their binding phase and requested
   * storage. Use this instead of {@link list} when the claim's phase or requested size matters.
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim details
   * @throws {SoloError} if the persistent volume claims could not be listed
   */
  readAll(namespace: NamespaceName, labels?: string[]): Promise<PvcDetail[]>;

  /**
   * Create a persistent volume claim
   * @param pvcReference - the persistent volume claim reference
   * @param labels - the labels to apply to the persistent volume claim
   * @param accessModes - the access modes for the persistent volume claim
   * @returns the persistent volume claim
   * @throws {SoloError} if the persistent volume claim could not be created
   */
  create(pvcReference: PvcReference, labels: Record<string, string>, accessModes: string[]): Promise<Pvc>;
}
