// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fc from 'fast-check';
import {ipV4ToBase64, isIpV4Address, parseIpAddressToUint8Array} from '../../../src/core/helpers.js';

type Octets = [number, number, number, number];

interface ClassifiedInput {
  address: string;
  expected: boolean | undefined;
}

const octetArbitrary: fc.Arbitrary<number> = fc.nat({max: 255});
const octetsArbitrary: fc.Arbitrary<Octets> = fc.tuple(octetArbitrary, octetArbitrary, octetArbitrary, octetArbitrary);

function toDottedQuad(parts: number[]): string {
  return parts.join('.');
}

describe('IPv4 helpers property-based tests', (): void => {
  it('accepts, parses and encodes every dotted quad of octets in range', (): void => {
    fc.assert(
      fc.property(octetsArbitrary, (octets: Octets): void => {
        const address: string = toDottedQuad(octets);

        expect(isIpV4Address(address)).to.be.true;
        expect([...parseIpAddressToUint8Array(address)]).to.deep.equal(octets);

        const encoded: string = ipV4ToBase64(address);
        expect(encoded).to.match(/^[\d+/A-Za-z]{6}==$/);
        expect([...Buffer.from(encoded, 'base64')]).to.deep.equal(octets);
      }),
    );
  });

  it('rejects any dotted quad with an out-of-range octet', (): void => {
    const outOfRangeOctetArbitrary: fc.Arbitrary<number> = fc.integer({min: 256, max: 99_999});
    const invalidOctetsArbitrary: fc.Arbitrary<Octets> = fc
      .tuple(octetsArbitrary, outOfRangeOctetArbitrary, fc.nat({max: 3}))
      .map(([octets, outOfRange, position]: [Octets, number, number]): Octets => {
        const copy: Octets = [...octets];
        copy[position] = outOfRange;
        return copy;
      });

    fc.assert(
      fc.property(invalidOctetsArbitrary, (octets: Octets): void => {
        const address: string = toDottedQuad(octets);

        expect(isIpV4Address(address)).to.be.false;
        expect((): string => ipV4ToBase64(address)).to.throw(Error, 'Invalid IPv4 address');
      }),
    );
  });

  it('rejects any address that does not have exactly four parts', (): void => {
    const wrongLengthArbitrary: fc.Arbitrary<number[]> = fc
      .array(octetArbitrary, {maxLength: 6})
      .filter((parts: number[]): boolean => parts.length !== 4);

    fc.assert(
      fc.property(wrongLengthArbitrary, (parts: number[]): void => {
        const address: string = toDottedQuad(parts);

        expect(isIpV4Address(address)).to.be.false;
        expect((): string => ipV4ToBase64(address)).to.throw(Error, 'Invalid IPv4 address');
      }),
    );
  });

  it('classifies near-valid and corrupted addresses and encodes everything it accepts', (): void => {
    // Characters that can never appear in a dotted quad, used to corrupt otherwise valid addresses.
    const foreignCharacterArbitrary: fc.Arbitrary<string> = fc.constantFrom(
      ' ',
      '\t',
      '\n',
      'a',
      'x',
      'Z',
      '-',
      '+',
      '_',
      '#',
      '/',
      ':',
      ',',
    );

    const validQuadArbitrary: fc.Arbitrary<ClassifiedInput> = octetsArbitrary.map(
      (octets: Octets): ClassifiedInput => ({address: toDottedQuad(octets), expected: true}),
    );

    // The production regex accepts any two-digit octet, so a zero-padded "01" is valid, while a
    // three-digit "001" is not; both variants are produced and asserted.
    const zeroPaddedOctetArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, fc.nat({max: 99}), fc.nat({max: 3}), fc.boolean())
      .map(([octets, value, position, threeDigits]: [Octets, number, number, boolean]): ClassifiedInput => {
        const parts: string[] = octets.map(String);
        parts[position] = threeDigits ? `0${String(value).padStart(2, '0')}` : String(value % 10).padStart(2, '0');
        return {address: parts.join('.'), expected: !threeDigits};
      });

    const oversizedOctetArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, fc.integer({min: 256, max: 999}), fc.nat({max: 3}))
      .map(([octets, oversized, position]: [Octets, number, number]): ClassifiedInput => {
        const parts: string[] = octets.map(String);
        parts[position] = `${oversized}`;
        return {address: parts.join('.'), expected: false};
      });

    const wrongGroupCountArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, octetArbitrary, fc.boolean())
      .map(([octets, extra, fifthGroup]: [Octets, number, boolean]): ClassifiedInput => {
        const parts: number[] = fifthGroup ? [...octets, extra] : octets.slice(0, 3);
        return {address: toDottedQuad(parts), expected: false};
      });

    const emptyGroupArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, fc.nat({max: 3}))
      .map(([octets, position]: [Octets, number]): ClassifiedInput => {
        const parts: string[] = octets.map(String);
        parts[position] = '';
        return {address: parts.join('.'), expected: false};
      });

    const injectedCharacterArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, foreignCharacterArbitrary, fc.nat({max: 15}))
      .map(([octets, character, position]: [Octets, string, number]): ClassifiedInput => {
        const address: string = toDottedQuad(octets);
        const index: number = position % (address.length + 1);
        return {address: `${address.slice(0, index)}${character}${address.slice(index)}`, expected: false};
      });

    const surroundingGarbageArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .tuple(octetsArbitrary, foreignCharacterArbitrary, fc.string({maxLength: 3}), fc.boolean())
      .map(([octets, character, extra, leading]: [Octets, string, string, boolean]): ClassifiedInput => {
        const garbage: string = `${character}${extra}`;
        const address: string = toDottedQuad(octets);
        return {address: leading ? `${garbage}${address}` : `${address}${garbage}`, expected: false};
      });

    const noiseArbitrary: fc.Arbitrary<ClassifiedInput> = fc
      .string()
      .map((input: string): ClassifiedInput => ({address: input, expected: undefined}));

    // Bias the distribution toward near-miss addresses: most cases are a valid dotted quad with one
    // targeted corruption and a known expected classification; a small unconstrained-string share
    // remains as noise, checked only for accept-then-encode consistency.
    const classifiedInputArbitrary: fc.Arbitrary<ClassifiedInput> = fc.oneof(
      {arbitrary: validQuadArbitrary, weight: 2},
      {arbitrary: zeroPaddedOctetArbitrary, weight: 2},
      {arbitrary: oversizedOctetArbitrary, weight: 2},
      {arbitrary: wrongGroupCountArbitrary, weight: 2},
      {arbitrary: emptyGroupArbitrary, weight: 1},
      {arbitrary: injectedCharacterArbitrary, weight: 2},
      {arbitrary: surroundingGarbageArbitrary, weight: 2},
      {arbitrary: noiseArbitrary, weight: 1},
    );

    fc.assert(
      fc.property(classifiedInputArbitrary, ({address, expected}: ClassifiedInput): void => {
        const accepted: boolean = isIpV4Address(address);
        if (expected !== undefined) {
          expect(accepted, `isIpV4Address(${JSON.stringify(address)})`).to.equal(expected);
        }

        if (accepted) {
          const decoded: number[] = [...Buffer.from(ipV4ToBase64(address), 'base64')];
          expect(decoded).to.have.lengthOf(4);
          expect(decoded).to.deep.equal([...parseIpAddressToUint8Array(address)]);
        }
      }),
    );
  });
});
