// SPDX-License-Identifier: Apache-2.0

export interface Node {
  readonly name: string;
  readonly parent: Node | null;

  isRoot(): boolean;
  isInternal(): boolean;
  isLeaf(): boolean;
  isArray(): boolean;
}
