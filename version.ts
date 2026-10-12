// SPDX-License-Identifier: Apache-2.0

import {type Version} from './src/types/index.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PathEx} from './src/business/utils/path-ex.js';
import fs from 'node:fs';
import {isSea} from 'node:sea';
import * as constants from './src/core/constants.js';

/**
 * This file should only contain versions for dependencies and the function to get the Solo version.
 */

// Dependencies
export const HELM_VERSION: string = 'v3.14.2';
export const KIND_VERSION: string = 'v0.29.0';
export const PODMAN_VERSION: string = 'v5.6.0';
export const VFKIT_VERSION: string = 'v0.6.1';
export const GVPROXY_VERSION: string = 'v0.8.7';
// netavark/aardvark-dns pair with the podman Homebrew installs on Linux (its latest major, not
// PODMAN_VERSION above); these pins must move whenever the brew podman major moves.
export const NETAVARK_VERSION: string = 'v2.0.0';
export const AARDVARK_DNS_VERSION: string = 'v2.0.0';
export const KUBECTL_VERSION: string = 'v1.32.2';

export const SOLO_CHART_VERSION: string = constants.getEnvironmentVariable('SOLO_CHART_VERSION') || '0.66.2';
export const HEDERA_PLATFORM_VERSION: string = constants.getEnvironmentVariable('CONSENSUS_NODE_VERSION') || 'v0.77.2';
export const MIRROR_NODE_VERSION: string = constants.getEnvironmentVariable('MIRROR_NODE_VERSION') || 'v0.163.0';
export const EXPLORER_VERSION: string = constants.getEnvironmentVariable('EXPLORER_VERSION') || '26.2.0';
export const HEDERA_JSON_RPC_RELAY_VERSION: string = constants.getEnvironmentVariable('RELAY_VERSION') || '0.78.1';
export const INGRESS_CONTROLLER_VERSION: string =
  constants.getEnvironmentVariable('INGRESS_CONTROLLER_VERSION') || '0.14.5';
// If this version changes, regenerate test/data/proto.zip (see test/data/get-block.sh for steps) —
// a stale vendored schema causes intermittent grpcurl unmarshal failures (see issue #5848).
export const BLOCK_NODE_VERSION: string = constants.getEnvironmentVariable('BLOCK_NODE_VERSION') || '0.43.0';

export const METALLB_CHART_VERSION: string = constants.getEnvironmentVariable('METALLB_CHART_VERSION') || '0.15.3';
export const MINIO_OPERATOR_VERSION: string = constants.getEnvironmentVariable('MINIO_OPERATOR_VERSION') || '7.1.1';
// MinIO stopped publishing new community images to quay.io/docker.io after 2025-10-23. The tenant
// (server) image now comes from Silo (docker.io/pgsty/silo), a MinIO fork maintained by PGSTY
// specifically to keep publishing S3-API-compatible images after upstream stopped. Its
// docker-entrypoint.sh translates 'minio'/'server' argv into the 'silo' binary transparently, so
// it's a drop-in replacement for the MinIO Operator's tenant container invocation — verified
// against the exact args the operator passes (`server --certs-dir ... --console-address ...`).
// Unlike Chainguard's free tier, Silo publishes real dated RELEASE tags, so this is pinned to a
// specific release's digest rather than 'latest' — re-resolve with
// `crane digest docker.io/pgsty/silo:<RELEASE.YYYY-MM-DDTHH-MM-SSZ>` to move this pin forward.
export const MINIO_IMAGE_REPOSITORY: string =
  constants.getEnvironmentVariable('MINIO_IMAGE_REPOSITORY') || 'docker.io/pgsty/silo@sha256';
export const MINIO_IMAGE_DIGEST: string =
  constants.getEnvironmentVariable('MINIO_IMAGE_DIGEST') ||
  '635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46';
export const RUSTFS_CHART_VERSION: string = '1.0.0';
// 1.0.0's scanner holds about one CPU core on single-node, single-disk deployments; fixed in 1.0.1 previews
export const RUSTFS_IMAGE_TAG: string = '1.0.1-preview.16';
export const RUSTFS_BUCKET_INIT_IMAGE: string = 'docker.io/amazon/aws-cli:2.37.6';
export const METRICS_SERVER_VERSION: string = constants.getEnvironmentVariable('METRICS_SERVER_VERSION') || '';
export const PROMETHEUS_STACK_VERSION: string =
  constants.getEnvironmentVariable('PROMETHEUS_STACK_VERSION') || '52.0.1';
export const GRAFANA_PODLOGS_CRD_VERSION: string =
  constants.getEnvironmentVariable('GRAFANA_PODLOGS_CRD_VERSION') || 'v1.11.3';
export const PROMETHEUS_OPERATOR_CRDS_VERSION: string =
  constants.getEnvironmentVariable('PROMETHEUS_OPERATOR_CRDS_VERSION') || '24.0.2';

export const REDIS_IMAGE_VERSION: string = constants.getEnvironmentVariable('REDIS_IMAGE_VERSION') || '8.2.2';
export const REDIS_SENTINEL_IMAGE_VERSION: string =
  constants.getEnvironmentVariable('REDIS_SENTINEL_IMAGE_VERSION') || '8.2.2';

