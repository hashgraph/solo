/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Optional} from '../../types/index.js';

export default interface Secrets {
  create(
    namespace: string,
    name: string,
    secretType: string,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    recreate: boolean,
  ): Promise<boolean>; // TODO was createSecret
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deleteSecret
  listByLabel(namespace: string, labels: string[]): Promise<any>; // TODO was getSecretsByLabel(labels: string[]): Promise<any>
  // TODO consolidate getSecret into listByLabel
  // TODO consolidatelistSecretsByNamespace into listByLabel
}
