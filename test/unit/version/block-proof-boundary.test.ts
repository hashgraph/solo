// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import * as versions from '../../../version.js';

const usesFixedSlotBlockProof: (blockNodeVersion: string, consensusNodeVersion: string) => [boolean, boolean] = (
  blockNodeVersion: string,
  consensusNodeVersion: string,
): [boolean, boolean] => [
  new SemanticVersion<string>(blockNodeVersion).greaterThanOrEqual(
    versions.MINIMUM_BLOCK_NODE_VERSION_FOR_16_SLOT_BLOCK_PROOF,
  ),
  new SemanticVersion<string>(consensusNodeVersion).greaterThanOrEqual(
    versions.MINIMUM_CN_VERSION_FOR_16_SLOT_BLOCK_PROOF,
  ),
];

/**
 * hiero-consensus-node#26918 replaced the block root hash with a fixed 16-slot merkle tree. The
 * consensus node and the block node must sit on the same side of that boundary, otherwise every
 * block is rejected with BAD_BLOCK_PROOF. These cases pin the boundary constants so a future
 * component bump cannot silently reintroduce a mismatched default pairing.
 */
describe('16-slot block proof boundary', (): void => {
  const cases: Array<[string, string, boolean]> = [
    // Matched pairs on either side of the boundary are allowed.
    ['0.41.0', 'v0.77.2', true],
    ['0.40.1', 'v0.75.1', true],
    ['0.42.0', 'v0.78.0', true],
    // New-format block node against an old-format consensus node.
    ['0.41.0', 'v0.76.1', false],
    ['0.41.0', 'v0.75.1', false],
    ['0.41.0', 'v0.74.0', false],
    // Old-format block node against a new-format consensus node.
    ['0.40.0', 'v0.77.2', false],
  ];

  for (const [blockNodeVersion, consensusNodeVersion, compatible] of cases) {
    it(`block node ${blockNodeVersion} with consensus node ${consensusNodeVersion} is ${compatible ? 'compatible' : 'incompatible'}`, (): void => {
      const [blockNodeUsesFixedSlots, consensusNodeUsesFixedSlots]: [boolean, boolean] = usesFixedSlotBlockProof(
        blockNodeVersion,
        consensusNodeVersion,
      );

      expect(blockNodeUsesFixedSlots === consensusNodeUsesFixedSlots).to.equal(compatible);
    });
  }

  it('ships a default consensus node and block node version on the same side of the boundary', (): void => {
    const [blockNodeUsesFixedSlots, consensusNodeUsesFixedSlots]: [boolean, boolean] = usesFixedSlotBlockProof(
      versions.BLOCK_NODE_VERSION,
      versions.HEDERA_PLATFORM_VERSION,
    );

    expect(blockNodeUsesFixedSlots).to.equal(consensusNodeUsesFixedSlots);
  });
});
