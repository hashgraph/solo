/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type K8} from './k8.js';

export interface K8Factory {
  /**
   * Get a K8 instance for the given context
   * @param context - The context to get the K8 instance for
   */
  getK8(context: string): K8;

  /**
   * Get the default K8 instance which uses the kubeconfig current context
   */
  default(): K8;
}
