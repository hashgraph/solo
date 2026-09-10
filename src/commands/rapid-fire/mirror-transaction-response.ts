// SPDX-License-Identifier: Apache-2.0

interface MirrorTransaction {
  transaction_id?: string;
}

export interface MirrorTransactionResponse {
  transactions?: MirrorTransaction[];
}
