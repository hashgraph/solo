// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {container} from 'tsyringe-neo';

describe('EnvironmentConfigSource', () => {
  it('test prefix is working correctly', async () => {
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
});
