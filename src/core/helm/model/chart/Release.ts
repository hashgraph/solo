// SPDX-License-Identifier: Apache-2.0

import {type ChartInfo} from './ChartInfo.js';
import {type ReleaseInfo} from './ReleaseInfo.js';

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

/**
 * Implementation of the Release interface.
 */
export class ReleaseImpl implements Release {
  constructor(
    public readonly name: string,
    public readonly info: ReleaseInfo,
    public readonly chart: ChartInfo,
  ) {}
}
