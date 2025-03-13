// SPDX-License-Identifier: Apache-2.0

import { ChartInfo, ChartInfoImpl } from './ChartInfo.js';
import { ReleaseInfo, ReleaseInfoImpl } from './ReleaseInfo.js';

/**
 * Information about a Helm release.
 */
export interface Release {
  /** The name of the release */
  name: string;
  /** Information about the release */
  info: ReleaseInfo;
  /** Information about the chart */
  chart: ChartInfo;
}
