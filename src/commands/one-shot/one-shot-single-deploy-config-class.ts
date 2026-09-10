// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject, type ArgvStruct} from '../../types/aliases.js';
import {type OneShotVersionsObject} from './one-shot-versions-object.js';

export interface OneShotSingleDeployConfigClass {
  relayNodeConfiguration: AnyObject;
  explorerNodeConfiguration: AnyObject;
  blockNodeConfiguration: AnyObject;
  mirrorNodeConfiguration: AnyObject;
  consensusNodeConfiguration: AnyObject;
  networkConfiguration: AnyObject;
  setupConfiguration: AnyObject;
  valuesFile: string;
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
  minimalSetup: boolean;
  deployMirrorNode: boolean;
  deployExplorer: boolean;
  deployRelay: boolean;
  deployMetricsServer: boolean;
  force: boolean;
  quiet: boolean;
  rollback: boolean;
  parallelDeploy: boolean;
  pinger: boolean;
  externalAddress: string;
  edgeEnabled: boolean;
  // True when this deploy created the Kind cluster from the one-shot small-memory config, so its
  // extraPortMappings publish the one-shot NodePorts on the host. False when deploying into a
  // pre-existing cluster (e.g. CI or a user-provided cluster), where the legacy kubectl
  // port-forwards must be kept.
  clusterHasOneShotPortMappings: boolean;
  versions: OneShotVersionsObject;
  argv: ArgvStruct;
}
