// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../namespace/namespace-name.js';

export interface ConfigMap {
  /**
   * The namespace of the config map
   */
  readonly namespace: NamespaceName;

  /**
   * The name of the config map
   */
  readonly name: string;

  /**
   * The labels of the config map
   */
  readonly labels?: Record<string, string>;

  /**
   * The data of the config map
   */
  readonly data?: Record<string, string>;
}
