// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';

export interface ClusterRefResetConfigClass {
  clusterName: string;
  clusterSetupNamespace: NamespaceName;
}
