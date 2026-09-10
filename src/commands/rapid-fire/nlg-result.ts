// SPDX-License-Identifier: Apache-2.0

import {type NlgResultStatus} from './nlg-result-status.js';

export interface NlgResult {
  status: NlgResultStatus;
  testClass: string;
  performanceTest: string;
  transactionCount?: number;
  durationSeconds?: number;
  tps?: number;
  rttMilliseconds?: number;
  hint?: string;
}
