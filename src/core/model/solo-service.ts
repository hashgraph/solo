// SPDX-License-Identifier: Apache-2.0

import {type ClusterRef, type DeploymentName} from '../config/remote/types.js';
import {type ObjectMeta} from '../../integration/kube/resources/object-meta.js';
import {type ServiceSpec} from '../../integration/kube/resources/service/service-spec.js';
import {type ServiceStatus} from '../../integration/kube/resources/service/service-status.js';
import {type Service} from '../../integration/kube/resources/service/service.js';
import {K8ClientService} from '../../integration/kube/k8-client/resources/service/k8-client-service.js';

export class SoloService extends K8ClientService {
  constructor(
    public readonly metadata: ObjectMeta,
    public readonly spec: ServiceSpec,
    public readonly status?: ServiceStatus,
    public readonly clusterRef?: ClusterRef,
    public readonly context?: string,
    public readonly deployment?: string,
  ) {
    super(metadata, spec, status);
  }

  public static getFromK8Service(
    service: Service,
    clusterRef: ClusterRef,
    context: string,
    deployment: DeploymentName,
  ) {
    return new SoloService(service.metadata, service.spec, service.status, clusterRef, context, deployment);
  }
}
