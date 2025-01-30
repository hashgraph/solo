/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Namespace} from '../config/remote/types.js';

export default interface checks {
  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  isCertManagerInstalled(): Promise<boolean>;
  isIngressControllerInstalled(): Promise<boolean>;
  isMinioInstalled(namespace: Namespace): Promise<boolean>;
  isPrometheusInstalled(namespace: Namespace): Promise<boolean>;
  isRemoteConfigPresentInAnyNamespace(): Promise<boolean>;
}
