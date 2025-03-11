// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {
  SoloError,
  ResourceNotFoundError,
  MissingArgumentError,
  IllegalArgumentError,
  DataValidationError,
} from '../../../src/core/errors.js';

describe('Errors', () => {
  const message = 'errorMessage';
  const cause = new Error('cause');

  it('should construct correct SoloError', () => {
    const error = new SoloError(message, cause);
    expect(error).to.be.instanceof(Error);
    expect(error.name).to.equal('SoloError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal(cause);
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct ResourceNotFoundError', () => {
    const resource = 'resource';
    const error = new ResourceNotFoundError(message, resource);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('ResourceNotFoundError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({resource});
  });

  it('should construct correct MissingArgumentError', () => {
    const error = new MissingArgumentError(message);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('MissingArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct IllegalArgumentError', () => {
    const value = 'invalid argument';
    const error = new IllegalArgumentError(message, value);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('IllegalArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({value});
  });

  it('should construct correct DataValidationError', () => {
    const expected = 'expected';
    const found = 'found';
    const error = new DataValidationError(message, expected, found);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('DataValidationError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({expected, found});
  });
});
