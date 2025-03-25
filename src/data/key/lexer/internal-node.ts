// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type LeafNode} from './leaf-node.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';

export class InternalNode implements Node {
  private readonly _children: Map<string, Node> = new Map<string, Node>();

  public readonly parent: Node | null;

  public constructor(
    parent: InternalNode | null,
    public readonly name: string,
    children?: Node[],
    private readonly array: boolean = false,
    private readonly arrayIndex: boolean = false,
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

        this._children.set(c.name, c);
      }
    }
  }

  public addChild(child: Node): void {
    if (!child) {
      throw new IllegalArgumentError('child must not be null or undefined');
    }

    if (!this._children.has(child.name)) {
      this._children.set(child.name, child);
    }
  }

  public get children(): Node[] {
    return Array.from(this._children.values());
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

  public isArrayIndex(): boolean {
    return this.arrayIndex;
  }

  public toObject(): object {
    const obj: object = this.isArray() ? [] : {};

    for (const child of this.children) {
      if (this.isArray()) {
        if (!child.isArrayIndex()) {
          throw new Error('Array node must have array index children');
        }

        const index: number = Number.parseInt(child.name);
        if (!Number.isSafeInteger(index)) {
          throw new Error('Array index must be a number');
        }

        obj[index] = (child as InternalNode).toObject();
      } else {
        if (child.isLeaf()) {
          obj[child.name] = ReflectAssist.coerce((child as LeafNode).value);
        } else {
          obj[child.name] = (child as InternalNode).toObject();
        }
      }
    }

    return obj;
  }
}
