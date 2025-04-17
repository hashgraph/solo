// SPDX-License-Identifier: Apache-2.0

import {Lexer} from './lexer.js';
import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type Node} from './node.js';
import {type LexerInternalNode} from './lexer-internal-node.js';
import {type LexerLeafNode} from './lexer-leaf-node.js';

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

  public static fromLexer(lexer: Lexer, formatter: KeyFormatter = ConfigKeyFormatter.instance()): Forest {
    if (!lexer) {
      throw new IllegalArgumentError('lexer must not be null or undefined');
    }

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
      return (node as LexerLeafNode).value;
    }

    return null;
  }

  public nodeFor(key: string): Node {
    return this.lexer.nodeFor(key);
  }

  public addOrReplaceValue(key: string, value: string | null): void {
    this.lexer.addOrReplaceValue(key, value);
  }

  public addOrReplaceObject(key: string, value: object | null): void {
    this.lexer.addOrReplaceObject(key, value);
  }

  public addOrReplaceArray<T>(key: string, values: T[] | null): void {
    this.lexer.addOrReplaceArray(key, values);
  }

  public toObject(): object {
    const object: object = {};

    for (const [key, node] of this.lexer.tree.entries()) {
      object[key] = node.isLeaf() ? (node as LexerLeafNode).value : (node as LexerInternalNode).toObject();
    }

    return object;
  }

  public toFlatMap(): Map<string, string> {
    return this.lexer.tokens;
  }
}
