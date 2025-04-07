// SPDX-License-Identifier: Apache-2.0

import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type MigrationStructure} from './migration-structure.js';
import {type DeploymentName, type EmailAddress, type NamespaceNameAsString, type Version} from '../types.js';

export interface RemoteConfigMetadataStructure {
  namespace: NamespaceNameAsString;
  state: DeploymentStates;
  deploymentName: DeploymentName;
  lastUpdatedAt: Date;
  lastUpdateBy: EmailAddress;
  soloVersion: Version;
  soloChartVersion: Version;
  hederaPlatformVersion: Version;
  hederaMirrorNodeChartVersion: Version;
  hederaExplorerChartVersion: Version;
  hederaJsonRpcRelayChartVersion: Version;
  migration?: MigrationStructure;
}
