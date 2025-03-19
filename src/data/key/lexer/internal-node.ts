// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';

export class InternalNode implements Node {
  public readonly children: Node[] = [];
  public readonly parent: Node | null;

  public constructor(
    parent: InternalNode | null,
    public readonly name: string,
    children?: Node[],
    private readonly array: boolean = false,
  ) {
    if (parent && !parent.isInternal()) {
      throw new Error('Parent must be an instance of InternalNode');
    }

    this.parent = parent;

    if (children) {
      for (const c of children) {
        if (c instanceof InternalNode) {
          if (c.isRoot()) {
            throw new Error('Internal nodes cannot have root nodes as children');
          }
        }

        this.children.push(c);
      }
    }
  }

  public isRoot(): boolean {
    return !!this.parent;
  }

  public isInternal(): boolean {
    return true;
  }

  public isLeaf(): boolean {
    return false;
  }

  public isArray(): boolean {
    return this.array;
  }
}
