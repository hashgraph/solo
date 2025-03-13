// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {type DependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

describe('DependencyManager', () => {
  let depManager: DependencyManager;

  before(() => {
    resetForTest();
    depManager = container.resolve(InjectTokens.DependencyManager);
  });

  describe('checkDependency', () => {
    it('should fail during invalid dependency check', async () => {
      await expect(depManager.checkDependency('INVALID_PROGRAM')).to.be.rejectedWith(
        "Dependency 'INVALID_PROGRAM' is not found",
      );
    });
  });
});
