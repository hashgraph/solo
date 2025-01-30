/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Namespaces {
  create(namespace: string): Promise<boolean>; // TODO was createNamespace
  delete(namespace: string): Promise<boolean>; // TODO was deleteNamespace
  list(): Promise<string[]>; // TODO was getNamespaces
  has(namespace: string): Promise<boolean>; // TODO was hasNamespace
}
