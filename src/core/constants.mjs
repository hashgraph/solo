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
import { AccountId } from '@hashgraph/sdk'
import { color, PRESET_TIMER } from 'listr2'
import { dirname, normalize } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { constants } from './index.mjs'

// -------------------- solo related constants ---------------------------------------------------------------------
export const CUR_FILE_DIR = dirname(fileURLToPath(import.meta.url))
export const USER = `${process.env.USER}`
export const USER_SANITIZED = USER.replace(/[\W_]+/g, '-')
export const SOLO_HOME_DIR = process.env.SOLO_HOME || `${process.env.HOME}/.solo`
export const SOLO_LOGS_DIR = `${SOLO_HOME_DIR}/logs`
export const SOLO_CACHE_DIR = `${SOLO_HOME_DIR}/cache`
export const SOLO_VALUES_DIR = `${SOLO_CACHE_DIR}/values-files`
export const DEFAULT_NAMESPACE = 'default'
export const HELM = 'helm'
export const KEYTOOL = 'keytool'
export const CWD = process.cwd()
export const SOLO_CONFIG_FILE = `${SOLO_HOME_DIR}/solo.config`
export const RESOURCES_DIR = normalize(CUR_FILE_DIR + '/../../resources')
export const PROFILES_DIR = normalize(`${RESOURCES_DIR}/profiles`)

export const ROOT_CONTAINER = 'root-container'

// --------------- Hedera network and node related constants --------------------------------------------------------------------
export const HEDERA_CHAIN_ID = process.env.SOLO_CHAIN_ID || '298'
export const HEDERA_HGCAPP_DIR = '/opt/hgcapp'
export const HEDERA_SERVICES_PATH = `${HEDERA_HGCAPP_DIR}/services-hedera`
export const HEDERA_HAPI_PATH = `${HEDERA_SERVICES_PATH}/HapiApp2.0`
export const HEDERA_DATA_APPS_DIR = 'data/apps'
export const HEDERA_DATA_LIB_DIR = 'data/lib'
export const HEDERA_USER_HOME_DIR = '/home/hedera'
export const HEDERA_APP_NAME = 'HederaNode.jar'
export const HEDERA_BUILDS_URL = 'https://builds.hedera.com'
export const HEDERA_NODE_ACCOUNT_ID_START = AccountId.fromString(process.env.SOLO_NODE_ACCOUNT_ID_START || '0.0.3')
export const HEDERA_NODE_INTERNAL_GOSSIP_PORT = process.env.SOLO_NODE_INTERNAL_GOSSIP_PORT || '50111'
export const HEDERA_NODE_EXTERNAL_GOSSIP_PORT = process.env.SOLO_NODE_EXTERNAL_GOSSIP_PORT || '50111'

export const HEDERA_NODE_GRPC_PORT = process.env.SOLO_NODE_GRPC_PORT || '50211'
export const HEDERA_NODE_GRPCS_PORT = process.env.SOLO_NODE_GRPCS_PORT || '50212'
export const HEDERA_NODE_DEFAULT_STAKE_AMOUNT = process.env.SOLO_NODE_DEFAULT_STAKE_AMOUNT || 1

// --------------- Logging related constants ---------------------------------------------------------------------------
export const LOG_STATUS_PROGRESS = chalk.cyan('>>')
export const LOG_STATUS_DONE = chalk.green('OK')
export const LOG_GROUP_DIVIDER = chalk.yellow('----------------------------------------------------------------------------')

// --------------- Charts related constants ----------------------------------------------------------------------------
export const FULLSTACK_SETUP_NAMESPACE = 'fullstack-setup'
export const FULLSTACK_TESTING_CHART_URL = 'https://hashgraph.github.io/full-stack-testing/charts'
export const FULLSTACK_TESTING_CHART = 'full-stack-testing'
export const FULLSTACK_CLUSTER_SETUP_CHART = 'fullstack-cluster-setup'
export const FULLSTACK_DEPLOYMENT_CHART = 'fullstack-deployment'
export const JSON_RPC_RELAY_CHART_URL = 'https://hashgraph.github.io/hedera-json-rpc-relay/charts'
export const JSON_RPC_RELAY_CHART = 'hedera-json-rpc-relay'
export const MIRROR_NODE_CHART_URL = 'https://hashgraph.github.io/hedera-mirror-node/charts'
export const MIRROR_NODE_CHART = 'hedera-mirror'
export const DEFAULT_CHART_REPO = new Map()
  .set(FULLSTACK_TESTING_CHART, FULLSTACK_TESTING_CHART_URL)
  .set(JSON_RPC_RELAY_CHART, JSON_RPC_RELAY_CHART_URL)
  .set(MIRROR_NODE_CHART, MIRROR_NODE_CHART_URL)

