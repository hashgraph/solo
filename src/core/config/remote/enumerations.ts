/**
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enumerations that represent the component types used in remote config
 * {@link ComponentsDataWrapper}
 */
export enum ComponentType {
  ConsensusNode = 'consensusNodes',
  HaProxy = 'haProxies',
  EnvoyProxy = 'envoyProxies',
  MirrorNode = 'mirrorNodes',
  MirrorNodeExplorer = 'mirrorNodeExplorers',
  Relay = 'relays',
}

/**
 * Enumerations that represent the state of consensus node in remote config
 * {@link ConsensusNodeComponent}
 */
export enum ConsensusNodeStates {
  INITIALIZED = 'initialized',
  SETUP = 'setup',
  STARTED = 'started',
  FREEZED = 'freezed',
  STOPPED = 'stopped',
}
