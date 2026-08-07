// SPDX-License-Identifier: Apache-2.0

import {
  color,
  type ListrLogger,
  type ListrRendererValue,
  type LoggerFormat,
  PRESET_TIMER,
  type PresetTimer,
} from 'listr2';
import path from 'node:path';
import url from 'node:url';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {PathEx} from '../business/utils/path-ex.js';
import {PrivateKey} from '@hiero-ledger/sdk';
import 'dotenv/config';
import {type AnyListrContext, type NodeAlias} from '../types/aliases.js';
import {type ListrBaseClassOptions} from 'listr2';
import {SoloListrRenderer} from './task-list/solo-listr-renderer.js';

export const PACKAGE_NAME: string = '@hiero-ledger/solo';

export const SOLO_SILENT_MODE: boolean = getEnvironmentVariable('SOLO_SILENT_MODE') === 'true' || false;

// eslint-disable-next-line solo/no-exported-function
export function getEnvironmentVariable(name: string): string | undefined {
  const value: string | undefined = process.env[name];

  if (value && value.trim() !== '') {
    if (!(process.env.SOLO_SILENT_MODE === 'true')) {
      console.log(`>> environment variable '${name}' exists, using its value`);
    }
    return value;
  }
  return undefined;
}

export const ROOT_DIR: string = PathEx.joinWithRealPath(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');

// -------------------- solo related constants ---------------------------------------------------------------------
export const SOLO_HOME_DIR: string =
  getEnvironmentVariable('SOLO_HOME') ||
  PathEx.join((process.env.HOME as string) || (process.env.USERPROFILE as string), '.solo');
export const SOLO_LOGS_DIR: string = PathEx.join(SOLO_HOME_DIR, 'logs');
export const SOLO_CACHE_DIR: string = getEnvironmentVariable('SOLO_CACHE_DIR') || PathEx.join(SOLO_HOME_DIR, 'cache');
export const SOLO_VALUES_DIR: string = PathEx.join(SOLO_CACHE_DIR, 'values-files');
export const SOLO_LOG_LEVEL: string = getEnvironmentVariable('SOLO_LOG_LEVEL') || 'info';
export const DEFAULT_NAMESPACE: NamespaceName = NamespaceName.of('default');
export const DEFAULT_CERT_MANAGER_NAMESPACE: NamespaceName = NamespaceName.of('cert-manager');
export const HELM: string = 'helm';
export const KIND: string = 'kind';
export const PODMAN: string = 'podman';
export const VFKIT: string = 'vfkit';
export const GVPROXY: string = 'gvproxy';
export const NETAVARK: string = 'netavark';
export const AARDVARK_DNS: string = 'aardvark-dns';
export const DOCKER: string = 'docker';
export const KUBECTL: string = 'kubectl';
export const BASE_DEPENDENCIES: string[] = [HELM, KIND, KUBECTL];
export const DEFAULT_CLUSTER: string = 'solo-cluster';
export const RESOURCES_DIR: string = PathEx.joinWithRealPath(ROOT_DIR, 'resources');
export const DEFAULT_KIND_CLUSTER_CONFIG_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'kind-config.yaml');
export const KIND_CLUSTER_CONFIG_FILE: string =
  getEnvironmentVariable('SOLO_KIND_CLUSTER_CONFIG_FILE') || DEFAULT_KIND_CLUSTER_CONFIG_FILE;
export const KIND_NODE_IMAGE: string =
  getEnvironmentVariable('SOLO_KIND_NODE_IMAGE') ||
  getEnvironmentVariable('KIND_IMAGE') ||
  'kindest/node:v1.31.9@sha256:b94a3a6c06198d17f59cca8c6f486236fa05e2fb359cbd75dabbfc348a10b211';

export const PODMAN_MACHINE_NAME: string = 'podman-machine-default';
export const SOLO_DEV_OUTPUT: boolean = Boolean(getEnvironmentVariable('SOLO_DEV_OUTPUT')) || false;

export const CONFIG: {ENABLE_IMAGE_CACHE: boolean} = {
  ENABLE_IMAGE_CACHE: getEnvironmentVariable('ENABLE_IMAGE_CACHE') !== 'false',
};

export const ROOT_CONTAINER: ContainerName = ContainerName.of('root-container');
export const SOLO_REMOTE_CONFIGMAP_NAME: string = 'solo-remote-config';
export const SOLO_REMOTE_CONFIGMAP_DATA_KEY: string = 'remote-config-data';
export const SOLO_REMOTE_CONFIGMAP_LABELS: Record<string, string> = {'solo.hedera.com/type': 'remote-config'};
export const SOLO_CLUSTER_ROLE_LABELS: Record<string, string> = {'solo.hedera.com/type': 'cluster-role'};
export const SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY: number = 50;
export const SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR: string = 'solo.hedera.com/type=remote-config';
export const NODE_COPY_CONCURRENT: number = Number(getEnvironmentVariable('NODE_COPY_CONCURRENT')) || 4;
export const SKIP_NODE_PING: boolean = Boolean(getEnvironmentVariable('SKIP_NODE_PING')) || false;
export const DEFAULT_LOCK_ACQUIRE_ATTEMPTS: number = +getEnvironmentVariable('SOLO_LEASE_ACQUIRE_ATTEMPTS') || 10;
export const DEFAULT_LEASE_DURATION: number = +getEnvironmentVariable('SOLO_LEASE_DURATION') || 20;

