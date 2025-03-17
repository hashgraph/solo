// SPDX-License-Identifier: Apache-2.0

import {HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {expect} from 'chai';

describe('HelmExecutionBuilder', () => {
  it('Test optionsWithMultipleValues null checks', () => {
    const builder = new HelmExecutionBuilder('.');
    expect(() => {
      builder.optionsWithMultipleValues(null as any, null as any);
    }).to.throw(Error);
    expect(() => {
      builder.optionsWithMultipleValues('test string', null as any);
    }).to.throw(Error);
  });

  it('Test environmentVariable null checks', () => {
    const builder = new HelmExecutionBuilder('.');
    expect(() => {
      builder.environmentVariable(null as any, null as any);
    }).to.throw(Error);
    expect(() => {
      builder.environmentVariable('test string', null as any);
    }).to.throw(Error);
  });

  it('Test workingDirectory null checks', () => {
    const builder = new HelmExecutionBuilder('.');
    expect(() => {
      builder.workingDirectory(null as any);
    }).to.throw(Error);
  });
});
