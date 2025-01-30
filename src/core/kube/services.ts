/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Service} from '@kubernetes/client-node';

export default interface Services {
  read(namespace: string, name: string): Promise<V1Service>; // TODO was getSvcByName
}
