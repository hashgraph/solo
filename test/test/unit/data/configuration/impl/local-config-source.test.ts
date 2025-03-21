// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LocalConfigSource} from '../../../../../../src/data/configuration/impl/local-config-source.js';

describe('LocalConfigSource', () => {
  it('constructor with null ObjectMapper throws error', () => {
    expect(() => {
      new LocalConfigSource(null, null, null, null);
    }).to.throw('ObjectMapper is required');
  });
});
