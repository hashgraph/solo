// SPDX-License-Identifier: Apache-2.0

import {type Service} from '../../../resources/service/service.js';
import {type ObjectMeta} from '../../../resources/object-meta.js';
import {type ServiceSpec} from '../../../resources/service/service-spec.js';
import {type ServiceStatus} from '../../../resources/service/service-status.js';

export class K8ClientService implements Service {
  public constructor(
    public readonly metadata: ObjectMeta,
    public readonly spec: ServiceSpec,
    public readonly status?: ServiceStatus,
  ) {}
}
