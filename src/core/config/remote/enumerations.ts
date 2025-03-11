// SPDX-License-Identifier: Apache-2.0

/**
 * Enumerations that represent the component types used in remote config
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

export enum DeploymentStates {
  PRE_GENESIS = 'pre-genesis',
  POST_GENESIS = 'post-genesis',
}