// Recommended minimum container-engine (Docker/Podman) resources; used by the pre-flight resource check.
export const MINIMUM_RECOMMENDED_MEMORY_BYTES: number = 12 * 1024 * 1024 * 1024;
export const MINIMUM_RECOMMENDED_CPU_CORES: number = 6;

export const SOLO_USER_AGENT_HEADER: string = 'Solo-User-Agent';
// --------------- Hedera network and node related constants --------------------------------------------------------------------
export const HEDERA_CHAIN_ID: string = getEnvironmentVariable('SOLO_CHAIN_ID') || '298';
export const HEDERA_HGCAPP_DIR: string = '/opt/hgcapp';
export const HEDERA_SERVICES_PATH: string = `${HEDERA_HGCAPP_DIR}/services-hedera`;
export const HEDERA_HAPI_PATH: string = `${HEDERA_SERVICES_PATH}/HapiApp2.0`;
export const HEDERA_DATA_APPS_DIR: string = 'data/apps';
export const HEDERA_DATA_LIB_DIR: string = 'data/lib';
export const HEDERA_USER_HOME_DIR: string = '/home/hedera';
export const HEDERA_APP_NAME: string = 'HederaNode.jar';
export const HEDERA_BUILDS_URL: string = 'https://builds.hedera.com';
export const HEDERA_NODE_INTERNAL_GOSSIP_PORT: string =
  getEnvironmentVariable('SOLO_NODE_INTERNAL_GOSSIP_PORT') || '50111';
export const HEDERA_NODE_EXTERNAL_GOSSIP_PORT: string =
  getEnvironmentVariable('SOLO_NODE_EXTERNAL_GOSSIP_PORT') || '50111';
export const HEDERA_NODE_DEFAULT_STAKE_AMOUNT: number =
  +getEnvironmentVariable('SOLO_NODE_DEFAULT_STAKE_AMOUNT') || 500;

// Pods with a name matching one of these strings will be ignored when collecting pod metrics
const ignorePodMetricsEnvironment: string = getEnvironmentVariable('IGNORE_POD_METRICS');
export const IGNORE_POD_METRICS: string[] = ignorePodMetricsEnvironment
  ? ignorePodMetricsEnvironment.split(',')
  : ['network-load-generator', 'metrics-server'];

export const REDIS_IMAGE_REGISTRY: string = 'gcr.io';
export const REDIS_IMAGE_REPOSITORY: string = 'mirrornode/redis';
export const REDIS_SENTINEL_IMAGE_REGISTRY: string = 'gcr.io';
export const REDIS_SENTINEL_IMAGE_REPOSITORY: string = 'mirrornode/redis-sentinel';
export const REDIS_SENTINEL_MASTER_SET: string = 'mirror';

// --------------- Charts related constants ----------------------------------------------------------------------------
export const SOLO_SETUP_NAMESPACE: NamespaceName = NamespaceName.of('solo-setup');

// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_TESTING_CHART_URL: string = 'oci://ghcr.io/hashgraph/solo-charts';
// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_DEPLOYMENT_CHART: string = 'solo-deployment';
// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_CERT_MANAGER_CHART: string = 'solo-cert-manager';
export const SOLO_SHARED_RESOURCES_CHART: string = 'solo-shared-resources';

export const JSON_RPC_RELAY_CHART_URL: string =
  getEnvironmentVariable('JSON_RPC_RELAY_CHART_URL') ?? 'https://hiero-ledger.github.io/hiero-json-rpc-relay/charts';
export const JSON_RPC_RELAY_CHART: string = 'hedera-json-rpc';
export const JSON_RPC_RELAY_RELEASE_NAME: string = 'relay';

export const MIRROR_NODE_CHART_URL: string =
  getEnvironmentVariable('MIRROR_NODE_CHART_URL') ?? 'https://hiero-ledger.github.io/hiero-mirror-node/charts';
export const MIRROR_NODE_CHART: string = 'hedera-mirror';
export const MIRROR_NODE_RELEASE_NAME: string = 'mirror';
export const MIRROR_NODE_PINGER_TPS: number = +getEnvironmentVariable('MIRROR_NODE_PINGER_TPS') || 5;
export const PROMETHEUS_STACK_CHART_URL: string =
  getEnvironmentVariable('PROMETHEUS_STACK_CHART_URL') ?? 'https://prometheus-community.github.io/helm-charts';
export const PROMETHEUS_STACK_CHART: string = 'kube-prometheus-stack';
export const PROMETHEUS_RELEASE_NAME: string = 'kube-prometheus-stack';
export const SOLO_SERVICE_MONITOR_NAME: string = 'solo-service-monitor';

export const POD_MONITOR_ROLE: string = 'pod-monitor-role';

export const MINIO_OPERATOR_CHART_URL: string =
  getEnvironmentVariable('MINIO_OPERATOR_CHART_URL') ?? 'https://operator.min.io/';
export const MINIO_OPERATOR_CHART: string = 'operator';
export const MINIO_OPERATOR_RELEASE_NAME: string = 'operator';
/**
 * The MinIO Operator's CRDs, which are cluster-scoped and so outlive the namespace the operator was
 * installed into.
 *
 * This list tracks {@link MINIO_OPERATOR_VERSION} and must be revisited when that moves —
 * `policybindings.sts.min.io` only exists from operator v5 onward.
 *
 * Read as "any one present means something owned these", deliberately unlike `CERT_MANAGER_CRDS` (all
 * must be present) and the prometheus list (counted N of N). Those two decide whether to install a
 * chart, so a partial install should not count; this one decides whether cluster-scoped leftovers are in
 * the way, and a single leftover is enough to break the install. An older operator that predates
 * `policybindings` is therefore still detected by its `tenants` CRD.
 */
