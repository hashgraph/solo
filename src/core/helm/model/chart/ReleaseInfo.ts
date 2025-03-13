// SPDX-License-Identifier: Apache-2.0

/**
 * Information about a Helm release.
 */
export interface ReleaseInfo {
  firstDeployed: string;
  lastDeployed: string;
  deleted: string;
  description: string;
  status: string;
}
