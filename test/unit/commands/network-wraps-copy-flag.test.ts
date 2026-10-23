// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {Flags} from '../../../src/commands/flags.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import {resetForTest} from '../../test-container.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

describe('network WRAPS copy concurrency', (): void => {
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
});
