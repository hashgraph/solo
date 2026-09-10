// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

function isCommandFlag(value: unknown): value is CommandFlag {
  const candidate: Partial<CommandFlag> = value as Partial<CommandFlag>;

  return (
    typeof candidate?.constName === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.definition === 'object' &&
    candidate.definition !== null
  );
}

describe('Flags', (): void => {
  describe('deployment default value', (): void => {
    const environmentVariableName: string = 'SOLO_DEPLOYMENT';
    let originalValue: string | undefined;

    beforeEach((): void => {
      originalValue = process.env[environmentVariableName];
    });

    afterEach((): void => {
      if (originalValue === undefined) {
        delete process.env[environmentVariableName];
      } else {
        process.env[environmentVariableName] = originalValue;
      }
    });

    it('should default to the SOLO_DEPLOYMENT environment variable when set', (): void => {
      process.env[environmentVariableName] = 'my-deployment';
      expect(Flags.deployment.definition.defaultValue).to.equal('my-deployment');
    });

    it('should default to an empty string when SOLO_DEPLOYMENT is not set', (): void => {
      delete process.env[environmentVariableName];
      expect(Flags.deployment.definition.defaultValue).to.equal('');
    });
  });

  describe('allFlags', (): void => {
    it('should include every static CommandFlag defined on Flags', (): void => {
      const staticCommandFlags: CommandFlag[] = Object.values(Flags).filter((value: unknown): value is CommandFlag =>
        isCommandFlag(value),
      );
      const registeredCommandFlags: Set<CommandFlag> = new Set(Flags.allFlags);

      const missingFlags: string[] = staticCommandFlags
        .filter((flag: CommandFlag): boolean => !registeredCommandFlags.has(flag))
        .map((flag: CommandFlag): string => flag.constName);

      expect(missingFlags).to.deep.equal([]);
    });
  });
});
