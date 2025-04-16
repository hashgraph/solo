// SPDX-License-Identifier: Apache-2.0

import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type MigrationStruct} from './migration-struct.js';
import {type DeploymentName, type EmailAddress, type NamespaceNameAsString, type Version} from '../types.js';

export interface RemoteConfigMetadataStruct {
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
  migration?: MigrationStruct;
}
