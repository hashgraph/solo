// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, Type} from 'class-transformer';
import {ConsensusNodeState} from './state/consensus-node-state.js';
import {type LedgerPhase} from './ledger-phase.js';
import {Transformations} from '../utils/transformations.js';
import {RelayNodeState} from './state/relay-node-state.js';
import {MirrorNodeState} from './state/mirror-node-state.js';
import {HAProxyState} from './state/haproxy-state.js';
import {EnvoyProxyState} from './state/envoy-proxy-state.js';
import {ExplorerState} from './state/explorer-state.js';
import {BlockNodeState} from './state/block-node-state.js';

@Exclude()
export class DeploymentState {
  @Expose()
  @Transform(Transformations.LedgerPhase)
  public ledgerPhase: LedgerPhase;

  @Expose()
  @Type(() => ConsensusNodeState)
  public consensusNodes: ConsensusNodeState[];

  @Expose()
  @Type(() => BlockNodeState)
  public blockNodes: BlockNodeState[];

  @Expose()
  @Type(() => MirrorNodeState)
  public mirrorNodes: MirrorNodeState[];

  @Expose()
  @Type(() => RelayNodeState)
  public relayNodes: RelayNodeState[];

  @Expose()
  @Type(() => HAProxyState)
  public haProxies: HAProxyState[];

  @Expose()
  @Type(() => EnvoyProxyState)
  public envoyProxies: EnvoyProxyState[];

  @Expose()
  @Type(() => ExplorerState)
  public explorers: ExplorerState[];

  public constructor(
    ledgerPhase?: LedgerPhase,
    consensusNodes?: ConsensusNodeState[],
    blockNodes?: BlockNodeState[],
    mirrorNodes?: MirrorNodeState[],
    relayNodes?: RelayNodeState[],
    haProxies?: HAProxyState[],
    envoyProxies?: EnvoyProxyState[],
    explorers?: ExplorerState[],
  ) {
    this.ledgerPhase = ledgerPhase;
    this.consensusNodes = consensusNodes || [];
    this.blockNodes = blockNodes || [];
    this.mirrorNodes = mirrorNodes || [];
    this.relayNodes = relayNodes || [];
    this.haProxies = haProxies || [];
    this.envoyProxies = envoyProxies || [];
    this.explorers = explorers || [];
  }
}
