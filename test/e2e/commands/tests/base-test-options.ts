// SPDX-License-Identifier: Apache-2.0

import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type ClusterReferences} from '../../../../src/types/index.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

export interface BaseTestOptions {
  readonly testName: string;
  readonly testLogger: SoloLogger;
  readonly clusterReferences: ClusterReferences;
  readonly clusterReferenceNameArray: string[];
  readonly contexts: string[];
  readonly deployment: string;
  readonly namespace: NamespaceName;
  readonly testCacheDirectory: string;
  readonly enableLocalBuildPathTesting: boolean;
  readonly localBuildReleaseTag: string;
  readonly localBuildPath: string;
  readonly createdAccountIds: string[];
  readonly consensusNodesCount: number;
  readonly loadBalancerEnabled: boolean;
  readonly tssEnabled: boolean;
  readonly wrapsEnabled: boolean;
  readonly pinger: boolean;
  readonly realm: number;
  readonly shard: number;
  readonly serviceMonitor: boolean;
  readonly podLog: boolean;
  readonly minimalSetup: boolean;
  readonly apiPermissionProperties: string;
  readonly applicationEnvironment: string;
  readonly applicationProperties: string;
  readonly bootstrapProperties: string;
  readonly logXml: string;
  readonly settingsTxt: string;
  readonly javaFlightRecorderConfiguration: string;
  readonly chainId?: number;
  readonly valuesFile?: string;
}
