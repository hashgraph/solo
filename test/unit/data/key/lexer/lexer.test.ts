// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Lexer} from '../../../../../src/data/key/lexer/lexer.js';
import {type Node} from '../../../../../src/data/key/lexer/node.js';

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
    const lexer = new Lexer(lexerMap);
    const nodes: Node[] = lexer.rootNodes;
    expect(nodes).to.have.lengthOf(4);
  });
});
