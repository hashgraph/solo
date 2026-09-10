// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {FlagRules} from '../../../../src/commands/validation/flag-rules.js';

describe('FlagRules', (): void => {
  describe('dnsLabel', (): void => {
    it('should accept a lowercase alphanumeric label with dashes', (): void => {
      expect(FlagRules.dnsLabel('solo-e2e-1')).to.be.undefined;
    });

    it('should reject uppercase characters and underscores', (): void => {
      expect(FlagRules.dnsLabel('Solo')).to.contain('lowercase');
      expect(FlagRules.dnsLabel('bad_name')).to.not.be.undefined;
    });

    it('should reject a label not ending with an alphanumeric character', (): void => {
      expect(FlagRules.dnsLabel('solo-')).to.not.be.undefined;
    });

    it('should reject a label longer than 63 characters', (): void => {
      expect(FlagRules.dnsLabel('a'.repeat(63))).to.be.undefined;
      expect(FlagRules.dnsLabel('a'.repeat(64))).to.not.be.undefined;
    });
  });

  describe('nodeAlias', (): void => {
    it('should accept a node alias with a positive index', (): void => {
      expect(FlagRules.nodeAlias('node1')).to.be.undefined;
      expect(FlagRules.nodeAlias('node99')).to.be.undefined;
    });

    it('should reject a name that is not a node alias', (): void => {
      expect(FlagRules.nodeAlias('foo')).to.contain('node<number>');
    });

    it('should reject a node alias without a positive index', (): void => {
      expect(FlagRules.nodeAlias('node')).to.not.be.undefined;
      expect(FlagRules.nodeAlias('node0')).to.not.be.undefined;
    });
  });

  describe('alphanumeric', (): void => {
    it('should accept letters and numbers', (): void => {
      expect(FlagRules.alphanumeric('jan99')).to.be.undefined;
    });

    it('should reject punctuation', (): void => {
      expect(FlagRules.alphanumeric('jan.milenkov')).to.contain('letters and numbers');
    });
  });

  describe('integer', (): void => {
    it('should accept a whole number', (): void => {
      expect(FlagRules.integer('3')).to.be.undefined;
    });

    it('should accept a negative whole number and tolerate surrounding whitespace', (): void => {
      expect(FlagRules.integer('-3')).to.be.undefined;
      expect(FlagRules.integer('  3  ')).to.be.undefined;
    });

    it('should reject a non-numeric or fractional value', (): void => {
      expect(FlagRules.integer('abc')).to.equal('must be a whole number');
      expect(FlagRules.integer('')).to.equal('must be a whole number');
      expect(FlagRules.integer('1.5')).to.not.be.undefined;
    });

    it('should reject numeric forms the user did not write as a whole number', (): void => {
      // Number.isInteger(Number(value)) accepts all of these even though none is spelled as a whole number.
      for (const value of ['1e2', '1.', '0x10', '0b11', '0o17']) {
        expect(FlagRules.integer(value), value).to.equal('must be a whole number');
      }
    });
  });

  describe('atLeast', (): void => {
    it('should accept a value at the bound', (): void => {
      expect(FlagRules.atLeast(1)('1')).to.be.undefined;
    });

    it('should reject a value below the bound', (): void => {
      expect(FlagRules.atLeast(1)('0')).to.equal('must be at least 1');
      expect(FlagRules.atLeast(1)('-5')).to.equal('must be at least 1');
    });
  });

  describe('oneOf', (): void => {
    it('should accept a permitted value', (): void => {
      expect(FlagRules.oneOf('acme-prod', 'self-signed')('self-signed')).to.be.undefined;
    });

    it('should reject anything else and list the permitted values', (): void => {
      expect(FlagRules.oneOf('acme-prod', 'self-signed')('garbage')).to.equal('must be one of: acme-prod, self-signed');
    });
  });

  describe('each', (): void => {
    it('should accept a list whose every entry satisfies the wrapped rule', (): void => {
      expect(FlagRules.each(FlagRules.nodeAlias)('node1,node2,node3')).to.be.undefined;
    });

    it('should accept a single entry and tolerate surrounding whitespace', (): void => {
      expect(FlagRules.each(FlagRules.nodeAlias)('node1')).to.be.undefined;
      expect(FlagRules.each(FlagRules.nodeAlias)('node1, node2')).to.be.undefined;
    });

    it('should name the offending entry when one fails', (): void => {
      const violation: string | undefined = FlagRules.each(FlagRules.nodeAlias)('node1,BAR!');

      expect(violation).to.contain("entry 'BAR!'");
      expect(violation).to.contain('node<number>');
    });

    it('should nest', (): void => {
      expect(FlagRules.each(FlagRules.each(FlagRules.dnsLabel))('a,b')).to.be.undefined;
    });
  });
});
