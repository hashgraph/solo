/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NodeAlias} from '../../types/aliases.js';

export class ConsensusNode {
  constructor(
    public readonly name: NodeAlias,
    public readonly nodeId: number,
    public readonly namespace: string,
    public readonly cluster: string,
    public readonly context: string,
    public readonly dnsBaseDomain: string,
    public readonly dnsConsensusNodePattern: string,
    public readonly fullyQualifiedDomainName: string,
  ) {}
}
