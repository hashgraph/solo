// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Lexer} from '../../../../../src/data/key/lexer/lexer.js';
import {type LexerInternalNode} from '../../../../../src/data/key/lexer/lexer-internal-node.js';
import {type LexerLeafNode} from '../../../../../src/data/key/lexer/lexer-leaf-node.js';
import {Forest} from '../../../../../src/data/key/lexer/forest.js';
import {ConfigKeyError} from '../../../../../src/data/key/config-key-error.js';
import {type Node} from '../../../../../src/data/key/lexer/node.js';

function overlappingPathLexer(): {
  lexer: Lexer;
  rootNode: LexerInternalNode;
  subObjectNode: LexerInternalNode;
  subArrayNode: LexerInternalNode;
  subArrayIndexNode: LexerInternalNode;
  deploymentsNode: LexerInternalNode;
  deploymentsArrayIndexNode: LexerInternalNode;
  clustersNode: LexerInternalNode;
} {
  const lexerMap = new Map<string, string>();
  lexerMap.set('root.object.value1', '1');
  lexerMap.set('root.object.value2', '2');
  lexerMap.set('root.object.value3', '3');
  lexerMap.set('root.array.0.index1', '4');
  lexerMap.set('root.array.0.index2', '5');
  lexerMap.set('root.array.0.index3', '6');
  lexerMap.set('deployments.0.clusters.0', 'true');
  lexerMap.set('deployments.0.clusters.1', 'false');
  lexerMap.set('deployments.0.settings.0.0', 'bob');
  lexerMap.set('deployments.0.settings.0.1', 'charlie');

  const lexer = new Lexer(lexerMap);
  lexer.renderTrees();
  expect(lexer.rootNodes).to.have.lengthOf(2);

  const rootNode: LexerInternalNode = lexer.rootNodes.find(v => v.name === 'root') as LexerInternalNode;
  expect(rootNode.name).to.equal('root');
  expect(rootNode.children).to.have.lengthOf(2);

  const subObjectNode: LexerInternalNode = rootNode.children.find(v => v.name === 'object') as LexerInternalNode;
  expect(subObjectNode).to.not.be.undefined.and.not.be.null;
  expect(subObjectNode.children).to.have.lengthOf(3);

  const subArrayNode: LexerInternalNode = rootNode.children.find(v => v.name === 'array') as LexerInternalNode;
  expect(subArrayNode).to.not.be.undefined.and.not.be.null;
  expect(subArrayNode.children).to.have.lengthOf(1);
  expect(subArrayNode.isArray()).to.be.true;

  const subArrayIndexNode: LexerInternalNode = subArrayNode.children[0] as LexerInternalNode;
  expect(subArrayIndexNode).to.not.be.undefined.and.not.be.null;
  expect(subArrayIndexNode.name).to.equal('0');
  expect(subArrayIndexNode.isArrayIndex()).to.be.true;
  expect(subArrayIndexNode.children).to.have.lengthOf(3);

  const index1Node = subArrayIndexNode.children.find(v => v.name === 'index1') as LexerLeafNode;
  expect(index1Node).to.not.be.undefined.and.not.be.null;
  expect(index1Node.isLeaf()).to.be.true;
  expect(index1Node.value).to.be.equal('4');

  const deploymentsNode: LexerInternalNode = lexer.rootNodes.find(v => v.name === 'deployments') as LexerInternalNode;
  expect(deploymentsNode).to.not.be.undefined.and.not.be.null;
  expect(deploymentsNode.children).to.have.lengthOf(1);
  expect(deploymentsNode.isArray()).to.be.true;

  const deploymentsArrayIndexNode: LexerInternalNode = deploymentsNode.children[0] as LexerInternalNode;
  expect(deploymentsArrayIndexNode).to.not.be.undefined.and.not.be.null;
  expect(deploymentsArrayIndexNode.isArrayIndex()).to.be.true;

  const clustersNode = deploymentsArrayIndexNode.children[0] as LexerInternalNode;
  expect(clustersNode).to.not.be.undefined.and.not.be.null;
  expect(clustersNode.name).to.equal('clusters');
  expect(clustersNode.isArray()).to.be.true;
  expect(clustersNode.children).to.have.lengthOf(2);

  const clustersArrayIndex0Node = clustersNode.children[0] as LexerLeafNode;
  expect(clustersArrayIndex0Node).to.not.be.undefined.and.not.be.null;
  expect(clustersArrayIndex0Node.isArrayIndex()).to.be.true;
  expect(clustersArrayIndex0Node.isLeaf()).to.be.true;
  expect(clustersArrayIndex0Node.value).to.be.equal('true');

  const clustersArrayIndex1Node = clustersNode.children[1] as LexerLeafNode;
  expect(clustersArrayIndex1Node).to.not.be.undefined.and.not.be.null;
  expect(clustersArrayIndex1Node.isArrayIndex()).to.be.true;
  expect(clustersArrayIndex1Node.isLeaf()).to.be.true;
  expect(clustersArrayIndex1Node.value).to.be.equal('false');

  const settingsNode = deploymentsArrayIndexNode.children[1] as LexerInternalNode;
  expect(settingsNode).to.not.be.undefined.and.not.be.null;
  expect(settingsNode.name).to.equal('settings');
  expect(settingsNode.isArray()).to.be.true;
  expect(settingsNode.children).to.have.lengthOf(1);

  const settingsArrayIndex0Node = settingsNode.children[0] as LexerInternalNode;
  expect(settingsArrayIndex0Node).to.not.be.undefined.and.not.be.null;
  expect(settingsArrayIndex0Node.name).to.equal('0');
  expect(settingsArrayIndex0Node.isArrayIndex()).to.be.true;
  expect(settingsArrayIndex0Node.children).to.have.lengthOf(2);

  const settingsArrayIndex0Index0Node = settingsArrayIndex0Node.children[0] as LexerLeafNode;
  expect(settingsArrayIndex0Index0Node).to.not.be.undefined.and.not.be.null;
  expect(settingsArrayIndex0Index0Node.name).to.equal('0');
  expect(settingsArrayIndex0Index0Node.isLeaf()).to.be.true;
  expect(settingsArrayIndex0Index0Node.value).to.be.equal('bob');

  const settingsArrayIndex0Index1Node = settingsArrayIndex0Node.children[1] as LexerLeafNode;
  expect(settingsArrayIndex0Index1Node).to.not.be.undefined.and.not.be.null;
  expect(settingsArrayIndex0Index1Node.name).to.equal('1');
  expect(settingsArrayIndex0Index1Node.isLeaf()).to.be.true;
  expect(settingsArrayIndex0Index1Node.value).to.be.equal('charlie');

  return {
    lexer,
    rootNode,
    subObjectNode,
    subArrayNode,
    subArrayIndexNode,
    deploymentsNode,
    deploymentsArrayIndexNode,
    clustersNode,
  };
}

