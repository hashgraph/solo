// SPDX-License-Identifier: Apache-2.0

import {type ObjectMeta} from '../../resources/object_meta.js';
import {type NamespaceName} from '../../resources/namespace/namespace_name.js';

export class K8ClientObjectMeta implements ObjectMeta {
  constructor(
    public readonly namespace: NamespaceName,
    public readonly name: string,
    public readonly labels?: {[key: string]: string},
    public readonly annotations?: {[key: string]: string},
    public readonly uid?: string,
  ) {}
}
