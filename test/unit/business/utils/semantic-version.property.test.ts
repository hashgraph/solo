// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fc from 'fast-check';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {IllegalArgumentError} from '../../../../src/core/errors/classes/validation/illegal-argument-error.js';

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
  preRelease: string | undefined;
  buildMetadata: string | undefined;
}

const digitCharacter: fc.Arbitrary<string> = fc.constantFrom(...'0123456789');
const letterCharacter: fc.Arbitrary<string> = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
);
const letterOrHyphenCharacter: fc.Arbitrary<string> = fc.oneof(letterCharacter, fc.constant('-'));
const identifierCharacter: fc.Arbitrary<string> = fc.oneof(digitCharacter, letterOrHyphenCharacter);

// A numeric identifier without leading zeros, as required by the SemVer specification.
const numericIdentifier: fc.Arbitrary<string> = fc.nat({max: 9999}).map((value: number): string => `${value}`);

// An alphanumeric identifier that starts with a letter or hyphen, so it can never be read as a number.
const alphanumericIdentifier: fc.Arbitrary<string> = fc
  .tuple(letterOrHyphenCharacter, fc.string({unit: identifierCharacter, maxLength: 7}))
  .map(([first, rest]: [string, string]): string => `${first}${rest}`);

const preReleaseArbitrary: fc.Arbitrary<string> = fc
  .array(fc.oneof(numericIdentifier, alphanumericIdentifier), {minLength: 1, maxLength: 3})
  .map((parts: string[]): string => parts.join('.'));

// Build metadata identifiers are kept to letters and digits: a hyphen inside the build metadata of a version
// without a pre-release is read as the start of a pre-release, so it would not round-trip (tracked in #5932).
const buildMetadataArbitrary: fc.Arbitrary<string> = fc
  .array(fc.string({unit: fc.oneof(digitCharacter, letterCharacter), minLength: 1, maxLength: 8}), {
    minLength: 1,
    maxLength: 3,
  })
  .map((parts: string[]): string => parts.join('.'));

const versionPartsArbitrary: fc.Arbitrary<VersionParts> = fc.record({
  major: fc.nat({max: 999_999}),
  minor: fc.nat({max: 999_999}),
  patch: fc.nat({max: 999_999}),
  preRelease: fc.option(preReleaseArbitrary, {nil: undefined}),
  buildMetadata: fc.option(buildMetadataArbitrary, {nil: undefined}),
});

function toVersionString(parts: VersionParts): string {
  const preRelease: string = parts.preRelease === undefined ? '' : `-${parts.preRelease}`;
  const buildMetadata: string = parts.buildMetadata === undefined ? '' : `+${parts.buildMetadata}`;
  return `${parts.major}.${parts.minor}.${parts.patch}${preRelease}${buildMetadata}`;
}

// Build metadata is excluded here because it does not participate in precedence.
const comparableVersionArbitrary: fc.Arbitrary<SemanticVersion<string>> = versionPartsArbitrary.map(
  (parts: VersionParts): SemanticVersion<string> =>
    new SemanticVersion<string>(toVersionString({...parts, buildMetadata: undefined})),
);

describe('SemanticVersion property-based tests', (): void => {
  it('parses every well-formed version string back to the same string', (): void => {
    fc.assert(
      fc.property(versionPartsArbitrary, (parts: VersionParts): void => {
        const versionString: string = toVersionString(parts);
        const parsed: SemanticVersion<string> = new SemanticVersion<string>(versionString);

        expect(parsed.toString()).to.equal(versionString);
        expect(parsed.toPrefixedString()).to.equal(`v${versionString}`);
        expect(parsed.major).to.equal(parts.major);
        expect(parsed.minor).to.equal(parts.minor);
        expect(parsed.patch).to.equal(parts.patch);
        expect(parsed.preRelease ?? undefined).to.equal(parts.preRelease);
        expect(parsed.buildMetadata ?? undefined).to.equal(parts.buildMetadata);
      }),
    );
  });

  it('ignores a leading v prefix and surrounding whitespace', (): void => {
    fc.assert(
      fc.property(versionPartsArbitrary, (parts: VersionParts): void => {
        const versionString: string = toVersionString(parts);

        expect(new SemanticVersion<string>(`v${versionString}`).toString()).to.equal(versionString);
        expect(new SemanticVersion<string>(`  ${versionString}\t`).toString()).to.equal(versionString);
        expect(new SemanticVersion<string>(versionString).equals(`v${versionString}`)).to.be.true;
      }),
    );
  });

  it('compares any two versions consistently', (): void => {
    fc.assert(
      fc.property(
        comparableVersionArbitrary,
        comparableVersionArbitrary,
        (left: SemanticVersion<string>, right: SemanticVersion<string>): void => {
          const outcomes: boolean[] = [left.equals(right), left.greaterThan(right), left.lessThan(right)];
          expect(outcomes.filter(Boolean)).to.have.lengthOf(1);

          expect(left.compare(right)).to.equal(-right.compare(left));
          expect(left.compare(left)).to.equal(0);
          expect(left.greaterThanOrEqual(right)).to.equal(!left.lessThan(right));
          expect(left.lessThanOrEqual(right)).to.equal(!left.greaterThan(right));
        },
      ),
    );
  });

  it('orders versions transitively', (): void => {
    fc.assert(
      fc.property(
        comparableVersionArbitrary,
        comparableVersionArbitrary,
        comparableVersionArbitrary,
        (first: SemanticVersion<string>, second: SemanticVersion<string>, third: SemanticVersion<string>): void => {
          if (first.lessThan(second) && second.lessThan(third)) {
            expect(first.lessThan(third)).to.be.true;
          }
        },
      ),
    );
  });

  it('bumps to a strictly greater version and clears pre-release and build metadata', (): void => {
    fc.assert(
      fc.property(versionPartsArbitrary, (parts: VersionParts): void => {
        const version: SemanticVersion<string> = new SemanticVersion<string>(toVersionString(parts));
        const nextMinor: SemanticVersion<string> = version.bumpMinor();
        const nextMajor: SemanticVersion<string> = version.bumpMajor();

        expect(nextMinor.toString()).to.equal(`${parts.major}.${parts.minor + 1}.0`);
        expect(nextMajor.toString()).to.equal(`${parts.major + 1}.0.0`);
        expect(nextMinor.greaterThan(version)).to.be.true;
        expect(nextMajor.greaterThan(nextMinor)).to.be.true;
      }),
    );
  });

  it('never throws anything other than IllegalArgumentError for arbitrary input', (): void => {
    const corruptedVersionArbitrary: fc.Arbitrary<string> = fc
      .tuple(versionPartsArbitrary, fc.string({maxLength: 4}), fc.nat({max: 40}))
      .map(([parts, junk, position]: [VersionParts, string, number]): string => {
        const versionString: string = toVersionString(parts);
        const index: number = Math.min(position, versionString.length);
        return `${versionString.slice(0, index)}${junk}${versionString.slice(index)}`;
      });

    fc.assert(
      fc.property(fc.oneof(fc.string(), corruptedVersionArbitrary), (input: string): void => {
        try {
          new SemanticVersion<string>(input);
        } catch (error) {
          expect(error).to.be.instanceOf(IllegalArgumentError);
        }
      }),
    );
  });
});
