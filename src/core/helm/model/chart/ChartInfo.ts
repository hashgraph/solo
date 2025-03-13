// SPDX-License-Identifier: Apache-2.0

import {type ChartMetadata} from './ChartMetadata.js';

/**
 * Information about a Helm chart.
 */
export interface ChartInfo {
  /** The metadata of the chart */
  metadata: ChartMetadata;
}
