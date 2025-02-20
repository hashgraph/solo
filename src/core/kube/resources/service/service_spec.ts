/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ServicePort} from './service_port.js';

export interface ServiceSpec {
  readonly clusterIP?: string;
  readonly ports?: ServicePort[];
  readonly selector?: {[key: string]: string};
}
