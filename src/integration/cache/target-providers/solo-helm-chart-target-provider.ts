// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../../core/constants.js';
import * as version from '../../../../version.js';
import {type CacheTargetProvider} from './cache-target-provider.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';
import {CacheTarget} from '../models/impl/cache-target.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';

/**
 * Provides the set of Helm charts Solo installs, keyed by the chart name and version passed to
 * `ChartManager.install`/`upgrade` so the pulled tarballs align with chart-cache lookups at deploy time.
 * Versions are read verbatim from `version.ts` (no normalization) to preserve exact cache-key matches.
 */
export class SoloHelmChartTargetProvider implements CacheTargetProvider {
  public async getRequiredTargets(): Promise<readonly CacheTargetStructure[]> {
    return [
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.SOLO_DEPLOYMENT_CHART,
        version.SOLO_CHART_VERSION,
        constants.SOLO_TESTING_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.SOLO_CERT_MANAGER_CHART,
        version.SOLO_CHART_VERSION,
        constants.SOLO_TESTING_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.SOLO_SHARED_RESOURCES_CHART,
        version.SOLO_CHART_VERSION,
        constants.SOLO_TESTING_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.MIRROR_NODE_CHART,
        version.MIRROR_NODE_VERSION,
        constants.MIRROR_NODE_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.JSON_RPC_RELAY_CHART,
        version.HEDERA_JSON_RPC_RELAY_VERSION,
        constants.JSON_RPC_RELAY_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.BLOCK_NODE_CHART,
        version.BLOCK_NODE_VERSION,
        constants.BLOCK_NODE_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.PROMETHEUS_STACK_CHART,
        version.PROMETHEUS_STACK_VERSION,
        constants.PROMETHEUS_STACK_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        version.PROMETHEUS_OPERATOR_CRDS_VERSION,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART_URL,
      ),
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.MINIO_OPERATOR_CHART,
        version.MINIO_OPERATOR_VERSION,
        constants.MINIO_OPERATOR_CHART_URL,
      ),
      // The haproxy-ingress chart name equals its release name, which is what `ChartManager` passes as chartName.
      new CacheTarget(
        CacheArtifactEnum.HELM_CHART,
        constants.INGRESS_CONTROLLER_RELEASE_NAME,
        version.INGRESS_CONTROLLER_VERSION,
        constants.INGRESS_CONTROLLER_CHART_URL,
      ),
      // Explorer's chart is fully qualified by its OCI URL, so `ChartManager` passes an empty chart name.
      new CacheTarget(CacheArtifactEnum.HELM_CHART, '', version.EXPLORER_VERSION, constants.EXPLORER_CHART_URL),
    ];
  }
}
