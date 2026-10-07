// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {DefaultOneShotCommand} from '../../../src/commands/one-shot/default-one-shot.js';
import {Flags} from '../../../src/commands/flags.js';

// Covers https://github.com/hiero-ledger/solo/issues/3296: `one-shot falcon deploy` must run without a values file.
describe('DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST', (): void => {
  it('accepts the values file as an optional flag and requires no flags', (): void => {
    expect(DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.required).to.deep.equal([]);
    expect(DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.optional).to.include(Flags.valuesFile);
  });
});
