// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type EndpointPortMapping} from '../../../types/index.js';

export interface NodeSetupConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  appConfig: string;
  adminKey: string;
  cacheDir: string;
  debugMode: boolean;
  localBuildPath: string;
  releaseTag: string;
  podRefs: Record<NodeAlias, PodReference>;
  skipStop?: boolean;
  keysDir: string;
  stagingDir: string;
  getUnusedConfigs: () => string[];
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
  gossipEndpointPort: string;
  gossipEndpointPortMapping: EndpointPortMapping;
  serviceEndpointPort: string;
  serviceEndpointPortMapping: EndpointPortMapping;
}
