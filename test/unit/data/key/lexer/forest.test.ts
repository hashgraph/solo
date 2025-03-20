// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Forest} from '../../../../../src/data/key/lexer/forest.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {Lexer} from '../../../../../src/data/key/lexer/lexer.js';
import {EnvironmentKeyFormatter} from '../../../../../src/data/key/environment-key-formatter.js';

describe('Lexer: Forest', () => {
  [
    {formatter: ConfigKeyFormatter.instance(), type: 'config'},
    {formatter: EnvironmentKeyFormatter.instance(), type: 'environment'},
  ].forEach(item => {
    describe(`Using ${item.formatter.constructor.name}`, () => {
      it('constructor with null lexer should throw error', () => {
        // @ts-expect-error - testing private constructor
        expect(() => new Forest(null, item.formatter)).to.throw('lexer must not be null or undefined');
      });

      it('constructor with null formatter should throw error', () => {
        // @ts-expect-error - testing private constructor
        expect(() => new Forest(new Lexer(new Map<string, string>(), item.formatter), null)).to.throw(
          'formatter must not be null or undefined',
        );
      });

      it('has with null key should throw error', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(() => forest.has(null)).to.throw('key must not be null or undefined');
      });

      it('valueFor with null key should throw error', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(() => forest.valueFor(null)).to.throw('key must not be null or undefined');
      });

      it('nodeFor with null key should throw error', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(() => forest.nodeFor(null)).to.throw('key must not be null or undefined');
      });

      it('nodeFor with empty key should throw error', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(() => forest.nodeFor(item.type === 'config' ? '.' : '_')).to.throw('key must not be empty');
      });

      it('from with empty data should return empty forest', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(forest.has(convertKey('key', item.type))).to.be.false;
        expect(forest.valueFor(convertKey('key', item.type))).to.be.null;
        expect(forest.nodeFor(convertKey('key', item.type))).to.be.null;
      });

      it('from with data should return forest', () => {
        const data: Map<string, string> = new Map<string, string>();
        data.set(convertKey('root.leaf', item.type), 'value');
        data.set(convertKey('root.internal.leaf2', item.type), 'value2');
        const forest: Forest = Forest.from(data, item.formatter);
        expect(forest.has(convertKey('root.leaf', item.type))).to.be.true;
        expect(forest.valueFor(convertKey('root.leaf', item.type))).to.equal('value');
        expect(forest.nodeFor(convertKey('root.leaf', item.type))).to.not.be.null;
        expect(forest.has(convertKey('root.internal.leaf2', item.type))).to.be.true;
        expect(forest.valueFor(convertKey('root.internal.leaf2', item.type))).to.equal('value2');
        expect(forest.nodeFor(convertKey('root.internal.leaf2', item.type))).to.not.be.null;
      });

      it('valueFor with a key that does not exist should return null', () => {
        const data: Map<string, string> = new Map<string, string>();
        data.set(convertKey('root.leaf', item.type), 'value');
        const forest: Forest = Forest.from(data, item.formatter);
        expect(forest.valueFor(convertKey('root.internal.leaf2', item.type))).to.be.null;
      });

      it('valueFor an internal node should return null', () => {
        const data: Map<string, string> = new Map<string, string>();
        data.set(convertKey('root.internal.leaf', item.type), 'value');
        const forest: Forest = Forest.from(data, item.formatter);
        expect(forest.valueFor(convertKey('root.internal', item.type))).to.be.null;
        expect(forest.valueFor(convertKey('root.internal.leaf2', item.type))).to.be.null;
      });

      it('toObject with empty data should return empty object', () => {
        const forest: Forest = Forest.from(new Map<string, string>(), item.formatter);
        expect(forest.toObject()).to.eql({});
      });

      it('toObject with data should return object', () => {
        const data: Map<string, string> = new Map<string, string>();
        data.set(convertKey('root.leaf', item.type), 'value');
        data.set(convertKey('root.internal.leaf2', item.type), 'value2');
        const forest: Forest = Forest.from(data, item.formatter);
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
        data.set(convertKey('root', item.type), 'stump');
        const forest: Forest = Forest.from(data, item.formatter);
        expect(forest.toObject()).to.eql({
          root: 'stump',
        });
      });
    });
  });
});

function convertKey(key: string, type: string): string {
  return type === 'config' ? key : key.toUpperCase().replaceAll('.', '_');
}
