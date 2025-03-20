// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Forest} from '../../../../../src/data/key/lexer/forest.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {Lexer} from '../../../../../src/data/key/lexer/lexer.js';

describe('Lexer: Forest', () => {
  it('constructor with null lexer should throw error', () => {
    // @ts-expect-error - testing private constructor
    expect(() => new Forest(null, ConfigKeyFormatter.instance())).to.throw('lexer must not be null or undefined');
  });

  it('constructor with null formatter should throw error', () => {
    // @ts-expect-error - testing private constructor
    expect(() => new Forest(new Lexer(new Map<string, string>(), ConfigKeyFormatter.instance()), null)).to.throw(
      'formatter must not be null or undefined',
    );
  });

  it('has with null key should throw error', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(() => forest.has(null)).to.throw('key must not be null or undefined');
  });

  it('valueFor with null key should throw error', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(() => forest.valueFor(null)).to.throw('key must not be null or undefined');
  });

  it('nodeFor with null key should throw error', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(() => forest.nodeFor(null)).to.throw('key must not be null or undefined');
  });

  it('nodeFor with empty key should throw error', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(() => forest.nodeFor('.')).to.throw('key must not be empty');
  });

  it('from with empty data should return empty forest', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(forest.has('key')).to.be.false;
    expect(forest.valueFor('key')).to.be.null;
    expect(forest.nodeFor('key')).to.be.null;
  });

  it('from with data should return forest', () => {
    const data: Map<string, string> = new Map<string, string>();
    data.set('root.leaf', 'value');
    data.set('root.internal.leaf2', 'value2');
    const forest: Forest = Forest.from(data);
    expect(forest.has('root.leaf')).to.be.true;
    expect(forest.valueFor('root.leaf')).to.equal('value');
    expect(forest.nodeFor('root.leaf')).to.not.be.null;
    expect(forest.has('root.internal.leaf2')).to.be.true;
    expect(forest.valueFor('root.internal.leaf2')).to.equal('value2');
    expect(forest.nodeFor('root.internal.leaf2')).to.not.be.null;
  });

  it('valueFor with a key that does not exist should return null', () => {
    const data: Map<string, string> = new Map<string, string>();
    data.set('root.leaf', 'value');
    const forest: Forest = Forest.from(data);
    expect(forest.valueFor('root.internal.leaf2')).to.be.null;
  });

  it('valueFor an internal node should return null', () => {
    const data: Map<string, string> = new Map<string, string>();
    data.set('root.internal.leaf', 'value');
    const forest: Forest = Forest.from(data);
    expect(forest.valueFor('root.internal')).to.be.null;
    expect(forest.valueFor('root.internal.leaf2')).to.be.null;
  });

  it('toObject with empty data should return empty object', () => {
    const forest: Forest = Forest.from(new Map<string, string>());
    expect(forest.toObject()).to.eql({});
  });

  it('toObject with data should return object', () => {
    const data: Map<string, string> = new Map<string, string>();
    data.set('root.leaf', 'value');
    data.set('root.internal.leaf2', 'value2');
    const forest: Forest = Forest.from(data);
    expect(forest.toObject()).to.eql({
      root: {
        leaf: 'value',
        internal: {
          leaf2: 'value2',
        },
      },
    });
  });

  it('toObject with simple data should return object', () => {
    const data: Map<string, string> = new Map<string, string>();
    data.set('root', 'stump');
    const forest: Forest = Forest.from(data);
    expect(forest.toObject()).to.eql({
      root: 'stump',
    });
  });
});
