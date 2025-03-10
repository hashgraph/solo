/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterRef, type EmailAddress} from '../../../core/config/remote/types.js';

export interface ClusterRefConnectConfigClass {
  cacheDir: string;
  devMode: boolean;
  quiet: boolean;
  userEmailAddress: EmailAddress;
  clusterRef: ClusterRef;
  context: string;
}
