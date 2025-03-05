/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from '../../../core/kube/resources/namespace/namespace_name.js';
import {type DeploymentName} from '../../../core/config/remote/types.js';

export interface SelectClusterContextContext {
  config: {
    quiet: boolean;
    namespace: NamespaceName;
    clusterName: string;
    context: string;
    clusters: string[];
    deployment: DeploymentName;
    deploymentClusters: string[];
  };
}
