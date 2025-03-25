// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from '../key-formatter.js';
import {ConfigKeyFormatter} from '../config-key-formatter.js';
import {type Node} from './node.js';
import {LexerInternalNode} from './lexer-internal-node.js';
import {LexerLeafNode} from './lexer-leaf-node.js';
import {KeyName} from '../key-name.js';
import {ConfigKeyError} from '../config-key-error.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';

export class Lexer {
  private readonly _roots: Map<string, Node> = new Map();
  private _rendered: boolean = false;

  public constructor(
    public readonly tokens: Map<string, string>,
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

  public addValue(key: string, value: string | null): void {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    const segments: string[] = this.formatter.split(this.formatter.normalize(key));

    let rootNode: Node;
    if (!this._roots.has(segments[0])) {
      rootNode = this.rootNodeFor(segments);
    } else {
      rootNode = this._roots.get(segments[0]);
    }

    this.processSegments(rootNode as LexerInternalNode, value, segments);
    this.tokens.set(key, value);
  }

  public replaceValue(node: Node, value: string | null): void {
    if (!node.isLeaf()) {
      throw new ConfigKeyError('key must be a leaf node');
    }

    if (node.isRoot()) {
      this._roots.set(node.name, new LexerLeafNode(null, node.name, value, this.formatter));
      this.tokens.set(node.name, value);
    } else {
      this.tokens.set(node.path(), value);
      (node.parent as LexerInternalNode).replaceChildValue(node, value);
    }
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
        this.processSegments(root as LexerInternalNode, this.tokens.get(key), segments);
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
      root = new LexerInternalNode(null, rootName, [], array, false, this.formatter);
    } else {
      root = new LexerLeafNode(null, rootName, this.tokens.get(rootName), this.formatter);
    }

    this._roots.set(rootName, root);
    return root;
  }

  private processSegments(root: LexerInternalNode, value: string, segments: string[]): void {
    let currentRoot = root;
    for (let i = 1; i < segments.length; i++) {
      const segment: string = segments[i];
      let node: Node;

      if (KeyName.isArraySegment(segment)) {
        node = this.processArraySegment(currentRoot, segment, value, i, segments);
      } else if (i >= segments.length - 1) {
        node = this.processLeafNode(currentRoot, segment, value);
      } else {
        node = this.processIntermediateSegment(currentRoot, segment, i, segments);
      }

      if (node.isInternal()) {
        currentRoot = node as LexerInternalNode;
      }
    }
  }

  /**
   * Processes an array segment. This method will create the necessary node to represent the array index.
   *
   * @param root {LexerInternalNode} the root node of this segment.
   * @param value {string} the value of the key.
   * @param segment {string} the segment to process.
   * @param idx {number} the index of the segment in the array.
   * @param segments {string[]} the array of segments.
   * @return {Node} the new root node which should be used as the current root or null if no intermediate/leaf node was
   * created.
   * @private
   */
  private processArraySegment(
    root: LexerInternalNode,
    segment: string,
    value: string,
    idx: number,
    segments: string[],
  ): Node {
    // Case where the array segment points at a value. Eg: LeafNode
    if (idx >= segments.length - 1) {
      return new LexerLeafNode(root, segment, value, this.formatter);
    } else {
      let node: Node = root.children.find(n => n.name === segment);
      if (node) {
        if (node.isLeaf()) {
          throw new ConfigKeyError('Cannot add a leaf node to another leaf node');
        }
        return node;
      }

      node = new LexerInternalNode(root, segment, [], false, true, this.formatter);
      root.addChild(node);
      return node;
    }
  }

  private processIntermediateSegment(root: LexerInternalNode, segment: string, idx: number, segments: string[]): Node {
    const existingNode: Node = root.children.find(n => n.name === segment);
    if (existingNode) {
      if (existingNode.isLeaf()) {
        throw new ConfigKeyError('Cannot add a leaf node to another leaf node');
      }

      return existingNode;
    }

    let node: Node;

    // root.arrVal.0 = string|number (not handled by this case)
    // root.arrVal.0.scalar = string|number (handles this case)
    if (root.isArray()) {
      node = new LexerInternalNode(root, segment, [], false, true, this.formatter);
    }

    if (idx < segments.length - 1) {
      const nextSegment: string = segments[idx + 1];
      if (KeyName.isArraySegment(nextSegment)) {
        node = new LexerInternalNode(root, segment, [], true, false, this.formatter);
      }
    }

    if (!node) {
      node = new LexerInternalNode(root, segment, [], false, false, this.formatter);
    }

    root.addChild(node);
    return node;
  }

  private processLeafNode(root: LexerInternalNode, segment: string, value: string): Node {
    if (root.isArray()) {
      throw new ConfigKeyError(
        `Cannot add a leaf node to an array node [ parent: '${root.path()}', child: '${segment}' ]`,
      );
    }

    if (root.children.find(n => n.name === segment)) {
      throw new ConfigKeyError(
        `Cannot add a leaf node to another leaf node [ parent: '${root.name}', child: '${segment}' ]`,
      );
    }

    const node: Node = new LexerLeafNode(root, segment, value, this.formatter);
    root.addChild(node);
    return node;
  }
}