// ------------------- Hedera Account related ---------------------------------------------------------------------------------
export const OPERATOR_ID = process.env.SOLO_OPERATOR_ID || '0.0.2'
export const OPERATOR_KEY = process.env.SOLO_OPERATOR_KEY || '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137'
export const OPERATOR_PUBLIC_KEY = process.env.SOLO_OPERATOR_PUBLIC_KEY || '302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92'
export const TREASURY_ACCOUNT_ID = `${HEDERA_NODE_ACCOUNT_ID_START.realm}.${HEDERA_NODE_ACCOUNT_ID_START.shard}.2`
export const GENESIS_KEY = process.env.GENESIS_KEY || '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137'
export const SYSTEM_ACCOUNTS = [[3, 100], [200, 349], [400, 750], [900, 1000]] // do account 0.0.2 last and outside the loop
export const TREASURY_ACCOUNT = 2
export const LOCAL_NODE_START_PORT = process.env.LOCAL_NODE_START_PORT || 30212
export const LOCAL_NODE_PROXY_START_PORT = process.env.LOCAL_NODE_PROXY_START_PORT || 30313
export const ACCOUNT_CREATE_BATCH_SIZE = process.env.ACCOUNT_CREATE_BATCH_SIZE || 50
export const NODE_PROXY_USER_ID = process.env.NODE_PROXY_USER_ID || 'admin'
export const NODE_PROXY_PASSWORD = process.env.NODE_PROXY_PASSWORD || 'adminpwd'

export const POD_PHASE_RUNNING = 'Running'

export const POD_CONDITION_INITIALIZED = 'Initialized'
export const POD_CONDITION_READY = 'Ready'
export const POD_CONDITION_CONTAINERS_READY = 'ContainersReady'

export const POD_CONDITION_POD_SCHEDULED = 'PodScheduled'
export const POD_CONDITION_STATUS_TRUE = 'True'
export const POD_CONDITION_STATUS_FALSE = 'False'

// Listr related
export const LISTR_DEFAULT_RENDERER_TIMER_OPTION = {
  ...PRESET_TIMER,
  condition: (duration) => duration > 100,
  format: (duration) => {
    if (duration > 30000) {
      return color.red
    }

    return color.green
  }
}

export const LISTR_DEFAULT_RENDERER_OPTION = {
  collapseSubtasks: false,
  timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION
}

export const KEY_FORMAT_PEM = 'pem'

export const KEY_FORMAT_PFX = 'pfx'
export const KEY_TYPE_GOSSIP = 'gossip'
export const KEY_TYPE_TLS = 'tls'
export const SIGNING_KEY_PREFIX = 's'
export const AGREEMENT_KEY_PREFIX = 'a'
export const ENCRYPTION_KEY_PREFIX = 'e'
export const CERTIFICATE_VALIDITY_YEARS = 100 // years

export const PUBLIC_PFX = 'public.pfx'

export const OS_WINDOWS = 'windows'
export const OS_WIN32 = 'win32'
export const OS_DARWIN = 'darwin'
export const OS_MAC = 'mac'
export const OS_LINUX = 'linux'

export const LOCAL_HOST = '127.0.0.1'

export const PROFILE_LARGE = 'large'
export const PROFILE_MEDIUM = 'medium'
export const PROFILE_SMALL = 'small'
export const PROFILE_TINY = 'tiny'
export const PROFILE_LOCAL = 'local'

export const ALL_PROFILES = [PROFILE_LOCAL, PROFILE_TINY, PROFILE_SMALL, PROFILE_MEDIUM, PROFILE_LARGE]
export const DEFAULT_PROFILE_FILE = `${SOLO_CACHE_DIR}/profiles/custom-spec.yaml`

// a function generate map between the nodeId and their account ids
export function getNodeAccountMap (nodeIDs) {
  const accountMap = new Map()
  const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
  const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
  let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num

  nodeIDs.forEach(nodeID => {
    const nodeAccount = `${realm}.${shard}.${accountId++}`
    accountMap.set(nodeID, nodeAccount)
  })
  return accountMap
}
