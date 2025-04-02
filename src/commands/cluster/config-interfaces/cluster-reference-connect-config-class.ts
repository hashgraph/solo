// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference, type EmailAddress} from '../../../core/config/remote/types.js';

export interface ClusterReferenceConnectConfigClass {
  cacheDir: string;
  devMode: boolean;
  quiet: boolean;
  userEmailAddress: EmailAddress;
  clusterRef: ClusterReference;
  context: string;
}
