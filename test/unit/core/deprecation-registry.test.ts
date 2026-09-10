// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';

import {DeprecationRegistry} from '../../../src/core/deprecation-registry.js';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type RegisteredDeprecation} from '../../../src/types/registered-deprecation.js';

describe('DeprecationRegistry', (): void => {
  const temporaryFlag: CommandFlag = {
    constName: 'temporaryDeprecatedFlag',
    name: 'temporary-deprecated-flag',
    definition: {
      describe: 'a flag that exists only for this test',
      type: 'boolean',
      deprecated: {since: '0.84.0', removalIssue: 5181, replacement: '--replacement-flag'},
    },
    prompt: undefined,
  };

  beforeEach((): void => {
    Flags.allFlags.push(temporaryFlag);
  });

  afterEach((): void => {
    const index: number = Flags.allFlags.indexOf(temporaryFlag);
    if (index !== -1) {
      Flags.allFlags.splice(index, 1);
    }
  });

  it('derives flag deprecations from the flag registry', (): void => {
    const registry: DeprecationRegistry = new DeprecationRegistry();
    const flagEntry: RegisteredDeprecation | undefined = registry
      .list()
      .find((entry: RegisteredDeprecation): boolean => entry.feature === '--temporary-deprecated-flag');

    expect(flagEntry).to.not.equal(undefined);
    expect(flagEntry?.kind).to.equal('flag');
    expect(flagEntry?.deprecation.removalIssue).to.equal(5181);
  });

  it('records registered command and subcommand deprecations', (): void => {
    const registry: DeprecationRegistry = new DeprecationRegistry();
    registry.registerCommand('deployment refresh', 'command', {since: '0.84.0', removalIssue: 5181});
    registry.registerCommand('deployment refresh port-forwards', 'subcommand', {since: '0.84.0', removalIssue: 5181});

    const features: string[] = registry.list().map((entry: RegisteredDeprecation): string => entry.feature);
    expect(features).to.include('deployment refresh');
    expect(features).to.include('deployment refresh port-forwards');
  });

  it('deduplicates repeated command registrations by feature path', (): void => {
    const registry: DeprecationRegistry = new DeprecationRegistry();
    registry.registerCommand('deployment refresh', 'command', {since: '0.84.0', removalIssue: 5181});
    registry.registerCommand('deployment refresh', 'command', {since: '0.84.0', removalIssue: 5181});

    const matches: RegisteredDeprecation[] = registry
      .list()
      .filter((entry: RegisteredDeprecation): boolean => entry.feature === 'deployment refresh');
    expect(matches).to.have.lengthOf(1);
  });
});
