// SPDX-License-Identifier: Apache-2.0

import {type RttSample} from './rtt-sample.js';

export interface RttProbeResult {
  samples: RttSample[];
  minMilliseconds: number;
  p50Milliseconds: number;
  p95Milliseconds: number;
  p99Milliseconds: number;
  maxMilliseconds: number;
}
