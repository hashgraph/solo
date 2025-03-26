// SPDX-License-Identifier: Apache-2.0

import {type ObjectMeta} from '../object-meta.js';
import {type ServiceSpec} from './service-spec.js';
import {type ServiceStatus} from './service-status.js';

export interface Service {
  readonly metadata?: ObjectMeta;
  readonly spec?: ServiceSpec;
  readonly status?: ServiceStatus;
}