export const MINIO_OPERATOR_CRDS: string[] = ['tenants.minio.min.io', 'policybindings.sts.min.io'];

export const METRICS_SERVER_CHART_URL: string =
  getEnvironmentVariable('METRICS_SERVER_CHART_URL') ?? 'https://kubernetes-sigs.github.io/metrics-server/';
export const METRICS_SERVER_CHART: string = 'metrics-server';
export const METRICS_SERVER_RELEASE_NAME: string = 'metrics-server';
export const METRICS_SERVER_NAMESPACE: NamespaceName = NamespaceName.of('kube-system');

export const EXPLORER_CHART_URL: string =
  getEnvironmentVariable('EXPLORER_CHART_URL') ??
  'oci://ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer-chart';
export const EXPLORER_RELEASE_NAME: string = 'hiero-explorer';
export const SOLO_RELAY_LABEL: string = 'app=hedera-json-rpc';
export const SOLO_EXPLORER_LABEL: string = 'app.kubernetes.io/component=hiero-explorer';
export const OLD_SOLO_EXPLORER_LABEL: string = 'app.kubernetes.io/component=hedera-explorer';

// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_CHART_URL: string =
  getEnvironmentVariable('INGRESS_CONTROLLER_CHART_URL') ?? 'https://haproxy-ingress.github.io/charts';
// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_RELEASE_NAME: string = 'haproxy-ingress';
export const EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME: string = 'explorer-haproxy-ingress';
// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_PREFIX: string = 'haproxy-ingress.github.io/controller/';

export const BLOCK_NODE_CHART_URL: string =
  getEnvironmentVariable('BLOCK_NODE_CHART_URL') ?? 'oci://ghcr.io/hiero-ledger/hiero-block-node';
export const BLOCK_NODE_CHART: string = getEnvironmentVariable('BLOCK_NODE_CHART') ?? 'block-node-server';
export const BLOCK_NODE_RELEASE_NAME: string = 'block-node';
export const BLOCK_NODE_CONTAINER_NAME: ContainerName = ContainerName.of(BLOCK_NODE_CHART);

// In-pod JFR disk-repository path `solo block node collect-jfr` reads from; mirrors the consensus node's
// ${HEDERA_HAPI_PATH}/output convention. The overlay's repository path is kept in sync with this constant by
// block-node-values.test.ts.
export const BLOCK_NODE_JFR_REPOSITORY_DIRECTORY: string = '/opt/hiero/block-node/output/jfr';

export const NETWORK_LOAD_GENERATOR_CHART: string = 'network-load-generator';
export const NETWORK_LOAD_GENERATOR_RELEASE_NAME: string = 'network-load-generator';
export const NETWORK_LOAD_GENERATOR_CHART_URL: string =
  getEnvironmentVariable('NETWORK_LOAD_GENERATOR_CHART_URL') ??
  'oci://artifacts.hashgraph.io/load-generator-helm-release-local';
export const NETWORK_LOAD_GENERATOR_POD_LABELS: string[] = [
  'app.kubernetes.io/instance=network-load-generator',
  'app.kubernetes.io/name=network-load-generator',
];

export const PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME: string = 'prometheus-operator-crds';
export const PROMETHEUS_OPERATOR_CRDS_CHART: string = 'prometheus-operator-crds';
export const PROMETHEUS_OPERATOR_CRDS_REPO: string = 'prometheus-community';
export const PROMETHEUS_OPERATOR_CRDS_CHART_URL: string =
  getEnvironmentVariable('PROMETHEUS_OPERATOR_CRDS_CHART_URL') || 'https://prometheus-community.github.io/helm-charts';

export const NETWORK_LOAD_GENERATOR_CONTAINER: ContainerName = ContainerName.of('nlg');

// TODO: remove after migrated to resources/solo-config.yaml
export const CERT_MANAGER_NAME_SPACE: string = 'cert-manager';
export const SOLO_HEDERA_MIRROR_IMPORTER: string[] = [
  'app.kubernetes.io/component=importer',
  'app.kubernetes.io/instance=mirror',
];

// Component label selectors for pod discovery
export const SOLO_RELAY_NAME_LABEL: string = 'app.kubernetes.io/name=relay';
export const SOLO_MIRROR_IMPORTER_NAME_LABEL: string = 'app.kubernetes.io/name=importer';
export const SOLO_MIRROR_PINGER_NAME_LABEL: string = 'app.kubernetes.io/name=pinger';
export const SOLO_MIRROR_GRPC_NAME_LABEL: string = 'app.kubernetes.io/name=grpc';
export const SOLO_MIRROR_MONITOR_NAME_LABEL: string = 'app.kubernetes.io/name=monitor';
export const SOLO_MIRROR_REST_NAME_LABEL: string = 'app.kubernetes.io/name=rest';
export const SOLO_MIRROR_WEB3_NAME_LABEL: string = 'app.kubernetes.io/name=web3';
export const SOLO_MIRROR_POSTGRES_NAME_LABEL: string = 'app.kubernetes.io/name=postgres';
export const SOLO_MIRROR_REDIS_NAME_LABEL: string = 'app.kubernetes.io/name=redis';
export const SOLO_MIRROR_RESTJAVA_NAME_LABEL: string = 'app.kubernetes.io/name=restjava';
export const SOLO_BLOCK_NODE_NAME_LABEL: string = 'block-node.hiero.com/type=block-node';
export const SOLO_INGRESS_CONTROLLER_NAME_LABEL: string = 'app.kubernetes.io/name=haproxy-ingress';

