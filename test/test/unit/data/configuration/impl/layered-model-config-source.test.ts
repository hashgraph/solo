// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LayeredModelConfigSource} from '../../../../../../src/data/configuration/impl/layered-model-config-source.js';

describe('LayeredModelConfigSource', () => {
  it('constructor with null ObjectMapper throws error', () => {
    expect(() => {
      // @ts-expect-error - testing protected constructor
      new LayeredModelConfigSource(null, null, null, null);
    }).to.throw('ObjectMapper is required');
  });
});
