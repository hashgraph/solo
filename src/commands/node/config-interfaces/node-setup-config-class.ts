// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PodReference as PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeSetupConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  appConfig: string;
  adminKey: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  releaseTag: string;
  podRefs: Record<NodeAlias, PodReference>;
  skipStop?: boolean;
  keysDir: string;
  stagingDir: string;
  getUnusedConfigs: () => string[];
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
}
