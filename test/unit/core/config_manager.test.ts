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

import {ConfigManager} from '../../../src/core/index.js';
import * as flags from '../../../src/commands/flags.js';
import {testLogger} from '../../test_util.js';

describe('ConfigManager', () => {
  describe('update values using argv', () => {
    it('should update string flag value', () => {
      const cm = new ConfigManager(testLogger);
      const argv = {};
      argv[flags.releaseTag.name] = 'v0.42.5';

      cm.update(argv);
      expect(cm.getFlag(flags.releaseTag)).to.equal(argv[flags.releaseTag.name]);

      // ensure non-string values are converted to string
      cm.reset();
      argv[flags.releaseTag.name] = true;
      cm.update(argv);
      expect(cm.getFlag(flags.releaseTag)).not.to.equal(argv[flags.releaseTag.name]);
      expect(cm.getFlag(flags.releaseTag)).to.equal(`${argv[flags.releaseTag.name]}`);
    });

    it('should update number flag value', () => {
      const cm = new ConfigManager(testLogger);
      const argv = {};
      argv[flags.replicaCount.name] = 1;

      cm.update(argv);
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(argv[flags.replicaCount.name]);

      // ensure string values are converted to integer
      cm.reset();
      argv[flags.replicaCount.name] = '1';
      cm.update(argv);
      expect(cm.getFlag(flags.replicaCount)).not.to.deep.equal(argv[flags.replicaCount.name]);
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(Number.parseInt(argv[flags.replicaCount.name]));
    });

    it('should update boolean flag value', () => {
      const cm = new ConfigManager(testLogger);

      // boolean values should work
      const argv = {};
      argv[flags.devMode.name] = true;
      cm.update(argv);
      expect(cm.getFlag(flags.devMode)).to.equal(argv[flags.devMode.name]);

      // ensure string "false" is converted to boolean
      cm.reset();
      argv[flags.devMode.name] = 'false';
      cm.update(argv);
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv[flags.devMode.name]);
      expect(cm.getFlag(flags.devMode)).to.equal(false);

      // ensure string "true" is converted to boolean
      cm.reset();
      argv[flags.devMode.name] = 'true';
      cm.update(argv);
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv[flags.devMode.name]);
      expect(cm.getFlag(flags.devMode)).to.equal(true);
    });
  });

  describe('should apply precedence', () => {
    const aliases = {};
    aliases[flags.devMode.name] = [flags.devMode.name, flags.devMode.definition.alias]; // mock

    it('should take user input as the first preference', () => {
      // Given: config has value, argv has a different value
      // Expected:  argv should retain the value
      const cm = new ConfigManager(testLogger);
      cm.setFlag(flags.devMode, false);
      expect(cm.getFlag(flags.devMode)).not.to.be.ok;

      const argv = {};
      argv[flags.devMode.name] = true; // devMode flag is set in argv but cached config has it

      const argv2 = cm.applyPrecedence(argv as any, aliases);
      expect(cm.getFlag(flags.devMode)).to.not.be.ok; // shouldn't have changed the config yet
      expect(argv2[flags.devMode.name]).to.be.ok; // retain the value
    });

    it('should take default as the last preference', () => {
      // Given: neither config nor argv has the flag value set
      // Expected:  argv should inherit the default flag value
      const cm = new ConfigManager(testLogger);
      expect(cm.hasFlag(flags.devMode)).not.to.be.ok; // shouldn't have set

      const argv = {}; // devMode flag is not set in argv and cached config doesn't have it either
      const argv2 = cm.applyPrecedence(argv as any, aliases);
      expect(cm.hasFlag(flags.devMode)).to.not.be.ok; // shouldn't have set
      expect(argv2[flags.devMode.name]).to.not.be.ok; // should have set from the default
    });
  });
});
