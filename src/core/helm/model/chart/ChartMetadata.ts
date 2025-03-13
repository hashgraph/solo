// SPDX-License-Identifier: Apache-2.0

/**
 * Metadata information for a Helm chart.
 */
export interface ChartMetadata {
  /** The version of the chart */
  version: string;
  /** The version of the application contained in the chart */
  appVersion: string;
}

/**
 * Class implementation of the ChartMetadata interface.
 */
export class ChartMetadataImpl implements ChartMetadata {
  /**
   * Creates a new ChartMetadata instance.
   * @param version The version of the chart
   * @param appVersion The version of the application contained in the chart
   */
  constructor(
    public readonly version: string,
    public readonly appVersion: string
  ) {}
} 