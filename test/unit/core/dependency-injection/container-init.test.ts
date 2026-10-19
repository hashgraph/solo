// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import {container} from 'tsyringe-neo';
import {Container} from '../../../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../../src/core/constants.js';
import {resetTestContainer} from '../../../test-container.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

describe('Container', (): void => {
  let temporaryDirectory: string;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'container-init-'));
  });

  afterEach((): void => {
    // Restore the container to the test configuration so other suites are unaffected. Restoring the
    // real Solo home instead would point the logger at the user's own ~/.solo/logs for every suite
    // that runs afterwards.
    resetTestContainer();
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  describe('init', (): void => {
    it('should create a missing home directory so home-dependent services resolve on a fresh machine', (): void => {
      const homeDirectory: string = PathEx.join(temporaryDirectory, 'missing-parent', 'solo-home');
      expect(fs.existsSync(homeDirectory)).to.be.false;

      Container.getInstance().reset(homeDirectory, PathEx.join(homeDirectory, 'cache'), constants.SOLO_LOG_LEVEL);

      expect(fs.existsSync(homeDirectory)).to.be.true;
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      expect(localConfig).to.not.be.undefined;
    });

    it('should initialize normally when the home directory already exists', (): void => {
      Container.getInstance().reset(
        temporaryDirectory,
        PathEx.join(temporaryDirectory, 'cache'),
        constants.SOLO_LOG_LEVEL,
      );

      expect(fs.existsSync(temporaryDirectory)).to.be.true;
      expect((): LocalConfigRuntimeState => container.resolve(InjectTokens.LocalConfigRuntimeState)).to.not.throw();
    });
  });
});
