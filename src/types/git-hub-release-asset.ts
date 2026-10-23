// SPDX-License-Identifier: Apache-2.0

// GitHub API response interface
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
  /** Absent when GitHub has not published a sha256 digest for the asset. */
  digest?: string;
}
