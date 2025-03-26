// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';
import {KeyName} from '../key-name.js';
import {LexerNode} from './lexer-node.js';
import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';

export class LexerLeafNode extends LexerNode {
  public constructor(
    parent: Node | null,
    name: string,
    public readonly value: string | null,
    formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ) {
    super(parent, name, formatter);
  }

  public isInternal(): boolean {
    return false;
  }

  public isLeaf(): boolean {
    return true;
  }

  public isRoot(): boolean {
    return this.parent === null || this.parent === undefined;
  }

  public isArray(): boolean {
    return false;
  }

  public isArrayIndex(): boolean {
    return KeyName.isArraySegment(this.name);
  }
}
