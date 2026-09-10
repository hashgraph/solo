// SPDX-License-Identifier: Apache-2.0

import {type ClusterReferenceName} from '../../../types/index.js';
import {type UserIdentitySchema} from '../../../data/schema/model/common/user-identity-schema.js';

export interface ClusterReferenceConnectConfigClass {
  cacheDir: string;
  debugMode: boolean;
  quiet: boolean;
  userIdentity: UserIdentitySchema;
  clusterRef: ClusterReferenceName;
  context: string;
}
