// SPDX-License-Identifier: Apache-2.0

/**
 * Enumerations that represent the state of consensus node in remote config
 */
export enum ConsensusNodeStates {
  NON_DEPLOYED = 'non-deployed',
  REQUESTED = 'requested',
  INITIALIZED = 'initialized',
  SETUP = 'setup',
  STARTED = 'started',
  FROZEN = 'frozen',
  STOPPED = 'stopped',
}
