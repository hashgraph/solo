/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './namespace/namespace_name.js';

export interface ObjectMeta {
  readonly namespace?: NamespaceName;
  readonly name: string;
  readonly labels?: {[key: string]: string};
  readonly annotations?: {[key: string]: string};
  readonly uid?: string;
}
