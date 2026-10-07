// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {Flags} from '../../../src/commands/flags.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import * as constants from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

describe('wraps copy parallel env toggle', (): void => {
  beforeEach((): void => {
    resetForTest();
  });

  it('is not exposed as a CLI flag', (): void => {
    const deployFlags: CommandFlag[] = [
      ...NetworkCommand.DEPLOY_FLAGS_LIST.optional,
      ...NetworkCommand.DEPLOY_FLAGS_LIST.required,
    ];

    expect(Flags.allFlags.some((flag): boolean => flag.name === 'wraps-copy-parallel')).to.be.false;
    expect(deployFlags.some((flag): boolean => flag.name === 'wraps-copy-parallel')).to.be.false;
  });

  it('defaults to the sequential copy unless explicitly enabled via env var', (): void => {
    expect(constants.EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL).to.be.false;
  });
});
