/**
 * SPDX-License-Identifier: Apache-2.0
 */

export class ConsensusNode {
  constructor(
    public readonly name: string,
    public readonly nodeId: number,
    public readonly namespace: string,
    public readonly cluster: string,
    public readonly context: string,
  ) {}
}
