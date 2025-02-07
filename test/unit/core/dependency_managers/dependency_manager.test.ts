/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {describe, it} from 'mocha';

import {DependencyManager} from '../../../../src/core/dependency_managers/index.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../test_container.js';

describe('DependencyManager', () => {
  let depManager;

  before(() => {
    resetForTest();
    depManager = container.resolve(DependencyManager);
  });

  describe('checkDependency', () => {
    it('should fail during invalid dependency check', async () => {
      await expect(depManager.checkDependency('INVALID_PROGRAM')).to.be.rejectedWith(
        "Dependency 'INVALID_PROGRAM' is not found",
      );
    });
  });
});
