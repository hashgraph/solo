// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {type Node} from './node.js';
import {InternalNode} from './internal-node.js';
import {LeafNode} from './leaf-node.js';
import {KeyName} from '../key-name.js';
import {ConfigKeyError} from '../config-key-error.js';

export class Lexer {
  private readonly _roots: Map<string, Node> = new Map();
  private _rendered: boolean = false;

  public constructor(
    private readonly tokens: Map<string, string>,
    private readonly formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ) {
    if (!this.tokens) {
      throw new ConfigKeyError('tokens must be provided');
    }

    if (!this.formatter) {
      throw new ConfigKeyError('formatter must be provided');
    }
  }

  public get rendered(): boolean {
    return this._rendered;
  }

  private set rendered(rendered: boolean) {
    this._rendered = rendered;
  }

  public get rootNodes(): Node[] {
    if (!this.rendered) {
      this.renderTrees();
    }

    return Array.from(this._roots.values());
  }

  public get tree(): Map<string, Node> {
    if (!this.rendered) {
      this.renderTrees();
    }

    return this._roots;
  }

  /**
   * Parses the token map and returns all the root nodes.
   *
   * @returns {Node[]} The root nodes.
   */
  public renderTrees(): void {
    if (this.tokens.size === 0 || this.rendered) {
      return;
    }

    const keys: string[] = Array.from(this.tokens.keys());

    // Sort the keys so that we can process them in order.
    keys.sort();

    this.processKeys(keys);
    this.rendered = true;
  }

  private processKeys(keys: string[]): void {
    for (const k of keys) {
      const key = this.formatter.normalize(k);
      const segments: string[] = this.formatter.split(key);

      const root: Node = this.rootNodeFor(segments);
      if (!root.isLeaf()) {
        this.processSegments(root as InternalNode, this.tokens.get(key), segments);
      }
    }
  }

  private rootNodeFor(keyParts: string[]): Node {
    const rootName: string = keyParts[0];

    if (this._roots.has(rootName)) {
      return this._roots.get(rootName);
    }

    let array: boolean = false;
    let root: Node;

    if (keyParts.length >= 2) {
      const nextSegment: string = keyParts[1];
      if (KeyName.isArraySegment(nextSegment)) {
        array = true;
      }
      root = new InternalNode(null, rootName, [], array);
    } else {
      root = new LeafNode(null, rootName, this.tokens.get(rootName));
    }

    this._roots.set(rootName, root);
    return root;
  }

  private processSegments(root: InternalNode, value: string, segments: string[]): void {
    let currentRoot = root;
    for (let i = 1; i < segments.length; i++) {
      const segment: string = segments[i];

      let node = null;

      if (KeyName.isArraySegment(segment)) {
        node = this.processArraySegment(currentRoot, segment, value, i, segments);
      } else if (i + 1 >= segments.length) {
        node = new LeafNode(currentRoot, segment, value);
      } else {
        node = this.processIntermediateSegment(currentRoot, segment, i, segments);
      }

      currentRoot.addChild(node);
      if (node.isInternal()) {
        currentRoot = node as InternalNode;
      }
    }
  }

  /**
   * Processes an array segment. This method will create the necessary node to represent the array index.
   *
   * @param root {InternalNode} the root node of this segment.
   * @param value {string} the value of the key.
   * @param segment {string} the segment to process.
   * @param idx {number} the index of the segment in the array.
   * @param segments {string[]} the array of segments.
   * @return {Node} the new root node which should be used as the current root or null if no intermediate/leaf node was
   * created.
   * @private
   */
  private processArraySegment(
    root: InternalNode,
    segment: string,
    value: string,
    idx: number,
    segments: string[],
  ): Node {
    // Case where the array segment points at a value. Eg: LeafNode
    if (idx + 1 >= segments.length) {
      return new LeafNode(root, segment, value);
    } else {
      return root.children[+segment] || new InternalNode(root, segment, [], false, true);
    }
  }

  private processIntermediateSegment(root: InternalNode, segment: string, idx: number, segments: string[]): Node {
    // root.arrVal.0 = string|number (not handled by this case)
    // root.arrVal.0.scalar = string|number (handles this case)
    if (root.isArray()) {
      return new InternalNode(root, segment, [], false, true);
    }

    if (idx + 1 < segments.length) {
      const nextSegment: string = segments[idx + 1];
      if (KeyName.isArraySegment(nextSegment)) {
        return new InternalNode(root, segment, [], true);
      }
    }

    return new InternalNode(root, segment, []);
  }
}
