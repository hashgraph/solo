/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import {AccountId, FileId} from '@hashgraph/sdk';
import {color, type ListrLogger, PRESET_TIMER} from 'listr2';
import path, {dirname, normalize} from 'path';
import {fileURLToPath} from 'url';

export const ROOT_DIR = path.join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// -------------------- solo related constants ---------------------------------------------------------------------
export const SOLO_HOME_DIR = process.env.SOLO_HOME || path.join(process.env.HOME as string, '.solo');
export const SOLO_LOGS_DIR = path.join(SOLO_HOME_DIR, 'logs');
export const SOLO_CACHE_DIR = path.join(SOLO_HOME_DIR, 'cache');
export const SOLO_VALUES_DIR = path.join(SOLO_CACHE_DIR, 'values-files');
export const DEFAULT_NAMESPACE = 'default';
export const HELM = 'helm';
export const RESOURCES_DIR = normalize(path.join(ROOT_DIR, 'resources'));

export const ROOT_CONTAINER = 'root-container';
export const SOLO_REMOTE_CONFIGMAP_NAME = 'solo-remote-config';
export const SOLO_REMOTE_CONFIGMAP_LABELS = {'solo.hedera.com/type': 'remote-config'};
export const SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY = 50;

// --------------- Hedera network and node related constants --------------------------------------------------------------------
export const HEDERA_CHAIN_ID = process.env.SOLO_CHAIN_ID || '298';
export const HEDERA_HGCAPP_DIR = '/opt/hgcapp';
export const HEDERA_SERVICES_PATH = `${HEDERA_HGCAPP_DIR}/services-hedera`;
export const HEDERA_HAPI_PATH = `${HEDERA_SERVICES_PATH}/HapiApp2.0`;
export const HEDERA_DATA_APPS_DIR = 'data/apps';
export const HEDERA_DATA_LIB_DIR = 'data/lib';
export const HEDERA_USER_HOME_DIR = '/home/hedera';
export const HEDERA_APP_NAME = 'HederaNode.jar';
export const HEDERA_BUILDS_URL = 'https://builds.hedera.com';
export const HEDERA_NODE_ACCOUNT_ID_START = AccountId.fromString(process.env.SOLO_NODE_ACCOUNT_ID_START || '0.0.3');
export const HEDERA_NODE_INTERNAL_GOSSIP_PORT = process.env.SOLO_NODE_INTERNAL_GOSSIP_PORT || '50111';
export const HEDERA_NODE_EXTERNAL_GOSSIP_PORT = process.env.SOLO_NODE_EXTERNAL_GOSSIP_PORT || '50111';
export const HEDERA_NODE_DEFAULT_STAKE_AMOUNT = +process.env.SOLO_NODE_DEFAULT_STAKE_AMOUNT || 500;

// --------------- Charts related constants ----------------------------------------------------------------------------
export const SOLO_SETUP_NAMESPACE = 'solo-setup';
export const SOLO_TESTING_CHART_URL = 'oci://ghcr.io/hashgraph/solo-charts';
export const SOLO_CLUSTER_SETUP_CHART = 'solo-cluster-setup';
export const SOLO_DEPLOYMENT_CHART = 'solo-deployment';
export const JSON_RPC_RELAY_CHART_URL = 'https://hashgraph.github.io/hedera-json-rpc-relay/charts';
export const JSON_RPC_RELAY_CHART = 'hedera-json-rpc-relay';
export const MIRROR_NODE_CHART_URL = 'https://hashgraph.github.io/hedera-mirror-node/charts';
export const MIRROR_NODE_CHART = 'hedera-mirror';
export const MIRROR_NODE_RELEASE_NAME = 'mirror';
export const HEDERA_EXPLORER_CHART_UTL = 'oci://ghcr.io/hashgraph/hedera-mirror-node-explorer/hedera-explorer';
export const HEDERA_EXPLORER_CHART = 'hedera-explorer';
export const SOLO_RELAY_LABEL = 'app=hedera-json-rpc-relay';
export const SOLO_HEDERA_EXPLORER_LABEL = 'app.kubernetes.io/name=hedera-explorer';

