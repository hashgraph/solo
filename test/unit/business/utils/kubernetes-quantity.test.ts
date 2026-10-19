// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {KubernetesQuantity} from '../../../../src/business/utils/kubernetes-quantity.js';

describe('KubernetesQuantity', (): void => {
  it('converts binary suffixes', (): void => {
    expect(KubernetesQuantity.toBytes('1Ki')).to.equal(1024);
    expect(KubernetesQuantity.toBytes('500Gi')).to.equal(500 * 1024 ** 3);
    expect(KubernetesQuantity.toBytes('2Ti')).to.equal(2 * 1024 ** 4);
  });

  it('distinguishes decimal suffixes from binary suffixes', (): void => {
    expect(KubernetesQuantity.toBytes('1G')).to.equal(1_000_000_000);
    expect(KubernetesQuantity.toBytes('1Gi')).to.equal(1_073_741_824);
  });

  it('handles a bare number and a fractional quantity', (): void => {
    expect(KubernetesQuantity.toBytes('1024')).to.equal(1024);
    expect(KubernetesQuantity.toBytes('1.5Gi')).to.equal(1.5 * 1024 ** 3);
  });

  it('returns undefined for absent or unparseable values', (): void => {
    const unsetQuantity: string | undefined = undefined;
    expect(KubernetesQuantity.toBytes(unsetQuantity)).to.be.undefined;
    expect(KubernetesQuantity.toBytes('')).to.be.undefined;
    expect(KubernetesQuantity.toBytes('lots')).to.be.undefined;
    expect(KubernetesQuantity.toBytes('10Gigs')).to.be.undefined;
  });

  it('formats byte counts as binary quantities', (): void => {
    expect(KubernetesQuantity.format(500 * 1024 ** 3)).to.equal('500GiB');
    expect(KubernetesQuantity.format(1.5 * 1024 ** 3)).to.equal('1.5GiB');
    expect(KubernetesQuantity.format(512)).to.equal('512B');
  });
});
