// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ConfigManager} from '../../../src/core/config-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {container} from 'tsyringe-neo';
import {BASE_TEST_DIR, getTestLogger} from '../../test-utility.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {type AnyYargs} from '../../../src/types/aliases.js';
import type * as yargs from 'yargs';

describe('ConfigManager', (): void => {
  beforeEach((): void => {
    container.clearInstances();
    container.register(InjectTokens.LogLevel, {useValue: 'debug'});
    container.register(InjectTokens.DevelopmentMode, {useValue: true});
    // clearInstances() drops value registrations, so the home directory has to be re-registered
    // before constructing a logger; otherwise it falls back to the real Solo home and writes into
    // the user's own ~/.solo/logs.
    container.register(InjectTokens.HomeDirectory, {useValue: BASE_TEST_DIR});
    container.register(InjectTokens.SoloLogger, {useValue: new SoloPinoLogger()});
    container.registerInstance(InjectTokens.SoloLogger, getTestLogger());
    container.register(InjectTokens.ConfigManager, {useClass: ConfigManager});
  });

  describe('update values using argv', (): void => {
    it('should update string flag value', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.consensusNodeVersion, 'v0.42.5');

      cm.update(argv.build());
      expect(cm.getFlag(flags.consensusNodeVersion)).to.equal(argv.getArg<string>(flags.consensusNodeVersion));

      // ensure non-string values are converted to string
      cm.reset();
      argv.setArg(flags.consensusNodeVersion, true);
      cm.update(argv.build());
      expect(cm.getFlag(flags.consensusNodeVersion)).not.to.equal(argv.getArg<string>(flags.consensusNodeVersion));
      expect(cm.getFlag(flags.consensusNodeVersion)).to.equal(`${argv.getArg<string>(flags.consensusNodeVersion)}`);
    });

    it('should update number flag value', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
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

    it('should update boolean flag value', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);

      // boolean values should work
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.debugMode, true);
      cm.update(argv.build());
      expect(cm.getFlag(flags.debugMode)).to.equal(argv.getArg<boolean>(flags.debugMode));

      // ensure string "false" is converted to boolean
      cm.reset();
      argv.setArg(flags.debugMode, 'false');
      cm.update(argv.build());
      expect(cm.getFlag(flags.debugMode)).not.to.equal(argv.getArg<boolean>(flags.debugMode));
      expect(cm.getFlag(flags.debugMode)).to.equal(false);

      // ensure string "true" is converted to boolean
      cm.reset();
      argv.setArg(flags.debugMode, 'true');
      cm.update(argv.build());
      expect(cm.getFlag(flags.debugMode)).not.to.equal(argv.getArg<boolean>(flags.debugMode));
      expect(cm.getFlag(flags.debugMode)).to.equal(true);
    });
  });

  describe('should apply precedence', (): void => {
    const aliases: Record<string, string[]> = {
      [flags.debugMode.name]: [flags.debugMode.name, flags.debugMode.definition.alias as string],
    }; // mock

    it('should take user input as the first preference', (): void => {
      // Given: config has value, argv has a different value
      // Expected:  argv should retain the value
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      cm.setFlag(flags.debugMode, false);
      expect(cm.getFlag(flags.debugMode)).not.to.be.ok;

      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.debugMode, true); // debugMode flag is set in argv but cached config has it

      const argv2: yargs.Argv<AnyYargs> = cm.applyPrecedence(argv.build() as unknown as yargs.Argv<AnyYargs>, aliases);
      expect(cm.getFlag(flags.debugMode)).to.not.be.ok; // shouldn't have changed the config yet
      expect(argv2[flags.debugMode.name]).to.be.ok; // retain the value
    });

    it('should take default as the last preference', (): void => {
      // Given: neither config nor argv has the flag value set
      // Expected:  argv should inherit the default flag value
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      expect(cm.hasFlag(flags.debugMode)).not.to.be.ok; // shouldn't have set

      const argv: Argv = Argv.initializeEmpty(); // debugMode flag is not set in argv and cached config doesn't have it either
      const argv2: yargs.Argv<AnyYargs> = cm.applyPrecedence(argv.build() as unknown as yargs.Argv<AnyYargs>, aliases);
      expect(cm.hasFlag(flags.debugMode)).to.not.be.ok; // shouldn't have set
      expect(argv2[flags.debugMode.name]).to.not.be.ok; // should have set from the default
    });
  });

  describe('legacy and canonical version flag synchronization', (): void => {
    it('should synchronize relay and block-node version flags in both directions', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);

      const argvLegacy: Argv = Argv.initializeEmpty();
      argvLegacy.setArg(flags.relayReleaseTag, '0.77.0');
      argvLegacy.setArg(flags.blockNodeChartVersion, '0.33.0');
      cm.update(argvLegacy.build());

      expect(cm.getFlag(flags.relayVersion)).to.equal('0.77.0');
      expect(cm.getFlag(flags.relayReleaseTag)).to.equal('0.77.0');
      expect(cm.getFlag(flags.blockNodeVersion)).to.equal('0.33.0');
      expect(cm.getFlag(flags.blockNodeChartVersion)).to.equal('0.33.0');

      cm.reset();
      const argvCanonical: Argv = Argv.initializeEmpty();
      argvCanonical.setArg(flags.relayVersion, '0.78.0');
      argvCanonical.setArg(flags.blockNodeVersion, '0.34.0');
      cm.update(argvCanonical.build());

      expect(cm.getFlag(flags.relayVersion)).to.equal('0.78.0');
      expect(cm.getFlag(flags.relayReleaseTag)).to.equal('0.78.0');
      expect(cm.getFlag(flags.blockNodeVersion)).to.equal('0.34.0');
      expect(cm.getFlag(flags.blockNodeChartVersion)).to.equal('0.34.0');
    });

    it('should not redefine config properties when legacy and canonical flags share the same constName', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.relayVersion, '0.77.0');
      cm.update(argv.build());

      const config: {relayReleaseTag: string} = cm.getConfig('duplicate-constName-relay', [
        flags.relayReleaseTag,
        flags.relayVersion,
      ]) as {
        relayReleaseTag: string;
      };
      expect(config.relayReleaseTag).to.equal('0.77.0');
    });
  });

  describe('recordUserSuppliedFlags / wasFlagProvidedByUser', (): void => {
    it('should report a flag as user-supplied when present and not defaulted', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.explorerVersion, '26.2.0');

      cm.recordUserSuppliedFlags(argv.build(), {});

      expect(cm.wasFlagProvidedByUser(flags.explorerVersion)).to.be.true;
    });

    it('should report a flag as NOT user-supplied when it was populated from its default', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.explorerVersion, '26.1.0');

      cm.recordUserSuppliedFlags(argv.build(), {[flags.explorerVersion.name]: true});

      expect(cm.wasFlagProvidedByUser(flags.explorerVersion)).to.be.false;
    });

    it('should treat a flag defaulted under its camelCase constName as NOT user-supplied', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.explorerVersion, '26.1.0');

      cm.recordUserSuppliedFlags(argv.build(), {[flags.explorerVersion.constName]: true});

      expect(cm.wasFlagProvidedByUser(flags.explorerVersion)).to.be.false;
    });

    it('should report a flag as NOT user-supplied when absent from argv', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);

      cm.recordUserSuppliedFlags(Argv.initializeEmpty().build(), {});

      expect(cm.wasFlagProvidedByUser(flags.explorerVersion)).to.be.false;
    });

    it('should default to not-supplied before recordUserSuppliedFlags has run', (): void => {
      const cm: ConfigManager = container.resolve(InjectTokens.ConfigManager);

      expect(cm.wasFlagProvidedByUser(flags.explorerVersion)).to.be.false;
    });
  });
});