export const DEFAULT_CHART_REPO: Map<string, string> = new Map()
  .set(JSON_RPC_RELAY_CHART, JSON_RPC_RELAY_CHART_URL)
  .set(MIRROR_NODE_RELEASE_NAME, MIRROR_NODE_CHART_URL)
  .set(PROMETHEUS_RELEASE_NAME, PROMETHEUS_STACK_CHART_URL)
  .set(MINIO_OPERATOR_RELEASE_NAME, MINIO_OPERATOR_CHART_URL)
  .set(METRICS_SERVER_RELEASE_NAME, METRICS_SERVER_CHART_URL)
  .set(INGRESS_CONTROLLER_RELEASE_NAME, INGRESS_CONTROLLER_CHART_URL);

export const MIRROR_INGRESS_CLASS_NAME: string = 'mirror-ingress-class';
export const MIRROR_INGRESS_CONTROLLER: string = 'mirror-ingress-controller';
export const EXPLORER_INGRESS_CLASS_NAME: string = 'explorer-ingress-class';
export const EXPLORER_INGRESS_CONTROLLER: string = 'explorer-ingress-controller';
// ------------------- Hedera Account related ---------------------------------------------------------------------------------
export const DEFAULT_OPERATOR_ID_NUMBER: number = +getEnvironmentVariable('SOLO_OPERATOR_ID') || 2;
export const OPERATOR_KEY: string =
  getEnvironmentVariable('SOLO_OPERATOR_KEY') ||
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const OPERATOR_PUBLIC_KEY: string =
  getEnvironmentVariable('SOLO_OPERATOR_PUBLIC_KEY') ||
  '302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92';

export const DEFAULT_FREEZE_ID_NUMBER: number = +getEnvironmentVariable('FREEZE_ADMIN_ACCOUNT') || 58;
export const DEFAULT_TREASURY_ID_NUMBER: number = 2;
export const DEFAULT_START_ID_NUMBER: number = +getEnvironmentVariable('DEFAULT_START_ID_NUMBER') || 3;

export const DEFAULT_GENESIS_KEY: string =
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const GENESIS_KEY: string = getEnvironmentVariable('GENESIS_KEY') || DEFAULT_GENESIS_KEY;
export const GENESIS_PUBLIC_KEY: ReturnType<typeof PrivateKey.fromStringED25519>['publicKey'] =
  PrivateKey.fromStringED25519(GENESIS_KEY).publicKey;
export const SYSTEM_ACCOUNTS: number[][] = [
  [3, 100],
  [200, 349],
  [400, 750],
  [900, 1000],
]; // do account 0.0.2 last and outside the loop
export const SHORTER_SYSTEM_ACCOUNTS: number[][] = [[3, 60]];
export const TREASURY_ACCOUNT: number = 2;
export const LOCAL_NODE_START_PORT: number = +getEnvironmentVariable('LOCAL_NODE_START_PORT') || 30_212;
export const ACCOUNT_UPDATE_BATCH_SIZE: number = +getEnvironmentVariable('ACCOUNT_UPDATE_BATCH_SIZE') || 10;

export const POD_PHASE_RUNNING: string = 'Running';

export const POD_CONDITION_INITIALIZED: string = 'Initialized';
export const POD_CONDITION_READY: string = 'Ready';

export const POD_CONDITION_POD_SCHEDULED: string = 'PodScheduled';
export const POD_CONDITION_STATUS_TRUE: string = 'True';

export const EXPLORER_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'hiero-explorer-values.yaml');
export const RELAY_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'relay-values.yaml');
export const MIRROR_NODE_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'mirror-node-values.yaml');
export const PROMETHEUS_STACK_VALUES_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'prometheus-stack-values.yaml',
);
export const ONE_SHOT_FALCON_PREPARE_SPEC_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'one-shot-falcon-prepare.yaml',
);

/* vars MIRROR_NODE_OLD_.* can be removed once minimum mirrornode version support is 0.152.0.
 * These variables will only be applied if the MIRROR_NODE_VERSION < 0.152.0
 * */
export const MIRROR_NODE_OLD_IMAGE_REGISTRY: string =
  getEnvironmentVariable('MIRROR_NODE_OLD_IMAGE_REGISTRY') || 'gcr.io';
export const MIRROR_NODE_OLD_IMAGE_REPO_ROOT: string =
  getEnvironmentVariable('MIRROR_NODE_OLD_IMAGE_REPO_ROOT') || 'mirrornode/hedera-mirror-';
export const MIRROR_NODE_OLD_MEMORY_REST: string = getEnvironmentVariable('MIRROR_NODE_OLD_MEMORY_REST') || '200Mi';
export const MIRROR_NODE_OLD_MEMORY_RESTJAVA: string =
  getEnvironmentVariable('MIRROR_NODE_OLD_MEMORY_RESTJAVA') || '500Mi';
export const MIRROR_NODE_OLD_MEMORY_WEB3: string = getEnvironmentVariable('MIRROR_NODE_OLD_MEMORY_WEB3') || '1000Mi';
export const MIRROR_NODE_OLD_MEMORY_IMPORTER: string =
  getEnvironmentVariable('MIRROR_NODE_OLD_MEMORY_IMPORTER') || '2000Mi';
export const MIRROR_NODE_OLD_MEMORY_GRPC: string = getEnvironmentVariable('MIRROR_NODE_OLD_MEMORY_GRPC') || '1000Mi';

