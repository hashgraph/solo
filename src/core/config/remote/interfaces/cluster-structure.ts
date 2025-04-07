// SPDX-License-Identifier: Apache-2.0

import {type DeploymentName} from '../types.js';

export interface ClusterStructure {
  name: string;
  namespace: string;
  deployment: DeploymentName;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;
}
