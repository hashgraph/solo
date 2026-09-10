// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {type DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';

export interface DeploymentStateSnapshot {
  remoteConfig: {
    configMapExists: boolean;
    componentPhases: Map<ComponentTypes, DeploymentPhase>;
    orphanedOnKindCluster: boolean;
  };
  helm: {
    installedReleases: Set<string>;
  };
  accounts: {
    accountsFileExists: boolean;
  };
}