export const MIRROR_NODE_HIKARI_LIMITS_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'mirror-node-hikari-limits.yaml',
);
export const INGRESS_CONTROLLER_VALUES_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'ingress-controller-values.yaml',
);
// One-shot only: layer this on top of INGRESS_CONTROLLER_VALUES_FILE to expose the mirror node
// ingress controller as NodePort. The nodePort values match the extraPortMappings in the one-shot
// Kind config (resources/templates/small-memory/kind-config.yaml), giving the host a stable Docker
// port mapping instead of a flaky kubectl port-forward tunnel.
export const ONE_SHOT_MIRROR_INGRESS_NODEPORT_VALUES_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'one-shot',
  'mirror-ingress-controller-nodeport-values.yaml',
);
// Host port the one-shot deployment publishes for the mirror node REST API. Matches the legacy
// kubectl port-forward port (MIRROR_NODE_PORT default) so existing URLs keep working; the Kind
// extraPortMappings map it to ingress-controller NodePort 30003 inside the cluster. Must match the
// hostPort in resources/templates/small-memory/kind-config.yaml.
export const ONE_SHOT_MIRROR_REST_HOST_PORT: number = 38_081;
// One-shot only: fixed NodePorts for the explorer, JSON RPC relay, and consensus node gRPC
// (node1 HAProxy) services created by the one-shot deploy orchestrator, plus the host ports the
// Kind extraPortMappings publish them on. Each host port matches the legacy kubectl port-forward
// port so existing URLs keep working. NodePort and host port values must match the
// extraPortMappings in resources/templates/small-memory/kind-config.yaml.
export const ONE_SHOT_EXPLORER_NODE_PORT: number = 30_005;
export const ONE_SHOT_EXPLORER_HOST_PORT: number = 38_080;
export const ONE_SHOT_RELAY_NODE_PORT: number = 30_006;
export const ONE_SHOT_RELAY_HOST_PORT: number = 37_546;
export const ONE_SHOT_CONSENSUS_GRPC_NODE_PORT: number = 30_007;
export const ONE_SHOT_CONSENSUS_GRPC_HOST_PORT: number = 35_211;
export const BLOCK_NODE_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'block-node-values.yaml');
export const BLOCK_NODE_SOLO_DEV_FILE: string = BLOCK_NODE_VALUES_FILE;
export const BLOCK_NODE_MESSAGING_WORKAROUND_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'block-node-messaging-workaround.yaml',
);
export const MIRROR_POSTGRES_TRUNCATE_SQL_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'mirror-postgres-truncate.sql',
);
export const UPGRADE_MIGRATIONS_FILE: string = PathEx.join(RESOURCES_DIR, 'component-upgrade-migrations.json');
export const SOLO_DEPLOYMENT_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'solo-values.yaml');
export const BLOCK_NODE_TSS_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'block-node-tss-values.yaml');
export const RENAME_STATE_NODE_ID_SCRIPT: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'rename-state-node-id.sh');
export const NODE_LOG_FAILURE_MSG: string = 'failed to download logs from pod';
export const ONE_SHOT_WITH_BLOCK_NODE: string = getEnvironmentVariable('ONE_SHOT_WITH_BLOCK_NODE') || 'false';
export const ONE_SHOT_BLOCK_NODE_PERF: string = getEnvironmentVariable('ONE_SHOT_BLOCK_NODE_PERF') || 'false';
export const ONE_SHOT_DEPLOYMENT_NAME: string = 'one-shot';
export const RAPID_FIRE_VALUES_FILE: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'rapid-fire', 'nlg-values.yaml');

export const SOLO_CACHE_IMAGES_TARGET_FILE: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'config',
  'solo-cache-images-target.yaml',
);

export const CONTAINER_COPY_MAX_ATTEMPTS: number = +getEnvironmentVariable('CONTAINER_COPY_MAX_ATTEMPTS') || 3;
export const CONTAINER_COPY_BACKOFF_MS: number = +getEnvironmentVariable('CONTAINER_COPY_BACKOFF_MS') || 300;

export const CHECK_WRAPS_DIRECTORY_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('CHECK_WRAPS_DIRECTORY_MAX_ATTEMPTS') || 10;
export const CHECK_WRAPS_DIRECTORY_BACKOFF_MS: number =
  +getEnvironmentVariable('CHECK_WRAPS_DIRECTORY_BACKOFF_MS') || 2000;

/**
 * Listr related
 * @returns a object that defines the default color options
 */
export const LISTR_DEFAULT_RENDERER_TIMER_OPTION: PresetTimer = {
  ...PRESET_TIMER,
  condition: (duration: number): boolean => duration > 100,
  format: (duration: number): LoggerFormat => {
    if (duration > 30_000) {
      return color.red;
    }

    return color.green;
  },
};

export const LISTR_DEFAULT_RENDERER_OPTION: {
  collapseSubtasks: boolean;
  timer: PresetTimer;
  logger?: ListrLogger;
  persistentOutput: boolean;
  clearOutput: boolean;
  collapseErrors: boolean;
  showErrorMessage: boolean;
  formatOutput: 'wrap' | 'truncate';
} = {
  collapseSubtasks: false,
  timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
  persistentOutput: true,
  clearOutput: false,
  collapseErrors: false,
  showErrorMessage: false,
  formatOutput: 'wrap',
};

