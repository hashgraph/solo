// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';

export class LeafNode implements Node {
  public constructor(
    public readonly parent: Node | null,
    public readonly name: string,
    public readonly value: string | string[] | null,
  ) {
    if (parent && !parent.isInternal()) {
      throw new Error('Parent must be an instance of InternalNode');
    }
  }

  public isInternal(): boolean {
    return false;
  }

  public isLeaf(): boolean {
    return true;
  }

  public isRoot(): boolean {
    return false;
  }

  public isArray(): boolean {
    return this.value && Array.isArray(this.value);
  }
}
