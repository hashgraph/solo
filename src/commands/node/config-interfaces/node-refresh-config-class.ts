// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeRefreshConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  releaseTag: string;
  podRefs: Record<NodeAlias, PodRef>;
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
}
