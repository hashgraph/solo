/**
 * SPDX-License-Identifier: Apache-2.0
 */
export default interface Pvcs {
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deletePvc
  list(namespace: string, labels: string[]): Promise<string[]>; // TODO was listPvcsByNamespace
}
