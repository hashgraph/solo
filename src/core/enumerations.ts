// SPDX-License-Identifier: Apache-2.0

export enum NodeStatusCodes {
  NO_VALUE = 0,
  STARTING_UP = 1,
  ACTIVE = 2,
  BEHIND = 4,
  FREEZING = 5,
  FREEZE_COMPLETE = 6,
  REPLAYING_EVENTS = 7,
  OBSERVING = 8,
  CHECKING = 9,
  RECONNECT_COMPLETE = 10,
  CATASTROPHIC_FAILURE = 11,
}

export const NodeStatusEnums = {
  0: 'NO_VALUE',
  1: 'STARTING_UP',
  2: 'ACTIVE',
  4: 'BEHIND',
  5: 'FREEZING',
  6: 'FREEZE_COMPLETE',
  7: 'REPLAYING_EVENTS',
  8: 'OBSERVING',
  9: 'CHECKING',
  10: 'RECONNECT_COMPLETE',
  11: 'CATASTROPHIC_FAILURE',
} as const;

/**
 * - GRPC - Represents HAProxy Proxy
 * - GRPC_WEB - Represent Envoy Proxy
 */
export enum GrpcProxyTlsEnums {
  GRPC,
  GRPC_WEB,
}

export enum NodeSubcommandType {
  ADD,
  DELETE,
  UPDATE,
}
