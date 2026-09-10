// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type EndpointPortMapping} from '../../../types/index.js';

export interface NodeRefreshConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  cacheDir: string;
  debugMode: boolean;
  localBuildPath: string;
  releaseTag: string;
  podRefs: Record<NodeAlias, PodReference>;
  domainNames: string;
  nodeAliases: NodeAliases;
  domainNamesMapping: Record<NodeAlias, string>;
  gossipEndpointPort: string;
  gossipEndpointPortMapping: EndpointPortMapping;
  serviceEndpointPort: string;
  serviceEndpointPortMapping: EndpointPortMapping;
}
