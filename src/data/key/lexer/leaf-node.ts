// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';
import {KeyName} from '../key-name.js';

export class LeafNode implements Node {
  public constructor(
    public readonly parent: Node | null,
    public readonly name: string,
    public readonly value: string | null,
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
    return false;
  }

  public isArrayIndex(): boolean {
    return KeyName.isArraySegment(this.name);
  }
}
