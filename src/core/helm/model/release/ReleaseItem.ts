// SPDX-License-Identifier: Apache-2.0

/**
 * Represents a Helm release item, containing basic information about a release.
 */
export interface ReleaseItem {
  /** The name of the release */
  name: string;

  /** The namespace where the release is installed */
  namespace: string;

  /** The revision number of the release */
  revision: string;

  /** The timestamp when the release was last updated */
  updated: string;

  /** The current status of the release */
  status: string;

  /** The chart used for this release */
  chart: string;

  /** The application version of the release */
  app_version: string;
}

/**
 * Class implementation of the ReleaseItem interface.
 */
export class ReleaseItemImpl implements ReleaseItem {
  /**
   * Creates a new ReleaseItem instance.
   * @param name The name of the release
   * @param namespace The namespace where the release is installed
   * @param revision The revision number of the release
   * @param updated The timestamp when the release was last updated
   * @param status The current status of the release
   * @param chart The chart used for this release
   * @param app_version The application version of the release
   */
  constructor(
    public readonly name: string,
    public readonly namespace: string,
    public readonly revision: string,
    public readonly updated: string,
    public readonly status: string,
    public readonly chart: string,
    public readonly app_version: string
  ) {}
} 