export const LISTR_DEFAULT_RENDERER_COLLAPSABLE_OPTIONS: typeof LISTR_DEFAULT_RENDERER_OPTION = {
  collapseSubtasks: true,
  timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
  persistentOutput: true,
  clearOutput: false,
  collapseErrors: false,
  showErrorMessage: false,
  formatOutput: 'wrap',
};

export const LISTR_DEFAULT_OPTIONS: {
  DEFAULT: ListrBaseClassOptions<AnyListrContext, ListrRendererValue>;
  WITH_CONCURRENCY: ListrBaseClassOptions<AnyListrContext, ListrRendererValue>;
  WITH_CONCURRENCY_COLLAPSABLE: ListrBaseClassOptions<AnyListrContext, ListrRendererValue>;
} = {
  DEFAULT: {
    renderer: SOLO_SILENT_MODE ? 'silent' : SoloListrRenderer,
    concurrent: false,
    rendererOptions: LISTR_DEFAULT_RENDERER_OPTION,
    fallbackRendererOptions: {
      timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
    },
  },
  WITH_CONCURRENCY: {
    renderer: SOLO_SILENT_MODE ? 'silent' : SoloListrRenderer,
    concurrent: true,
    rendererOptions: LISTR_DEFAULT_RENDERER_OPTION,
    fallbackRendererOptions: {
      timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
    },
  },
  WITH_CONCURRENCY_COLLAPSABLE: {
    renderer: SOLO_SILENT_MODE ? 'silent' : SoloListrRenderer,
    concurrent: true,
    rendererOptions: LISTR_DEFAULT_RENDERER_COLLAPSABLE_OPTIONS,
    fallbackRendererOptions: {
      timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
    },
  },
};

// Maximum number of image cache operations that run concurrently, applied to both the pull path
// and the load path. Bounded to avoid amplifying Docker Hub rate limits when fetching images and to avoid
// saturating the network/disk, while staying wide enough to keep a cold pull responsive.
export const CACHE_IMAGE_MAX_CONCURRENCY: number = +getEnvironmentVariable('CACHE_IMAGE_MAX_CONCURRENCY') || 12;

export const SIGNING_KEY_PREFIX: string = 's';
export const CERTIFICATE_VALIDITY_YEARS: number = 100; // years

export const LOCAL_HOST: string = '127.0.0.1';

export const STANDARD_DATAMASK: string = '***';

// ------ Hedera SDK Related ------
export const NODE_CLIENT_MAX_ATTEMPTS: number = +getEnvironmentVariable('NODE_CLIENT_MAX_ATTEMPTS') || 600;
export const NODE_CLIENT_MIN_BACKOFF: number = +getEnvironmentVariable('NODE_CLIENT_MIN_BACKOFF') || 1000;
export const NODE_CLIENT_MAX_BACKOFF: number = +getEnvironmentVariable('NODE_CLIENT_MAX_BACKOFF') || 1000;
export const NODE_CLIENT_REQUEST_TIMEOUT: number = +getEnvironmentVariable('NODE_CLIENT_REQUEST_TIMEOUT') || 600_000;
export const NODE_CLIENT_MAX_QUERY_PAYMENT: number = +getEnvironmentVariable('NODE_CLIENT_MAX_QUERY_PAYMENT') || 20;
export const NODE_CLIENT_SDK_PING_MAX_RETRIES: number =
  +getEnvironmentVariable('NODE_CLIENT_SDK_PING_MAX_RETRIES') || 5;
export const NODE_CLIENT_SDK_PING_RETRY_INTERVAL: number =
  +getEnvironmentVariable('NODE_CLIENT_SDK_PING_RETRY_INTERVAL') || 10_000;

// ---- New Node Related ----
export const ENDPOINT_TYPE_IP: string = 'IP';
export const ENDPOINT_TYPE_FQDN: string = 'FQDN';
export const DEFAULT_NETWORK_NODE_NAME: NodeAlias = 'node1';

// file-id must be between 0.0.150 and 0.0.159
// file must be uploaded using FileUpdateTransaction in maximum of 5Kb chunks
export const UPGRADE_FILE_ID_NUM: number = 150;
export const UPGRADE_FILE_CHUNK_SIZE: number = 1024 * 5; // 5Kb

export const JVM_DEBUG_PORT: number = 5005;

export const PODS_RUNNING_MAX_ATTEMPTS: number = +getEnvironmentVariable('PODS_RUNNING_MAX_ATTEMPTS') || 60 * 15;
export const PODS_RUNNING_DELAY: number = +getEnvironmentVariable('PODS_RUNNING_DELAY') || 1000;

// Used during `node upgrade` to detect whether a helm upgrade actually triggered a node pod
// rollout before waiting on its readiness, so an upgrade that never changes the pod template
// doesn't block waiting for a restart that will never happen.
export const NODE_POD_ROLLOUT_DETECTION_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NODE_POD_ROLLOUT_DETECTION_MAX_ATTEMPTS') || 20;
export const NODE_POD_ROLLOUT_DETECTION_DELAY: number =
  +getEnvironmentVariable('NODE_POD_ROLLOUT_DETECTION_DELAY') || 1500;

// Node Checks
export const NETWORK_NODE_ACTIVE_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NETWORK_NODE_ACTIVE_MAX_ATTEMPTS') || 300;
export const NETWORK_NODE_ACTIVE_DELAY: number = +getEnvironmentVariable('NETWORK_NODE_ACTIVE_DELAY') || 1000;
export const NETWORK_NODE_ACTIVE_TIMEOUT: number = +getEnvironmentVariable('NETWORK_NODE_ACTIVE_TIMEOUT') || 1000;