describe('Lexer', () => {
  it('with empty token in constructor should throw error', () => {
    expect(() => {
      new Lexer(null);
    }).to.throw('tokens must be provided');
  });

  it('with empty formatter in constructor should throw error', () => {
    expect(() => {
      new Lexer(new Map(), null);
    }).to.throw('formatter must be provided');
  });

  it('get rootNodes should return empty array', () => {
    const lexer = new Lexer(new Map());
    expect(lexer.rootNodes).to.be.empty;
  });

  it('rootNodeFor with array segment', () => {
    const lexer = new Lexer(new Map());
    // @ts-expect-error - access private method for testing
    const node = lexer.rootNodeFor(['secret', '42', 'everything', 'is', '42', 'true']);
    expect(node.name).to.equal('secret');
    expect(node.isArray()).to.be.true;
  });

  it('processKeys with an array segment', () => {
    const lexerMap = new Map<string, string>();
    lexerMap.set('secret.42.is.everything', 'true');
    lexerMap.set('everything-is-42', 'true');
    lexerMap.set('secret.42.is.42', 'true');
    lexerMap.set('42.is.everything', 'true');
    lexerMap.set('array.0.is.everything', 'true');
    lexerMap.set('array.1.is.everything', 'true');
    lexerMap.set('array.alpha.2.is.everything', 'true');
    let lexer = new Lexer(lexerMap);

    expect(() => lexer.rootNodes).to.throw(
      ConfigKeyError,
      "Cannot add a leaf node to an array node [ parent: 'secret.42.is', child: 'everything' ]",
    );

    lexerMap.delete('secret.42.is.everything');
    lexer = new Lexer(lexerMap);
    const nodes: Node[] = lexer.rootNodes;
    expect(nodes).to.have.lengthOf(4);
  });

  it('processKeys works with overlapping paths', () => {
    overlappingPathLexer();
  });

  it('addValue works with overlapping paths', () => {
    const {lexer, rootNode, subObjectNode, subArrayIndexNode} = overlappingPathLexer();

    lexer.addValue('root.array.0.index4', '7');
    lexer.addValue('root.object.value4', '8');

    expect(lexer.rootNodes).to.have.lengthOf(2);
    expect(rootNode.children).to.have.lengthOf(2);
    expect(subObjectNode.children).to.have.lengthOf(4);
    expect(subArrayIndexNode.children).to.have.lengthOf(4);

    const index4Node = subArrayIndexNode.children.find(v => v.name === 'index4') as LexerLeafNode;
    expect(index4Node).to.not.be.undefined.and.not.be.null;
    expect(index4Node.isLeaf()).to.be.true;
    expect(index4Node.value).to.be.equal('7');

    const value4Node = subObjectNode.children.find(v => v.name === 'value4') as LexerLeafNode;
    expect(value4Node).to.not.be.undefined.and.not.be.null;
    expect(value4Node.isLeaf()).to.be.true;
    expect(value4Node.value).to.be.equal('8');
  });

  it('replaceValue works with overlapping paths', () => {
    const {lexer, rootNode, subObjectNode, subArrayNode, subArrayIndexNode} = overlappingPathLexer();
    const forest: Forest = Forest.fromLexer(lexer);
    lexer.replaceValue(forest.nodeFor('root.array.0.index1'), '9');
    lexer.replaceValue(forest.nodeFor('root.object.value1'), '10');

    expect(lexer.rootNodes).to.have.lengthOf(2);
    expect(rootNode.children).to.have.lengthOf(2);
    expect(subObjectNode.children).to.have.lengthOf(3);
    expect(subArrayNode.children).to.have.lengthOf(1);
    expect(subArrayIndexNode.children).to.have.lengthOf(3);

    const index1Node = subArrayIndexNode.children.find(v => v.name === 'index1') as LexerLeafNode;
    expect(index1Node).to.not.be.undefined.and.not.be.null;
    expect(index1Node.isLeaf()).to.be.true;
    expect(index1Node.value).to.be.equal('9');

    const value1Node = subObjectNode.children.find(v => v.name === 'value1') as LexerLeafNode;
    expect(value1Node).to.not.be.undefined.and.not.be.null;
    expect(value1Node.isLeaf()).to.be.true;
    expect(value1Node.value).to.be.equal('10');
  });
});
