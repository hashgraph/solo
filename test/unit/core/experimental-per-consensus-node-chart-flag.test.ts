// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';

/**
 * `constants.CONFIG` is evaluated once at module load, so each case re-imports the module with a cache
 * buster to observe a different environment. The flag gates an experimental deployment shape, so the
 * default matters as much as the toggle: anything other than the exact string `'true'` must leave it off.
 */
describe('EXPERIMENTAL_PER_CONSENSUS_NODE_CHART feature flag', (): void => {
  const environmentKey: string = 'EXPERIMENTAL_PER_CONSENSUS_NODE_CHART';
  let savedValue: string | undefined;
  let cacheBuster: number = 0;

  beforeEach((): void => {
    savedValue = process.env[environmentKey];
    delete process.env[environmentKey];
  });

  afterEach((): void => {
    if (savedValue === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = savedValue;
    }
  });

  async function readFlag(): Promise<boolean> {
    cacheBuster++;
    const module_: {CONFIG: {EXPERIMENTAL_PER_CONSENSUS_NODE_CHART: boolean}} = await import(
      `../../../src/core/constants.js?flag-test=${cacheBuster}`
    );
    return module_.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART;
  }

  it('defaults to false when the variable is unset', async (): Promise<void> => {
    expect(await readFlag()).to.be.false;
  });

  it('is enabled by the exact string "true"', async (): Promise<void> => {
    process.env[environmentKey] = 'true';

    expect(await readFlag()).to.be.true;
  });

  it('stays disabled for the literal string "false"', async (): Promise<void> => {
    // guards against the `Boolean(getEnvironmentVariable(...))` idiom, under which any non-empty
    // value — "false" included — would switch the experimental path on
    process.env[environmentKey] = 'false';

    expect(await readFlag()).to.be.false;
  });

  it('stays disabled for other truthy-looking values', async (): Promise<void> => {
    for (const value of ['1', 'yes', 'TRUE', 'on']) {
      process.env[environmentKey] = value;

      expect(await readFlag(), `value '${value}' must not enable the flag`).to.be.false;
    }
  });
});
