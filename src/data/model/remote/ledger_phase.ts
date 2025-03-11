// SPDX-License-Identifier: Apache-2.0

/**
 * The current state of the ledger (consensus node).
 */
export enum LedgerPhase {
  UNINITIALIZED = 'uninitialized',
  INITIALIZED = 'initialized',
  SNAPSHOT_RESTORING = 'snapshot-restoring',
  SNAPSHOT_RESTORED = 'snapshot-restored',
  RECOVERING = 'recovering',
  RECOVERED = 'recovered',
  FREEZING = 'freezing',
  FROZEN = 'frozen',
}

// deployment create
// deployment cluster-add
// deployment node-modify --taints key=value:NoSchedule --labels key=value --annotations key=value
// deployment recover-snapshot --round-number 1
// network deploy
