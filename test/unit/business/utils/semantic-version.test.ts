// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {IllegalArgumentError} from '../../../../src/core/errors/classes/validation/illegal-argument-error.js';

describe('SemanticVersion', (): void => {
  describe('normalize', (): void => {
    it('returns 0.0.0 for undefined input', (): void => {
      expect(SemanticVersion.normalize().toString()).to.equal('0.0.0');
    });

    it('returns 0.0.0 for null input', (): void => {
      const nullValue: unknown = JSON.parse('null');
      expect(SemanticVersion.normalize(nullValue as null).toString()).to.equal('0.0.0');
    });

    it('uses the last token for comma-joined duplicated values', (): void => {
      expect(SemanticVersion.normalize('v0.73.0,v0.73.0').toString()).to.equal('0.73.0');
    });

    it('uses the last non-empty value when yargs provides an array', (): void => {
      expect(SemanticVersion.normalize(['', 'v0.72.0', 'v0.73.0']).toString()).to.equal('0.73.0');
    });

    it('supports nested array misuse and still finds the last non-empty token', (): void => {
      expect(SemanticVersion.normalize(['v0.72.0', ['  ', 'v0.73.0']]).toString()).to.equal('0.73.0');
    });

    it('supports prerelease versions with or without a v prefix', (): void => {
      expect(SemanticVersion.normalize('0.45.3-alpha.1').toString()).to.equal('0.45.3-alpha.1');
      expect(SemanticVersion.normalize('v0.74.0-rc.5').toString()).to.equal('0.74.0-rc.5');
    });

    it('throws for invalid normalized token', (): void => {
      expect((): SemanticVersion<string | number> => SemanticVersion.normalize('v0.73.0,invalid')).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: invalid',
      );
    });
  });

  describe('normalizeOptional', (): void => {
    it('returns undefined for undefined/null/empty payloads', (): void => {
      const nullValue: unknown = JSON.parse('null');
      expect(SemanticVersion.normalizeOptional()).to.equal(undefined);
      expect(SemanticVersion.normalizeOptional(nullValue as null)).to.equal(undefined);
      expect(SemanticVersion.normalizeOptional(' , , ')).to.equal(undefined);
      expect(SemanticVersion.normalizeOptional(['', '  '])).to.equal(undefined);
    });

    it('returns normalized semantic version when present', (): void => {
      expect(SemanticVersion.normalizeOptional(['v0.72.0', 'v0.73.0'])?.toString()).to.equal('0.73.0');
    });
  });

  describe('normalizeToken', (): void => {
    it('preserves the selected token formatting (including v-prefix)', (): void => {
      expect(SemanticVersion.normalizeToken('v0.73.0,v0.73.0')).to.equal('v0.73.0');
      expect(SemanticVersion.normalizeToken(['v0.72.0', '0.73.0'])).to.equal('0.73.0');
    });

    it('preserves prerelease token formatting for selected values', (): void => {
      expect(SemanticVersion.normalizeToken(['0.45.3-alpha.1', 'v0.74.0-rc.5'])).to.equal('v0.74.0-rc.5');
      expect(SemanticVersion.normalizeToken('0.45.3-alpha.1')).to.equal('0.45.3-alpha.1');
    });

    it('returns undefined for empty payloads', (): void => {
      expect(SemanticVersion.normalizeToken()).to.equal(undefined);
      expect(SemanticVersion.normalizeToken(['', '  '])).to.equal(undefined);
      expect(SemanticVersion.normalizeToken(' , ')).to.equal(undefined);
    });
  });

  describe('getValidSemanticVersion', (): void => {
    it('returns the normalized version string without a v-prefix by default', (): void => {
      expect(SemanticVersion.getValidSemanticVersion('v1.2.3')).to.equal('1.2.3');
      expect(SemanticVersion.getValidSemanticVersion('1.2.3')).to.equal('1.2.3');
    });

    it('returns the version string with a v-prefix when isNeedPrefix is true', (): void => {
      expect(SemanticVersion.getValidSemanticVersion('1.2.3', true)).to.equal('v1.2.3');
      expect(SemanticVersion.getValidSemanticVersion('v1.2.3', true)).to.equal('v1.2.3');
    });

    it('throws for an empty version string', (): void => {
      expect((): string => SemanticVersion.getValidSemanticVersion('')).to.throw(
        IllegalArgumentError,
        'SemanticVersion cannot be empty',
      );
    });

    it('includes the custom label in empty-string error messages', (): void => {
      expect((): string => SemanticVersion.getValidSemanticVersion('', false, 'Solo chart version')).to.throw(
        IllegalArgumentError,
        'Solo chart version cannot be empty',
      );
    });

    it('throws for an invalid version string', (): void => {
      expect((): string => SemanticVersion.getValidSemanticVersion('not-a-version')).to.throw(
        IllegalArgumentError,
        'Invalid semanticversion: not-a-version',
      );
    });

    it('passes when version equals minimumVersion', (): void => {
      expect(SemanticVersion.getValidSemanticVersion('0.64.0', false, 'Solo chart version', '0.64.0')).to.equal(
        '0.64.0',
      );
    });

    it('passes when version is above minimumVersion', (): void => {
      expect(SemanticVersion.getValidSemanticVersion('0.65.0', false, 'Solo chart version', '0.64.0')).to.equal(
        '0.65.0',
      );
    });

    it('throws when version is below minimumVersion', (): void => {
      expect((): string =>
        SemanticVersion.getValidSemanticVersion('0.63.0', false, 'Solo chart version', '0.64.0'),
      ).to.throw(IllegalArgumentError, 'Solo chart version 0.63.0 is below the minimum supported version 0.64.0');
    });

    it('includes the custom label in minimum version error messages', (): void => {
      expect((): string => SemanticVersion.getValidSemanticVersion('1.0.0', false, 'My component', '2.0.0')).to.throw(
        IllegalArgumentError,
        'My component 1.0.0 is below the minimum supported version 2.0.0',
      );
    });
  });

  describe('constructor', (): void => {
    it('should create a SemanticVersion instance with a valid SemanticVersion<string>', (): void => {
      const semVersion: string = '1.0.0';
      const version: SemanticVersion<string> = new SemanticVersion(semVersion);
      expect(version.toString()).to.equal(semVersion);
    });

    it('should create a SemanticVersion instance with a valid numeric version', (): void => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.major).to.equal(42);
    });

    it('should throw a RangeError for an invalid SemanticVersion<string>', (): void => {
      const nullInput: string | number = JSON.parse('null') as unknown as string | number;
      expect((): SemanticVersion<string | number> => new SemanticVersion(nullInput)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: null',
      );
      expect((): SemanticVersion<string | number> => new SemanticVersion('invalid')).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: invalid',
      );
    });

    it('should throw a RangeError for an invalid numeric version', (): void => {
      expect((): SemanticVersion<-1> => new SemanticVersion(-1)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: -1',
      );
    });
  });

  describe('equals', (): void => {
    it('should return true for equal SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('2.0.0');
      expect(version1.equals(version2)).to.be.false;
    });

    it('should return true for equal numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.equals(version2)).to.be.false;
    });
  });

  describe('compare', (): void => {
    it('should return 0 for equal SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(0);
      expect(version1.lessThan(version2)).to.be.false;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
      expect(version1.greaterThan(version2)).to.be.false;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return -1 when the first SemanticVersion<string> is less than the second', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.1');
      const version2: SemanticVersion<string> = new SemanticVersion('4.3.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('should return 1 when the first SemanticVersion<string> is greater than the second', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.2.3');
      expect(version1.compare(version2)).to.equal(1);
      expect(version1.greaterThan(version2)).to.be.true;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
    });

    it('should return 0 for equal numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first numeric version is less than the second', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first numeric version is greater than the second', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(43);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(1);
      expect(version1.greaterThan(version2)).to.be.true;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
    });

    it('v3.14.2+gc309b6f is less than v4.1.3+gc94d381', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('4.1.3+gc94d381');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v0.0.1-alpha is less than v0.0.1', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('0.0.1-alpha');
      const version2: SemanticVersion<string> = new SemanticVersion('0.0.1');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v1.0.0-beta.1 is less than v1.0.0-beta.2', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.1');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.2');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v1.0.0-beta.2 is less than v1.0.0', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.2');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('3.14.2+gc309b6f is less than 3.15.0', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('3.15.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('3.14.2+gc309b6f is equal to 3.14.2', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('3.14.2');
      expect(version1.compare(version2)).to.equal(0);
      expect(version1.equals(version2)).to.be.true;
    });

    it('0.28.1-rc.1 < 0.28.1', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('0.28.1-rc.1');
      const version2: SemanticVersion<string> = new SemanticVersion('0.28.1');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v0.72.0-rc.4 > v0.72.0-0 (numeric identifiers have lower precedence than alphanumeric)', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('v0.72.0-rc.4');
      const version2: SemanticVersion<string> = new SemanticVersion('v0.72.0-0');
      expect(version1.compare(version2)).to.equal(1);
      expect(version1.greaterThan(version2)).to.be.true;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
      expect(version2.lessThan(version1)).to.be.true;
      expect(version2.lessThanOrEqual(version1)).to.be.true;
    });

    it('should follow semver §11 pre-release precedence ordering', (): void => {
      // From semver.org: 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta
      //                  < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
      const versions: SemanticVersion<string>[] = [
        new SemanticVersion('1.0.0-alpha'),
        new SemanticVersion('1.0.0-alpha.1'),
        new SemanticVersion('1.0.0-alpha.beta'),
        new SemanticVersion('1.0.0-beta'),
        new SemanticVersion('1.0.0-beta.2'),
        new SemanticVersion('1.0.0-beta.11'),
        new SemanticVersion('1.0.0-rc.1'),
        new SemanticVersion('1.0.0'),
      ];

      for (let index: number = 0; index < versions.length - 1; index++) {
        expect(
          versions[index].lessThan(versions[index + 1]),
          `${versions[index]} should be less than ${versions[index + 1]}`,
        ).to.be.true;
      }
    });
  });

  describe('toString', (): void => {
    it('should return the string representation of a SemanticVersion<string> version', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version.toString()).to.equal('1.0.0');
    });

    it('should return the string representation of a numeric version', (): void => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.toString()).to.equal('42');
    });

    it('should return the string representation of a single number string', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('42');
      expect(version.toString()).to.equal('42.0.0');
    });

    it('should return the string representation as v3.14.2+gc309b6f for a version with build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      expect(version.toString()).to.equal('3.14.2+gc309b6f');
    });

    it('should round-trip a version with hyphenated build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3+build-1');
      expect(version.toString()).to.equal('1.2.3+build-1');
    });

    it('should round-trip a version with pre-release and hyphenated build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3-alpha+sha-a1b2c3');
      expect(version.toString()).to.equal('1.2.3-alpha+sha-a1b2c3');
    });
  });

  describe('build metadata with hyphens (issue #5932)', (): void => {
    it('should not treat a hyphen in build metadata as a pre-release separator', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3+build-1');
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
      expect(version.preRelease).to.be.undefined;
      expect(version.buildMetadata).to.equal('build-1');
    });

    it('should handle multiple hyphens in build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3+foo-bar-baz');
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
      expect(version.preRelease).to.be.undefined;
      expect(version.buildMetadata).to.equal('foo-bar-baz');
    });

    it('should correctly separate pre-release and hyphenated build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3-alpha+sha-a1b2c3');
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
      expect(version.preRelease).to.equal('alpha');
      expect(version.buildMetadata).to.equal('sha-a1b2c3');
    });

    it('should parse a normal pre-release version without build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3-alpha');
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
      expect(version.preRelease).to.equal('alpha');
      expect(version.buildMetadata).to.be.undefined;
    });

    it('should parse a version with only build metadata and no pre-release', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      expect(version.major).to.equal(3);
      expect(version.minor).to.equal(14);
      expect(version.patch).to.equal(2);
      expect(version.preRelease).to.be.undefined;
      expect(version.buildMetadata).to.equal('gc309b6f');
    });

    it('should treat 1.2.3+build-1 as equal to 1.2.3 (build metadata does not affect precedence)', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.2.3+build-1');
      const version2: SemanticVersion<string> = new SemanticVersion('1.2.3');
      expect(version1.equals(version2)).to.be.true;
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should treat 1.2.3+build-1 as greater than 1.2.3-alpha (no pre-release > pre-release)', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.2.3+build-1');
      const version2: SemanticVersion<string> = new SemanticVersion('1.2.3-alpha');
      expect(version1.greaterThan(version2)).to.be.true;
    });

    it('should preserve hyphens within a pre-release identifier', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0-alpha-beta');
      expect(version.preRelease).to.equal('alpha-beta');
      expect(version.buildMetadata).to.be.undefined;
      expect(version.toString()).to.equal('1.0.0-alpha-beta');
    });

    it('should handle dotted build metadata containing a hyphen', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.2.3+build.1-rc');
      expect(version.preRelease).to.be.undefined;
      expect(version.buildMetadata).to.equal('build.1-rc');
      expect(version.toString()).to.equal('1.2.3+build.1-rc');
    });
  });
});
