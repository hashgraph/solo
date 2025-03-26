// SPDX-License-Identifier: Apache-2.0

import {type Node} from './node.js';
import {ConfigKeyError} from '../config-key-error.js';
import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';

export abstract class LexerNode implements Node {
  public constructor(
    public readonly parent: Node | null,
    public readonly name: string,
    public readonly formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ) {
    if (parent && !parent.isInternal()) {
      throw new ConfigKeyError('Parent must be an instance of InternalNode');
    }
  }

  public abstract isArray(): boolean;

  public abstract isArrayIndex(): boolean;

  public abstract isInternal(): boolean;

  public abstract isLeaf(): boolean;

  public abstract isRoot(): boolean;

  public path(): string {
    const segments: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Node = this;
    while (node) {
      segments.push(node.name);
      node = node.parent;
    }

    segments.reverse();

    return this.formatter.join(...segments);
  }
}
