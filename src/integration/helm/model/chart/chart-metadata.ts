// SPDX-License-Identifier: Apache-2.0

export class ChartMetadata {
  /**
   * Creates a new ChartMetadata instance.
   * @param version The version of the chart
   * @param appVersion The version of the application contained in the chart
   */
  constructor(
    public readonly version: string,
    public readonly appVersion: string,
  ) {}
}
