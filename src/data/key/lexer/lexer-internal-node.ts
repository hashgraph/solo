// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {LexerLeafNode} from './lexer-leaf-node.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigKeyError} from '../config-key-error.js';
import {LexerNode} from './lexer-node.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {type KeyFormatter} from '../key-formatter.js';

export class LexerInternalNode extends LexerNode {
  private readonly _children: Map<string, Node> = new Map<string, Node>();

  public constructor(
    parent: LexerInternalNode | null,
    name: string,
    children?: Node[],
    private readonly array: boolean = false,
    private readonly arrayIndex: boolean = false,
    formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ) {
    super(parent, name, formatter);

    if (children) {
      for (const c of children) {
        if (c instanceof LexerInternalNode) {
          if (c.isRoot()) {
            throw new ConfigKeyError('Internal nodes cannot have root nodes as children');
          }
        }

        this._children.set(c.name, c);
      }
    }
  }

  public add(child: Node): void {
    if (!child) {
      throw new IllegalArgumentError('child must not be null or undefined');
    }

    if (!this._children.has(child.name)) {
      this._children.set(child.name, child);
    }
  }

  public remove(child: Node): void {
    if (!child) {
      throw new IllegalArgumentError('child must not be null or undefined');
    }

    if (!this._children.has(child.name)) {
      throw new ConfigKeyError('Child not found');
    }

    this._children.delete(child.name);
  }

  public clear(): void {
    this._children.clear();
  }

  public replaceValue(child: Node, value: string): void {
    if (!child) {
      throw new IllegalArgumentError('child must not be null or undefined');
    }

    if (!this._children.has(child.name)) {
      throw new ConfigKeyError('Child not found');
    }

    if (!child.isLeaf()) {
      throw new ConfigKeyError('Child must be a leaf node');
    }

    const newLeaf: LexerLeafNode = new LexerLeafNode(this, child.name, value, this.formatter);
    this._children.set(child.name, newLeaf);
  }

  public get children(): Node[] {
    return Array.from(this._children.values());
  }

  public isRoot(): boolean {
    return this.parent === null || this.parent === undefined;
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
          throw new ConfigKeyError('Array node must have array index children');
        }

        const index: number = Number.parseInt(child.name);
        if (!Number.isSafeInteger(index)) {
          throw new ConfigKeyError('Array index must be a number');
        }

        obj[index] = (child as LexerInternalNode).toObject();
      } else {
        if (child.isLeaf()) {
          obj[child.name] = ReflectAssist.coerce((child as LexerLeafNode).value);
        } else {
          obj[child.name] = (child as LexerInternalNode).toObject();
        }
      }
    }

    return obj;
  }
}
