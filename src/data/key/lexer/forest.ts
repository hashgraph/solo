// SPDX-License-Identifier: Apache-2.0

import {Lexer} from './lexer.js';
import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type Node} from './node.js';
import {type InternalNode} from './internal-node.js';
import {type LeafNode} from './leaf-node.js';

export class Forest {
  private constructor(
    public readonly lexer: Lexer,
    public readonly formatter: KeyFormatter,
  ) {
    if (!lexer) {
      throw new IllegalArgumentError('lexer must not be null or undefined');
    }

    if (!formatter) {
      throw new IllegalArgumentError('formatter must not be null or undefined');
    }
  }

  public static from(data: Map<string, string>, formatter: KeyFormatter = ConfigKeyFormatter.instance()): Forest {
    const lexer: Lexer = new Lexer(data, formatter);

    lexer.renderTrees();
    return new Forest(lexer, formatter);
  }

  public has(key: string): boolean {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    return this.nodeFor(key) !== null;
  }

  public valueFor(key: string): string {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    const node: Node = this.nodeFor(key);
    if (!node) {
      return null;
    }

    if (node.isLeaf()) {
      return (node as LeafNode).value;
    }

    return null;
  }

  public nodeFor(key: string): Node {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    const segments: string[] = this.formatter.split(key);

    if (segments.length === 0 || segments[0].trim().length === 0) {
      throw new IllegalArgumentError('key must not be empty');
    }

    let currentNode: Node = this.lexer.tree.get(segments[0]);

    if (!currentNode) {
      return null;
    }

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];

      if (currentNode.isLeaf()) {
        return null;
      }

      const inode: InternalNode = currentNode as InternalNode;
      const nextNode: Node = inode.children.find(n => n.name === segment);

      if (!nextNode) {
        return null;
      }

      currentNode = nextNode;
    }

    return currentNode;
  }

  public toObject(): object {
    const obj: object = {};

    for (const [key, node] of this.lexer.tree.entries()) {
      if (node.isLeaf()) {
        obj[key] = (node as LeafNode).value;
      } else {
        obj[key] = (node as InternalNode).toObject();
      }
    }

    return obj;
  }
}
