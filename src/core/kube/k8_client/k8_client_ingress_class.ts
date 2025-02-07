/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type IngressClass} from '../ingress_class.js';

export class K8ClientIngressClass implements IngressClass {
  constructor(public readonly name: string) {}
}
