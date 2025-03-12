// SPDX-License-Identifier: Apache-2.0

import {type ClusterRef, type DeploymentName} from '../config/remote/types.js';
import {type ObjectMeta} from '../kube/resources/object_meta.js';
import {type ServiceSpec} from '../kube/resources/service/service_spec.js';
import {type ServiceStatus} from '../kube/resources/service/service_status.js';
import {type Service} from '../kube/resources/service/service.js';
import {K8ClientService} from '../kube/k8_client/resources/service/k8_client_service.js';

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
