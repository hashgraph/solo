// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {container} from 'tsyringe-neo';

describe('EnvironmentConfigSource', (): void => {
  it('test prefix is working correctly', async (): Promise<void> => {
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      process.env.ENV_NBR42_TRUE = '42';
      const prefix: string = 'ENV';
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(
        container.resolve<ObjectMapper>(InjectTokens.ObjectMapper),
        prefix,
      );
      expect(source.prefix).to.equal(prefix);
      await source.load();
      expect(source.properties().has('nbr42.true')).to.be.true;
    } finally {
      process.env = environment;
    }
  });

  it('ignores an environment override of the subprocess passthrough list', async (): Promise<void> => {
    // subprocess.* controls environment filtering for external commands, so it must not be
    // settable by the environment being filtered - otherwise anything able to set a variable
    // could switch the filter off using the filter's own configuration (issue #5895).
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      process.env['SOLO_SUBPROCESS_ADDITIONAL-ENVIRONMENT-VARIABLES_HELM_0'] = 'LD_PRELOAD';
      process.env['SOLO_TSS_READY-MAX-ATTEMPTS'] = '7';
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(
        container.resolve<ObjectMapper>(InjectTokens.ObjectMapper),
        'SOLO',
      );
      await source.load();

      expect(source.properties().has('subprocess.additionalEnvironmentVariables.helm.0')).to.be.false;
      // An unrelated key from the same source still loads, proving the filter is targeted.
      expect(source.properties().has('tss.readyMaxAttempts')).to.be.true;
    } finally {
      process.env = environment;
    }
  });
});
