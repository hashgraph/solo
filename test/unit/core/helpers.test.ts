// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import each from 'mocha-each';
import {Flags as flags} from '../../../src/commands/flags.js';

import * as helpers from '../../../src/core/helpers.js';

describe('Helpers', () => {
  each([
    {input: '', output: []},
    {input: 'node1', output: ['node1']},
    {input: 'node1,node3', output: ['node1', 'node3']},
  ]).it('should parse node aliases for input', ({input, output}: {input: string; output: string[]}) => {
    expect(helpers.parseNodeAliases(input, undefined, undefined)).to.deep.equal(output);
  });

  each([
    {input: [], output: []},
    {input: [1, 2, 3], output: [1, 2, 3]},
    {input: ['a', '2', '3'], output: ['a', '2', '3']},
  ]).it('should clone array for input', ({input, output}: {input: number[]; output: number[]}) => {
    const clonedArray = helpers.cloneArray(input);
    expect(clonedArray).to.deep.equal(output);
    expect(clonedArray).not.to.equal(input); // ensure cloning creates a new array
  });

  it('Should parse argv to args with datamask correctly', () => {
    const argv = {[flags.googleCredential.name]: 'VALUE'};
    const result = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.googleCredential.name} ${flags.googleCredential.definition.dataMask}`);
  });

  it('Should parse argv to args with boolean flag correctly', () => {
    const argv = {[flags.quiet.name]: true};
    const result = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.quiet.name}`);
  });

  it('Should parse argv to args with flag correctly', () => {
    const argv = {[flags.namespace.name]: 'VALUE'};
    const result = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.namespace.name} VALUE`);
  });
});