export const SOLO_HEDERA_MIRROR_IMPORTER = [
  'app.kubernetes.io/component=importer',
  'app.kubernetes.io/instance=mirror',
];

export const DEFAULT_CHART_REPO: Map<string, string> = new Map()
  .set(JSON_RPC_RELAY_CHART, JSON_RPC_RELAY_CHART_URL)
  .set(MIRROR_NODE_RELEASE_NAME, MIRROR_NODE_CHART_URL);

// ------------------- Hedera Account related ---------------------------------------------------------------------------------
export const OPERATOR_ID = process.env.SOLO_OPERATOR_ID || '0.0.2';
export const OPERATOR_KEY =
  process.env.SOLO_OPERATOR_KEY ||
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const OPERATOR_PUBLIC_KEY =
  process.env.SOLO_OPERATOR_PUBLIC_KEY ||
  '302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92';
export const FREEZE_ADMIN_ACCOUNT =
  process.env.FREEZE_ADMIN_ACCOUNT || `${HEDERA_NODE_ACCOUNT_ID_START.realm}.${HEDERA_NODE_ACCOUNT_ID_START.shard}.58`;
export const TREASURY_ACCOUNT_ID = `${HEDERA_NODE_ACCOUNT_ID_START.realm}.${HEDERA_NODE_ACCOUNT_ID_START.shard}.2`;
export const GENESIS_KEY =
  process.env.GENESIS_KEY ||
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const SYSTEM_ACCOUNTS = [
  [3, 100],
  [200, 349],
  [400, 750],
  [900, 1000],
]; // do account 0.0.2 last and outside the loop
export const SHORTER_SYSTEM_ACCOUNTS = [[3, 60]];
export const TREASURY_ACCOUNT = 2;
export const LOCAL_NODE_START_PORT = +process.env.LOCAL_NODE_START_PORT || 30212;
export const ACCOUNT_UPDATE_BATCH_SIZE = +process.env.ACCOUNT_UPDATE_BATCH_SIZE || 10;

export const POD_PHASE_RUNNING = 'Running';

export const POD_CONDITION_INITIALIZED = 'Initialized';
export const POD_CONDITION_READY = 'Ready';

export const POD_CONDITION_POD_SCHEDULED = 'PodScheduled';
export const POD_CONDITION_STATUS_TRUE = 'True';

export const EXPLORER_VALUES_FILE = path.join('resources', 'hedera-explorer-values.yaml');
export const MIRROR_NODE_VALUES_FILE = path.join('resources', 'mirror-node-values.yaml');

export const NODE_LOG_FAILURE_MSG = 'failed to download logs from pod';

/**
 * Listr related
 * @return a object that defines the default color options
 */
export const LISTR_DEFAULT_RENDERER_TIMER_OPTION = {
  ...PRESET_TIMER,
  condition: (duration: number) => duration > 100,
  format: (duration: number) => {
    if (duration > 30000) {
      return color.red;
    }

    return color.green;
  },
};

export const LISTR_DEFAULT_RENDERER_OPTION = {
  collapseSubtasks: false,
  timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
} as {
  collapseSubtasks: boolean;
  timer: {
    condition: (duration: number) => boolean;
    format: (duration: number) => any;
    field: string | ((args_0: number) => string);
    args?: [number];
  };
  logger: ListrLogger;
};

export const SIGNING_KEY_PREFIX = 's';
export const CERTIFICATE_VALIDITY_YEARS = 100; // years

export const OS_WINDOWS = 'windows';
export const OS_WIN32 = 'win32';
export const OS_DARWIN = 'darwin';
export const OS_LINUX = 'linux';

export const LOCAL_HOST = '127.0.0.1';

export const PROFILE_LARGE = 'large';
export const PROFILE_MEDIUM = 'medium';
export const PROFILE_SMALL = 'small';
export const PROFILE_TINY = 'tiny';
export const PROFILE_LOCAL = 'local';

