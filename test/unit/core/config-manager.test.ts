// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ConfigManager} from '../../../src/core/config-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {container} from 'tsyringe-neo';
import {getTestLogger} from '../../test-util.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {SoloWinstonLogger} from '../../../src/core/logging/solo-winston-logger.js';

describe('ConfigManager', () => {
  describe('update values using argv', () => {
    beforeEach(() => {
      container.clearInstances();
      container.register(InjectTokens.LogLevel, {useValue: 'debug'});
      container.register(InjectTokens.DevMode, {useValue: true});
      container.register(InjectTokens.SoloLogger, {useValue: new SoloWinstonLogger()});
      container.registerInstance(InjectTokens.SoloLogger, getTestLogger());
      container.register(InjectTokens.ConfigManager, {useClass: ConfigManager});
    });

    it('should update string flag value', () => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv = Argv.initializeEmpty();
      argv.setArg(flags.releaseTag, 'v0.42.5');

      cm.update(argv.build());
      expect(cm.getFlag(flags.releaseTag)).to.equal(argv.getArg<string>(flags.releaseTag));

      // ensure non-string values are converted to string
      cm.reset();
      argv.setArg(flags.releaseTag, true);
      cm.update(argv.build());
      expect(cm.getFlag(flags.releaseTag)).not.to.equal(argv.getArg<string>(flags.releaseTag));
      expect(cm.getFlag(flags.releaseTag)).to.equal(`${argv.getArg<string>(flags.releaseTag)}`);
    });

    it('should update number flag value', () => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv = Argv.initializeEmpty();
      argv.setArg(flags.replicaCount, 1);

      cm.update(argv.build());
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(argv.getArg<string>(flags.replicaCount));

      // ensure string values are converted to integer
      cm.reset();
      argv.setArg(flags.replicaCount, '1');
      cm.update(argv.build());
      expect(cm.getFlag(flags.replicaCount)).not.to.deep.equal(argv.getArg<number>(flags.replicaCount));
      expect(cm.getFlag(flags.replicaCount)).to.deep.equal(Number.parseInt(argv.getArg<string>(flags.replicaCount)));
    });

    it('should update boolean flag value', () => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);

      // boolean values should work
      const argv = Argv.initializeEmpty();
      argv.setArg(flags.devMode, true);
      cm.update(argv.build());
      expect(cm.getFlag(flags.devMode)).to.equal(argv.getArg<boolean>(flags.devMode));

      // ensure string "false" is converted to boolean
      cm.reset();
      argv.setArg(flags.devMode, 'false');
      cm.update(argv.build());
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv.getArg<boolean>(flags.devMode));
      expect(cm.getFlag(flags.devMode)).to.equal(false);

      // ensure string "true" is converted to boolean
      cm.reset();
      argv.setArg(flags.devMode, 'true');
      cm.update(argv.build());
      expect(cm.getFlag(flags.devMode)).not.to.equal(argv.getArg<boolean>(flags.devMode));
      expect(cm.getFlag(flags.devMode)).to.equal(true);
    });
  });

  describe('should apply precedence', () => {
    const aliases = {};
    aliases[flags.devMode.name] = [flags.devMode.name, flags.devMode.definition.alias]; // mock

    it('should take user input as the first preference', () => {
      // Given: config has value, argv has a different value
      // Expected:  argv should retain the value
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      cm.setFlag(flags.devMode, false);
      expect(cm.getFlag(flags.devMode)).not.to.be.ok;

      const argv = Argv.initializeEmpty();
      argv.setArg(flags.devMode, true); // devMode flag is set in argv but cached config has it

      const argv2 = cm.applyPrecedence(argv.build() as any, aliases);
      expect(cm.getFlag(flags.devMode)).to.not.be.ok; // shouldn't have changed the config yet
      expect(argv2[flags.devMode.name]).to.be.ok; // retain the value
    });

    it('should take default as the last preference', () => {
      // Given: neither config nor argv has the flag value set
      // Expected:  argv should inherit the default flag value
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      expect(cm.hasFlag(flags.devMode)).not.to.be.ok; // shouldn't have set

      const argv = Argv.initializeEmpty(); // devMode flag is not set in argv and cached config doesn't have it either
      const argv2 = cm.applyPrecedence(argv.build() as any, aliases);
      expect(cm.hasFlag(flags.devMode)).to.not.be.ok; // shouldn't have set
      expect(argv2[flags.devMode.name]).to.not.be.ok; // should have set from the default
    });
  });
});
