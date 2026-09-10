// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {FlagValidation} from '../../../../src/commands/validation/flag-validation.js';
import {FlagRules} from '../../../../src/commands/validation/flag-rules.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type CommandFlag, type FlagRule} from '../../../../src/types/flag-types.js';
import {InvalidFlagValueSoloError} from '../../../../src/core/errors/classes/validation/invalid-flag-value-solo-error.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

function flagNamed(name: string, rules?: FlagRule[]): CommandFlag {
  return {
    constName: name,
    name,
    definition: {describe: 'a flag under test', type: 'string'},
    rules,
  };
}

describe('FlagValidation', (): void => {
  describe('violationOf', (): void => {
    it('should report nothing for a flag that declares no rules', (): void => {
      expect(FlagValidation.violationOf(flagNamed('subject'), 'anything at all')).to.be.undefined;
    });

    it('should report nothing for an unregistered flag', (): void => {
      expect(FlagValidation.violationOf(undefined, 'anything at all')).to.be.undefined;
    });

    it('should report nothing for an absent or empty value', (): void => {
      const flag: CommandFlag = flagNamed('subject', [FlagRules.dnsLabel]);

      expect(FlagValidation.violationOf(flag)).to.be.undefined;
      expect(FlagValidation.violationOf(flag, '')).to.be.undefined;
    });

    it('should apply a single rule', (): void => {
      const flag: CommandFlag = flagNamed('subject', [FlagRules.dnsLabel]);

      expect(FlagValidation.violationOf(flag, 'good-name')).to.be.undefined;
      expect(FlagValidation.violationOf(flag, 'Bad_Name')).to.not.be.undefined;
    });

    it('should apply every rule when several are declared', (): void => {
      const flag: CommandFlag = flagNamed('subject', [FlagRules.integer, FlagRules.atLeast(1)]);

      expect(FlagValidation.violationOf(flag, '2')).to.be.undefined;
      expect(FlagValidation.violationOf(flag, '0')).to.equal('must be at least 1');
    });

    it('should report the first violation in declaration order', (): void => {
      const flag: CommandFlag = flagNamed('subject', [FlagRules.integer, FlagRules.atLeast(1)]);

      expect(FlagValidation.violationOf(flag, 'abc')).to.equal('must be a whole number');
    });

    it('should stringify a non-string value before applying rules', (): void => {
      const flag: CommandFlag = flagNamed('subject', [FlagRules.atLeast(1)]);

      expect(FlagValidation.violationOf(flag, 5)).to.be.undefined;
      expect(FlagValidation.violationOf(flag, 0)).to.not.be.undefined;
    });
  });

  describe('assertAllValid', (): void => {
    it('should not throw for acceptable values', (): void => {
      expect((): void =>
        FlagValidation.assertAllValid(Flags.allFlags, {
          [Flags.namespace.name]: 'good-name',
          [Flags.nodeAliasesUnparsed.name]: 'node1,node2',
        }),
      ).to.not.throw();
    });

    it('should ignore flags the user did not supply', (): void => {
      expect((): void => FlagValidation.assertAllValid(Flags.allFlags, {})).to.not.throw();
    });

    it('should accept a cluster reference containing an underscore', (): void => {
      expect((): void =>
        FlagValidation.assertAllValid(Flags.allFlags, {[Flags.clusterRef.name]: 'gke_project_us-central1_cluster'}),
      ).to.not.throw();
    });

    it('should tolerate a trailing comma in a list', (): void => {
      expect((): void =>
        FlagValidation.assertAllValid(Flags.allFlags, {[Flags.nodeAliasesUnparsed.name]: 'node1,node2,'}),
      ).to.not.throw();
    });

    it('should throw a coded Solo error naming the offending flag, value and requirement', (): void => {
      let thrownError: InvalidFlagValueSoloError | undefined;

      try {
        FlagValidation.assertAllValid(Flags.allFlags, {[Flags.namespace.name]: 'NOT_FINE'});
      } catch (error) {
        thrownError = error as InvalidFlagValueSoloError;
      }

      expect(thrownError).to.be.instanceof(InvalidFlagValueSoloError);
      expect(thrownError).to.be.instanceof(SoloError);
      expect(thrownError.getFormattedCode()).to.equal('SOLO-4081');
      expect(thrownError.message).to.contain('--namespace');
      expect(thrownError.message).to.contain('NOT_FINE');
      expect(thrownError.message).to.contain('lowercase');
    });
  });
});
