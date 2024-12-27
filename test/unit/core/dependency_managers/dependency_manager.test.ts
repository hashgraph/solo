/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {expect} from 'chai';
import {describe, it} from 'mocha';

import {DependencyManager} from '../../../../src/core/dependency_managers/index.js';
import {container} from 'tsyringe-neo';
import {resetTestContainer} from '../../../test_container.js';

describe('DependencyManager', () => {
  let depManager;

  before(() => {
    resetTestContainer();
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