// Number of consecutive fatal container states (e.g. CrashLoopBackOff, OOMKilled) detected while
// polling node activeness before failing fast instead of waiting out the full attempt budget.
export const NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD: number = 3;

// GRPC Healtcheck Checks
export const NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS') || 20;
export const NETWORK_NODE_GRPC_READINESS_DELAY: number =
  +getEnvironmentVariable('NETWORK_NODE_GRPC_READINESS_DELAY') || 1000;
export const NETWORK_NODE_GRPC_READINESS_REQUIRED_SUCCESSES: number =
  +getEnvironmentVariable('NETWORK_NODE_GRPC_READINESS_REQUIRED_SUCCESSES') || 3;

export const NETWORK_PROXY_MAX_ATTEMPTS: number = +getEnvironmentVariable('NETWORK_PROXY_MAX_ATTEMPTS') || 300;
export const NETWORK_PROXY_DELAY: number = +getEnvironmentVariable('NETWORK_PROXY_DELAY') || 2000;
export const PODS_READY_MAX_ATTEMPTS: number = +getEnvironmentVariable('PODS_READY_MAX_ATTEMPTS') || 300;
export const PODS_READY_DELAY: number = +getEnvironmentVariable('PODS_READY_DELAY') || 2000;
export const MIRROR_NODE_PINGER_PODS_READY_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('MIRROR_NODE_PINGER_PODS_READY_MAX_ATTEMPTS') || 900;
export const MIRROR_NODE_PINGER_PODS_READY_DELAY: number =
  +getEnvironmentVariable('MIRROR_NODE_PINGER_PODS_READY_DELAY') || 2000;
export const MIRROR_NODE_SCHEMA_READY_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('MIRROR_NODE_SCHEMA_READY_MAX_ATTEMPTS') || 900;
export const MIRROR_NODE_SCHEMA_READY_DELAY: number = +getEnvironmentVariable('MIRROR_NODE_SCHEMA_READY_DELAY') || 2000;
export const MIRROR_NODE_IMPORTER_DETECT_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('MIRROR_NODE_IMPORTER_DETECT_MAX_ATTEMPTS') || 15;
export const MIRROR_NODE_IMPORTER_DETECT_DELAY: number =
  +getEnvironmentVariable('MIRROR_NODE_IMPORTER_DETECT_DELAY') || 2000;