export const ALL_PROFILES = [PROFILE_LOCAL, PROFILE_TINY, PROFILE_SMALL, PROFILE_MEDIUM, PROFILE_LARGE];
export const DEFAULT_PROFILE_FILE = path.join(SOLO_CACHE_DIR, 'profiles', 'custom-spec.yaml');

// ------ Hedera SDK Related ------
export const NODE_CLIENT_MAX_ATTEMPTS = +process.env.NODE_CLIENT_MAX_ATTEMPTS || 600;
export const NODE_CLIENT_MIN_BACKOFF = +process.env.NODE_CLIENT_MIN_BACKOFF || 1_000;
export const NODE_CLIENT_MAX_BACKOFF = +process.env.NODE_CLIENT_MAX_BACKOFF || 1_000;
export const NODE_CLIENT_REQUEST_TIMEOUT = +process.env.NODE_CLIENT_REQUEST_TIMEOUT || 600_000;
export const NODE_CLIENT_PING_INTERVAL = +process.env.NODE_CLIENT_PING_INTERVAL || 30_000;
export const NODE_CLIENT_PING_MAX_RETRIES = +process.env.NODE_CLIENT_PING_MAX_RETRIES || 10;
export const NODE_CLIENT_PING_RETRY_INTERVAL = +process.env.NODE_CLIENT_PING_RETRY_INTERVAL || 30_000;

// ---- New Node Related ----
export const ENDPOINT_TYPE_IP = 'IP';
export const ENDPOINT_TYPE_FQDN = 'FQDN';
export const DEFAULT_NETWORK_NODE_NAME = 'node1';

// file-id must be between 0.0.150 and 0.0.159
// file must be uploaded using FileUpdateTransaction in maximum of 5Kb chunks
export const UPGRADE_FILE_ID = FileId.fromString('0.0.150');
export const UPGRADE_FILE_CHUNK_SIZE = 1024 * 5; // 5Kb

export const JVM_DEBUG_PORT = 5005;

export const PODS_RUNNING_MAX_ATTEMPTS = +process.env.PODS_RUNNING_MAX_ATTEMPTS || 60 * 15;
export const PODS_RUNNING_DELAY = +process.env.PODS_RUNNING_DELAY || 1000;
export const NETWORK_NODE_ACTIVE_MAX_ATTEMPTS = +process.env.NETWORK_NODE_ACTIVE_MAX_ATTEMPTS || 120;
export const NETWORK_NODE_ACTIVE_DELAY = +process.env.NETWORK_NODE_ACTIVE_DELAY || 1_000;
export const NETWORK_NODE_ACTIVE_TIMEOUT = +process.env.NETWORK_NODE_ACTIVE_TIMEOUT || 1_000;
export const NETWORK_PROXY_MAX_ATTEMPTS = +process.env.NETWORK_PROXY_MAX_ATTEMPTS || 300;
export const NETWORK_PROXY_DELAY = +process.env.NETWORK_PROXY_DELAY || 2000;
export const PODS_READY_MAX_ATTEMPTS = +process.env.PODS_READY_MAX_ATTEMPTS || 300;
export const PODS_READY_DELAY = +process.env.PODS_READY_DELAY || 2_000;
export const RELAY_PODS_RUNNING_MAX_ATTEMPTS = +process.env.RELAY_PODS_RUNNING_MAX_ATTEMPTS || 900;
export const RELAY_PODS_RUNNING_DELAY = +process.env.RELAY_PODS_RUNNING_DELAY || 1_000;
export const RELAY_PODS_READY_MAX_ATTEMPTS = +process.env.RELAY_PODS_READY_MAX_ATTEMPTS || 100;
export const RELAY_PODS_READY_DELAY = +process.env.RELAY_PODS_READY_DELAY || 1_000;
export const GRPC_PORT = +process.env.GRPC_PORT || 50_211;

export const NETWORK_DESTROY_WAIT_TIMEOUT = +process.env.NETWORK_DESTROY_WAIT_TIMEOUT || 120;

export const DEFAULT_LOCAL_CONFIG_FILE = 'local-config.yaml';
export const IGNORED_NODE_ACCOUNT_ID = '0.0.0';
