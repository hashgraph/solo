// SPDX-License-Identifier: Apache-2.0

import {type ServicePort} from './service-port.js';

export interface ServiceSpec {
  readonly clusterIP?: string;
  readonly ports?: ServicePort[];
  readonly selector?: {[key: string]: string};
  readonly type?: string;
}