export const RELAY_PODS_RUNNING_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('RELAY_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const RELAY_PODS_RUNNING_DELAY: number =
  +getEnvironmentVariable('RELAY_PODS_RUNNING_DELAY') ||
  +getEnvironmentVariable('RELAY_PODS_RUNNING_RUNNING_DELAY') ||
  1000;
export const RELAY_PODS_READY_MAX_ATTEMPTS: number = +getEnvironmentVariable('RELAY_PODS_READY_MAX_ATTEMPTS') || 900;
export const RELAY_PODS_READY_DELAY: number = +getEnvironmentVariable('RELAY_PODS_READY_DELAY') || 1000;
export const BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const BLOCK_NODE_PODS_RUNNING_DELAY: number = +getEnvironmentVariable('BLOCK_NODE_PODS_RUNNING_DELAY') || 1000;
export const BLOCK_NODE_ACTIVE_MAX_ATTEMPTS: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_MAX_ATTEMPTS') || 100;
export const BLOCK_NODE_ACTIVE_DELAY: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_DELAY') || 60;
export const BLOCK_NODE_ACTIVE_TIMEOUT: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_TIMEOUT') || 60;

export const BLOCK_NODE_PORT: number = +getEnvironmentVariable('BLOCK_NODE_PORT') || 40_840;

// Block node >= v0.39.0 serves its health endpoints (/healthz/livez, /healthz/readyz) from a
// dedicated web server on this port, separate from the gRPC port (BLOCK_NODE_PORT). See
// hiero-ledger/hiero-block-node#3216.
export const BLOCK_NODE_HEALTH_PORT: number = +getEnvironmentVariable('BLOCK_NODE_HEALTH_PORT') || 40_983;

export const BLOCK_ITEM_BATCH_SIZE: number = +getEnvironmentVariable('BLOCK_ITEM_BATCH_SIZE') || 256;

// Filename suffix used for log/config archive files
export const LOG_CONFIG_ZIP_SUFFIX: string = '-log-config.zip';
export const NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NETWORK_LOAD_GENERATOR_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY: number =
  +getEnvironmentVariable('NETWORK_LOAD_GENERATOR_PODS_RUNNING_DELAY') || 1000;
export const PORT_FORWARDING_MESSAGE_GROUP: string = 'port-forwarding';
// Collects images that failed to cache (pull) or load so a summary can be shown at the end of the run.
export const CACHE_IMAGE_FAILURE_MESSAGE_GROUP: string = 'cache-image-failures';
export const GRPC_PORT: number = +getEnvironmentVariable('GRPC_PORT') || 50_211;
export const GRPCS_PORT: number = GRPC_PORT + 1;
export const GRPC_LOCAL_PORT: number = +getEnvironmentVariable('GRPC_LOCAL_PORT') || 35_211;
export const GRPC_WEB_PORT: number = +getEnvironmentVariable('GRPC_WEB_PORT') || 8080;
export const JSON_RPC_RELAY_PORT: number = +getEnvironmentVariable('JSON_RPC_RELAY_PORT') || 7546;
export const JSON_RPC_RELAY_LOCAL_PORT: number = +getEnvironmentVariable('JSON_RPC_RELAY_LOCAL_PORT') || 37_546;
export const EXPLORER_PORT: number = +getEnvironmentVariable('EXPLORER_PORT') || 8080;
export const EXPLORER_LOCAL_PORT: number = +getEnvironmentVariable('EXPLORER_LOCAL_PORT') || 38_080;
export const MIRROR_NODE_PORT: number = +getEnvironmentVariable('MIRROR_NODE_PORT') || 38_081;
export const MIRROR_REST_CONTAINER_PORT: number = 5551;
export const LOCAL_BUILD_COPY_RETRY: number = +getEnvironmentVariable('LOCAL_BUILD_COPY_RETRY') || 3;

export const LOAD_BALANCER_CHECK_DELAY_SECS: number = +getEnvironmentVariable('LOAD_BALANCER_CHECK_DELAY_SECS') || 5;
export const LOAD_BALANCER_CHECK_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('LOAD_BALANCER_CHECK_MAX_ATTEMPTS') || 60;

export const NETWORK_CHART_INSTALL_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NETWORK_CHART_INSTALL_MAX_ATTEMPTS') || 3;
export const NETWORK_CHART_INSTALL_RETRY_DELAY_SECS: number =
  +getEnvironmentVariable('NETWORK_CHART_INSTALL_RETRY_DELAY_SECS') || 15;

export const MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS') || 3;
export const MIRROR_NODE_CHART_UPGRADE_RETRY_DELAY_SECS: number =
  +getEnvironmentVariable('MIRROR_NODE_CHART_UPGRADE_RETRY_DELAY_SECS') || 15;

export const NETWORK_DESTROY_WAIT_TIMEOUT: number = +getEnvironmentVariable('NETWORK_DESTROY_WAIT_TIMEOUT') || 120;

export const DEFAULT_LOCAL_CONFIG_FILE: string = 'local-config.yaml';
export const NODE_OVERRIDE_FILE: string = 'node-overrides.yaml';

export const NODES_STARTED_EVENT_TIMEOUT_MINUTES: number =
  +getEnvironmentVariable('NODES_STARTED_EVENT_TIMEOUT_MINUTES') || 30;
export const MIRROR_NODE_DEPLOYED_EVENT_TIMEOUT_MINUTES: number =
  +getEnvironmentVariable('MIRROR_NODE_DEPLOYED_EVENT_TIMEOUT_MINUTES') || 10;
export const IGNORED_NODE_ACCOUNT_ID: string = '0.0.0';

export const UPLOADER_SECRET_NAME: string = 'uploader-mirror-secrets';
export const MINIO_SECRET_NAME: string = 'minio-secrets';
export const BACKUP_SECRET_NAME: string = 'backup-uploader-secrets';
export const MIRROR_INGRESS_TLS_SECRET_NAME: string = 'ca-secret-mirror-node';
export const EXPLORER_INGRESS_TLS_SECRET_NAME: string = 'ca-secret-hiero-explorer';

export const BLOCK_STREAM_STREAM_MODE: string = getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') || 'BOTH';
export const BLOCK_STREAM_WRITER_MODE: string = getEnvironmentVariable('BLOCK_STREAM_WRITER_MODE') || 'FILE_AND_GRPC';

export const BLOCK_NODE_IMAGE_NAME: string = 'block-node-server';
export const RELAY_IMAGE_NAME: string = 'hiero-json-rpc-relay';
export const EXPLORER_IMAGE_NAME: string = 'hiero-explorer';
export const APPLICATION_PROPERTIES: string = 'application.properties';
export const APPLICATION_PROPERTIES_ENABLE_OVERWRITE_MARKER: string = 'SOLO_ENABLE_OVERWRITE=true';
export const BLOCK_NODES_JSON_FILE: string = 'block-nodes.json';
export const NETWORK_NODE_SHARED_DATA_CONFIG_MAP_NAME: string = 'network-node-data-config-cm';
export const enum StorageType {
  MINIO_ONLY = 'minio_only',
  AWS_ONLY = 'aws_only',
  GCS_ONLY = 'gcs_only',
  AWS_AND_GCS = 'aws_and_gcs',
}

export const CERT_MANAGER_CRDS: string[] = [
  'certificaterequests.cert-manager.io',
  'certificates.cert-manager.io',
  'clusterissuers.cert-manager.io',
  'issuers.cert-manager.io',
];

export const TRIGGER_STAKE_WEIGHT_CALCULATE_WAIT_SECONDS: number =
  +getEnvironmentVariable('TRIGGER_STAKE_WEIGHT_CALCULATE_WAIT_SECONDS') || 60;

export const DISABLE_IMPORTER_SPRING_PROFILES: boolean =
  getEnvironmentVariable('DISABLE_IMPORTER_SPRING_PROFILES') === 'true' || false;
export const SPRING_PROFILES_ACTIVE: string = getEnvironmentVariable('SPRING_PROFILES_ACTIVE') || 'blocknode';

export const SOLO_CREATED_BY_LABEL: string = 'app.kubernetes.io/created-by';
export const SOLO_CREATED_BY_VALUE: string = 'solo';
export const DEFAULT_SOLO_NAMESPACE_LABELS: Record<string, string> = {[SOLO_CREATED_BY_LABEL]: SOLO_CREATED_BY_VALUE};

// Log rotation configuration
export const LOG_MAX_FILE_SIZE: string = '50M';
export const LOG_MAX_FILES: number = 5;
export const LOG_ROTATION_INTERVAL: string = '1d';
