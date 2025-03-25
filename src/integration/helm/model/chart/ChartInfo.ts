// SPDX-License-Identifier: Apache-2.0

import {type ChartMetadata} from './ChartMetadata.js';

/**
 * Represents information about a Helm chart.
 * This class is designed to be serializable from JSON with unknown properties ignored.
 */
export class ChartInfo {
  /**
   * Creates a new ChartInfo instance.
   * @param metadata The metadata associated with the chart
   */
  constructor(public readonly metadata: ChartMetadata) {}
}
