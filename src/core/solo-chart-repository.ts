// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../business/utils/semantic-version.js';

/**
 * Resolves the OCI repository that publishes a given solo-charts version.
 *
 * The solo-charts repository moved from the `hashgraph` GitHub org to `hiero-ledger`. Charts published
 * to GHCR before the move were not copied to the new org, so anything up to and including
 * {@link LAST_LEGACY_ORG_VERSION} remains resolvable only under {@link LEGACY_ORG_URL}.
 */
export class SoloChartRepository {
  public static readonly LEGACY_ORG_URL: string = 'oci://ghcr.io/hashgraph/solo-charts';

  public static readonly URL: string = 'oci://ghcr.io/hiero-ledger/solo-charts';

  public static readonly LAST_LEGACY_ORG_VERSION: string = '0.66.1';

  public static resolveUrl(soloChartVersion: string): string {
    const isLegacyOrgVersion: boolean = SemanticVersion.normalize(soloChartVersion).lessThanOrEqual(
      SoloChartRepository.LAST_LEGACY_ORG_VERSION,
    );

    return isLegacyOrgVersion ? SoloChartRepository.LEGACY_ORG_URL : SoloChartRepository.URL;
  }
}
