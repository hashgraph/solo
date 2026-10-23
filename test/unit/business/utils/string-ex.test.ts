// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {StringEx} from '../../../../src/business/utils/string-ex.js';
import {UnsupportedOperationError} from '../../../../src/core/errors/classes/internal/unsupported-operation-error.js';

describe('StringEx', (): void => {
  describe('constructor', (): void => {
    it('should throw UnsupportedOperationError when instantiated', (): void => {
      expect((): any => new (StringEx as any)()).to.throw(UnsupportedOperationError);
    });
  });

  describe('isUppercase', (): void => {
    it('should return true for uppercase strings', (): void => {
      expect(StringEx.isUppercase('HELLO')).to.be.true;
    });

    it('should return false for lowercase strings', (): void => {
      expect(StringEx.isUppercase('hello')).to.be.false;
    });
  });

  describe('isEmpty', (): void => {
    it('should return true for empty strings', (): void => {
      expect(StringEx.isEmpty('')).to.be.true;
    });

    it('should return false for non-empty strings', (): void => {
      expect(StringEx.isEmpty('hello')).to.be.false;
    });
  });

  describe('isUnderscored', (): void => {
    it('should return true for strings containing underscores', (): void => {
      expect(StringEx.isUnderscored('hello_world')).to.be.true;
    });

    it('should return false for strings without underscores', (): void => {
      expect(StringEx.isUnderscored('hello-world')).to.be.false;
    });
  });

  describe('isDashed', (): void => {
    it('should return true for strings containing dashes', (): void => {
      expect(StringEx.isDashed('hello-world')).to.be.true;
    });

    it('should return false for strings without dashes', (): void => {
      expect(StringEx.isDashed('hello_world')).to.be.false;
    });
  });

  describe('nounCase', (): void => {
    it('should capitalize the first letter of a string', (): void => {
      expect(StringEx.nounCase('hello')).to.equal('Hello');
    });

    it('should return an empty string if the input is empty', (): void => {
      expect(StringEx.nounCase('')).to.equal('');
    });
  });

  describe('verbCase', (): void => {
    it('should lowercase the first letter of a string', (): void => {
      expect(StringEx.verbCase('Hello')).to.equal('hello');
    });

    it('should return an empty string if the input is empty', (): void => {
      expect(StringEx.verbCase('')).to.equal('');
    });
  });

  describe('kebabToCamelCase', (): void => {
    it('should convert kebab-case to camelCase', (): void => {
      expect(StringEx.kebabToCamelCase('hello-world')).to.equal('helloWorld');
    });

    it('should return the original string if it is not kebab-case', (): void => {
      expect(StringEx.kebabToCamelCase('hello')).to.equal('hello');
    });
  });

  describe('snakeToCamelCase', (): void => {
    it('should convert snake_case to camelCase', (): void => {
      expect(StringEx.snakeToCamelCase('hello_world')).to.equal('helloWorld');
    });

    it('should return the original string if it is not snake_case', (): void => {
      expect(StringEx.snakeToCamelCase('hello')).to.equal('hello');
    });
  });

  describe('snakeToDotCase', (): void => {
    it('should convert snake_case to dot.case', (): void => {
      expect(StringEx.snakeToDotCase('hello_world')).to.equal('hello.world');
    });

    it('should return the original string if it is not snake_case', (): void => {
      expect(StringEx.snakeToDotCase('hello')).to.equal('hello');
    });
  });

  describe('camelCaseToSnake', (): void => {
    it('should convert camelCase to snake_case', (): void => {
      expect(StringEx.camelCaseToSnake('helloWorld')).to.equal('hello_world');
    });

    it('should return the original string if it is not camelCase', (): void => {
      expect(StringEx.camelCaseToSnake('hello')).to.equal('hello');
    });

    it('should never emit a dash, which is invalid in an environment variable name', (): void => {
      expect(StringEx.camelCaseToSnake('ingressControllerHelmChart')).to.equal('ingress_controller_helm_chart');
    });
  });
});
