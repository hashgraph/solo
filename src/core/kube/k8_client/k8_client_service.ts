/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Service} from '../service.js';
import {type ObjectMeta} from '../object_meta.js';
import {type ServiceSpec} from '../service_spec.js';
import {type ServiceStatus} from '../service_status.js';

export class K8ClientService implements Service {
  public constructor(
    public readonly metadata: ObjectMeta,
    public readonly spec: ServiceSpec,
    public readonly status?: ServiceStatus,
  ) {}
}
