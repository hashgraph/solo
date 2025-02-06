/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ObjectMeta} from './object_meta.js';
import {type ServiceSpec} from './service_spec.js';
import {type ServiceStatus} from './service_status.js';

export interface Service {
  readonly metadata?: ObjectMeta;
  readonly spec?: ServiceSpec;
  readonly status?: ServiceStatus;
}
