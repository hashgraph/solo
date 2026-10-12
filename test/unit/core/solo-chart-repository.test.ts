// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloChartRepository} from '../../../src/core/solo-chart-repository.js';
import {MINIMUM_SOLO_CHART_VERSION} from '../../../version.js';

describe('SoloChartRepository', (): void => {
  describe('resolveUrl', (): void => {
    it('uses the legacy org for versions published before the migration', (): void => {
      expect(SoloChartRepository.resolveUrl('0.64.0')).to.equal(SoloChartRepository.LEGACY_ORG_URL);
    });

    // Fails once MINIMUM_SOLO_CHART_VERSION passes the migration, signalling that the legacy branch is dead.
    it('still resolves the oldest supported chart version', (): void => {
      expect(SoloChartRepository.resolveUrl(MINIMUM_SOLO_CHART_VERSION)).to.equal(SoloChartRepository.LEGACY_ORG_URL);
    });

    it('uses the legacy org for the last version published under it', (): void => {
      expect(SoloChartRepository.resolveUrl(SoloChartRepository.LAST_LEGACY_ORG_VERSION)).to.equal(
        SoloChartRepository.LEGACY_ORG_URL,
      );
    });

    it('uses the new org for versions published after the migration', (): void => {
      expect(SoloChartRepository.resolveUrl('0.67.0')).to.equal(SoloChartRepository.URL);
    });

    it('accepts a v-prefixed version', (): void => {
      expect(SoloChartRepository.resolveUrl('v0.66.0')).to.equal(SoloChartRepository.LEGACY_ORG_URL);
      expect(SoloChartRepository.resolveUrl('v0.67.0')).to.equal(SoloChartRepository.URL);
    });

    it('treats a pre-release of the first migrated version as still on the legacy org', (): void => {
      expect(SoloChartRepository.resolveUrl('0.66.1-alpha.1')).to.equal(SoloChartRepository.LEGACY_ORG_URL);
    });

    it('falls back to the legacy org when no version is given', (): void => {
      expect(SoloChartRepository.resolveUrl('')).to.equal(SoloChartRepository.LEGACY_ORG_URL);
    });
  });
});
