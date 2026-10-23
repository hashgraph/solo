// SPDX-License-Identifier: Apache-2.0

import {type AccountId} from '@hiero-ledger/sdk';
import {type SdkNetworkEndpoint} from '../../types/aliases.js';

export interface HederaClientOptions {
  /** the consensus node endpoints and the account id of the node behind each endpoint */
  network: Record<SdkNetworkEndpoint, AccountId>;

  /** the account that pays for and signs transactions, omit for a client that is only used to ping */
  operator?: {accountId: string; privateKey: string};

  /** where the client writes its own trace log, omit to leave the client logger unset */
  logFilePath?: string;

  maxAttempts?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  requestTimeoutMs?: number;
  maxQueryPaymentHbar?: number;
}
