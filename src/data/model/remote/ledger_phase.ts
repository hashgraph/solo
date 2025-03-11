// SPDX-License-Identifier: Apache-2.0

/**
 * The current state of the ledger (consensus node).
 */
export enum LedgerPhase {
  /**
   * The ledger has not been initialized yet and is in a pre-genesis state.
   */
  UNINITIALIZED = 'uninitialized',

  /**
   * The ledger has been initialized and is in a post-genesis state. This is the normal state for a ledger.
   */
  INITIALIZED = 'initialized',

  /**
   * The ledger has not been initialized yet, but a ledger state is being restored from a snapshot.
   */
  SNAPSHOT_RESTORING = 'snapshot-restoring',

  /**
   * The ledger has been initialized and a ledger state has been restored from a snapshot.
   */
  SNAPSHOT_RESTORED = 'snapshot-restored',

  /**
   * The ledger has been initialized and is undergoing disaster recovery.
   */
  RECOVERING = 'recovering',

  /**
   * The ledger has been initialized and disaster recovery has been completed.
   */
  RECOVERED = 'recovered',

  /**
   * The ledger has been initialized and there is an outstanding request to freeze the ledger.
   */
  FREEZING = 'freezing',

  /**
   * The ledger has been initialized and the ledger has been frozen.
   */
  FROZEN = 'frozen',
}

// deployment create
// deployment cluster-add
// deployment node-modify --taints key=value:NoSchedule --labels key=value --annotations key=value
// deployment recover-snapshot --round-number 1
// network deploy
