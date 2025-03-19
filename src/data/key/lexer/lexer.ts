// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {type Node} from './node.js';

export class Lexer {
  public constructor(
    private readonly tokens: Map<string, string>,
    private readonly formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ) {
    if (!this.tokens) {
      throw new Error('tokens must be provided');
    }

    if (!this.formatter) {
      throw new Error('formatter must be provided');
    }
  }

  /**
   * Parses the token map and returns all the root nodes.
   *
   * @returns {Node[]} The root nodes.
   */
  public renderTrees(): Node[] {
    if (this.tokens.size === 0) {
      return [];
    }

    const roots: Map<string, Node> = new Map();
    const keys: string[] = Array.from(this.tokens.keys());

    // Sort the keys so that we can process them in order.
    keys.sort();

    this.processKeys(keys, roots);
    return Array.from(roots.values());
  }

  private processKeys(keys: string[], roots: Map<string, Node>): void {
    for (const k of keys) {
      const key = this.formatter.normalize(k);
      const parts: string[] = this.formatter.split(key);

      if (!parts || parts.length === 0) {
        continue;
      }

      const root: Node = this.rootNodeFor(parts, roots);
    }
  }

  private rootNodeFor(keyParts: string[], roots: Map<string, Node>): Node {
    const rootName: string = keyParts[0];

    if (roots.has(rootName)) {
      return roots.get(rootName);
    }

    // let array: boolean = false;
    // if (keyParts.length >= 2) {
    //   const nextSegment: string = keyParts[1];
    // if () {
    //   array = true;
    // }
    // }

    // const root: Node = new InternalNode(null, rootName, [], array);
    // roots.set(rootName, root);
    // return root;
    return undefined;
  }

  private isArraySegment(segment: string): boolean {
    return segment && segment.match(/^[0-9]+$/g).length > 0;
  }
}