// Image versions embedded in the solo-deployment Helm chart (SOLO_CHART_VERSION).
// These must stay in sync with charts/solo-deployment/values.yaml whenever SOLO_CHART_VERSION bumps.
export const SOLO_CHEETAH_VERSION: string = constants.getEnvironmentVariable('SOLO_CHEETAH_VERSION') || '0.4.5';
export const SOLO_CONTAINERS_VERSION: string = constants.getEnvironmentVariable('SOLO_CONTAINERS_VERSION') || '0.46.2';

// -------------------------------------------------------------------- //
// Edge (newer-than-default) versions for the one-shot `--edge` preset; version.test.ts enforces edge >= default.
export const SOLO_CHART_EDGE_VERSION: string =
  constants.getEnvironmentVariable('SOLO_CHART_EDGE_VERSION') || SOLO_CHART_VERSION;
export const HEDERA_PLATFORM_EDGE_VERSION: string =
  constants.getEnvironmentVariable('CONSENSUS_NODE_EDGE_VERSION') || 'v0.77.2';
export const MIRROR_NODE_EDGE_VERSION: string =
  constants.getEnvironmentVariable('MIRROR_NODE_EDGE_VERSION') || 'v0.164.0';
export const EXPLORER_EDGE_VERSION: string =
  constants.getEnvironmentVariable('EXPLORER_EDGE_VERSION') || EXPLORER_VERSION;
export const HEDERA_JSON_RPC_RELAY_EDGE_VERSION: string =
  constants.getEnvironmentVariable('RELAY_EDGE_VERSION') || '0.79.0';
export const BLOCK_NODE_EDGE_VERSION: string = constants.getEnvironmentVariable('BLOCK_NODE_EDGE_VERSION') || '0.44.0';

// -------------------------------------------------------------------- //

export const MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION: string = '0.152.0';
export const MINIMUM_MIRROR_NODE_VERSION_FOR_ARM64_WEB3_NATIVE_IMAGE: string = '0.155.0';

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS: string = 'v0.74.0-0';
// first consensus node releases that apply these files from data/config after a freeze upgrade
export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_POST_UPGRADE_SIMPLE_FEES: string = 'v0.68.0-0';
export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_POST_UPGRADE_THROTTLES: string = 'v0.54.0-0';
// v0.72.x creates the simple fees schedule file without the entry that topic messages require from v0.73.0
export const HIERO_PLATFORM_VERSION_WITH_INCOMPLETE_SIMPLE_FEES: string = 'v0.72.0-0';
export const MINIMUM_HIERO_PLATFORM_VERSION_REQUIRING_TOPIC_MESSAGE_FEE_ENTRY: string = 'v0.73.0-0';
export const MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_PINGER_ENV_VARS_UPDATE: string = '0.153.0-0';

export const MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR: string = 'v0.72.0-0';
export const NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72: string = '0.8.0';
export const NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72: string =
  // NLG 0.15.1 publishes separate Java 21 and Java 25 images; the chart defaults to Java 21.
  constants.getEnvironmentVariable('NETWORK_LOAD_GENERATOR_CHART_VERSION') || '0.15.1';
export const MINIMUM_CN_VERSION_FOR_SMALL_MEMORY: string = 'v0.72.0-0';
export const MINIMUM_CN_VERSION_FOR_STATE_ON_DISK: string = 'v0.73.0-0';
export const MINIMUM_SOLO_CHART_VERSION: string = '0.64.0';
// Block node >= v0.39.0 serves health endpoints from a dedicated port (BLOCK_NODE_HEALTH_PORT)
// rather than the gRPC port. The '-0' suffix makes pre-releases (e.g. v0.39.0-rc1) satisfy the check.
export const MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_DEDICATED_HEALTH_PORT: string = 'v0.39.0-0';

// hiero-consensus-node#26918 replaced the block root hash with a fixed 16-slot merkle tree. The
// consensus node produces that shape from the v0.77 line and the block node verifies it from 0.41.0,
// so a deployment must keep both on the same side of the boundary: a mismatch is rejected with
// BAD_BLOCK_PROOF, which saturates the consensus node block buffer and stalls the network. The '-0'
// suffix makes pre-releases (e.g. v0.77.2) satisfy the check.
export const MINIMUM_CN_VERSION_FOR_16_SLOT_BLOCK_PROOF: string = 'v0.77.0-0';
export const MINIMUM_BLOCK_NODE_VERSION_FOR_16_SLOT_BLOCK_PROOF: string = 'v0.41.0-0';

export function getSoloVersion(): Version {
  // In SEA mode the bootstrap (sea/sea-main.template.cjs) sets SOLO_SEA_VERSION before any
  // module initializes, so we can return it without a filesystem read.
  if (isSea() && process.env['SOLO_SEA_VERSION']) {
    return process.env['SOLO_SEA_VERSION'] as Version;
  }

  const __filename: string = fileURLToPath(import.meta.url);
  const __dirname: string = path.dirname(__filename);

  const packageJsonPath: string = PathEx.resolve(__dirname, './package.json');
  const packageJson: {version: Version} = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}
