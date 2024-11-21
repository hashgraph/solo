/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * Enumerations that represent the component types used in remote config
 * {@link ComponentsDataWrapper}
 */
export enum ComponentType {
  ConsensusNode = 'consensus nodes',
  HaProxy = 'ha proxies',
  EnvoyProxy = 'envoy proxies',
  MirrorNode = 'mirror nodes',
  MirrorNodeExplorer = 'mirror node explorers',
  Relay = 'replays',
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
}

