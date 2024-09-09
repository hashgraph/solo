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
'use strict'
import { constants } from '../core/index.mjs'
import * as core from '../core/index.mjs'
import * as version from '../../version.mjs'
import path from 'path'

/**
 * @typedef {Object} CommandFlag
 * @property {string} constName - the name of this constant
 * @property {string} name - flag name to use on the command line
 * @property {Definition} definition - flag definition
 */

/**
 * @typedef {Object} Definition
 * @property {string} describe - description of the flag
 * @property {(boolean | string | number)} [defaultValue] - default value of the flag
 * @property {string} [alias] - alias of the flag
 * @property {string} [type] - type of the flag
 * @property {boolean} [disablePrompt] - disable prompt for the flag
 */

/**
 * Set flag from the flag option
 * @param y an instance of yargs
 * @param commandFlags a set of command flags
 *
 */
export function setCommandFlags (y, ...commandFlags) {
  commandFlags.forEach(flag => {
    y.option(flag.name, flag.definition)
  })
}

/** @type {CommandFlag} **/
export const devMode = {
  constName: 'devMode',
  name: 'dev',
  definition: {
    describe: 'Enable developer mode',
    defaultValue: false,
    type: 'boolean'
  }
}

// list of common flags across commands. command specific flags are defined in the command's module.
/** @type {CommandFlag} **/
export const clusterName = {
  constName: 'clusterName',
  name: 'cluster-name',
  definition: {
    describe: 'Cluster name',
    defaultValue: '',
    alias: 'c',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const clusterSetupNamespace = {
  constName: 'clusterSetupNamespace',
  name: 'cluster-setup-namespace',
  definition: {
    describe: 'Cluster Setup Namespace',
    defaultValue: constants.FULLSTACK_SETUP_NAMESPACE,
    alias: 's',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const namespace = {
  constName: 'namespace',
  name: 'namespace',
  definition: {
    describe: 'Namespace',
    alias: 'n',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const deployMirrorNode = {
  constName: 'deployMirrorNode',
  name: 'mirror-node',
  definition: {
    describe: 'Deploy mirror node',
    defaultValue: true,
    alias: 'm',
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const deployHederaExplorer = {
  constName: 'deployHederaExplorer',
  name: 'hedera-explorer',
  definition: {
    describe: 'Deploy hedera explorer',
    defaultValue: true,
    alias: 'x',
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const valuesFile = {
  constName: 'valuesFile',
  name: 'values-file',
  definition: {
    describe: 'Comma separated chart values files',
    defaultValue: '',
    alias: 'f',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const profileFile = {
  constName: 'profileFile',
  name: 'profile-file',
  definition: {
    describe: 'Resource profile definition (e.g. custom-spec.yaml)',
    defaultValue: constants.DEFAULT_PROFILE_FILE,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const profileName = {
  constName: 'profileName',
  name: 'profile',
  definition: {
    describe: `Resource profile (${constants.ALL_PROFILES.join(' | ')})`,
    defaultValue: constants.PROFILE_LOCAL,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const deployPrometheusStack = {
  constName: 'deployPrometheusStack',
  name: 'prometheus-stack',
  definition: {
    describe: 'Deploy prometheus stack',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const enablePrometheusSvcMonitor = {
  constName: 'enablePrometheusSvcMonitor',
  name: 'prometheus-svc-monitor',
  definition: {
    describe: 'Enable prometheus service monitor for the network nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const deployMinio = {
  constName: 'deployMinio',
  name: 'minio',
  definition: {
    describe: 'Deploy minio operator',
    defaultValue: true,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const deployCertManager = {
  constName: 'deployCertManager',
  name: 'cert-manager',
  definition: {
    describe: 'Deploy cert manager, also deploys acme-cluster-issuer',
    defaultValue: false,
    type: 'boolean'
  }
}

/*
    Deploy cert manager CRDs separately from cert manager itself.  Cert manager
    CRDs are required for cert manager to deploy successfully.
 */
/** @type {CommandFlag} **/
export const deployCertManagerCrds = {
  constName: 'deployCertManagerCrds',
  name: 'cert-manager-crds',
  definition: {
    describe: 'Deploy cert manager CRDs',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const deployJsonRpcRelay = {
  constName: 'deployJsonRpcRelay',
  name: 'json-rpc-relay',
  definition: {
    describe: 'Deploy JSON RPC Relay',
    defaultValue: false,
    alias: 'j',
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const releaseTag = {
  constName: 'releaseTag',
  name: 'release-tag',
  definition: {
    describe: `Release tag to be used (e.g. ${version.HEDERA_PLATFORM_VERSION})`,
    alias: 't',
    defaultValue: version.HEDERA_PLATFORM_VERSION,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const relayReleaseTag = {
  constName: 'relayReleaseTag',
  name: 'relay-release',
  definition: {
    describe: 'Relay release tag to be used (e.g. v0.48.0)',
    defaultValue: 'v0.53.0',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const cacheDir = {
  constName: 'cacheDir',
  name: 'cache-dir',
  definition: {
    describe: 'Local cache directory',
    defaultValue: core.constants.SOLO_CACHE_DIR,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const nodeIDs = {
  constName: 'nodeIDs',
  name: 'node-ids',
  definition: {
    describe: 'Comma separated node IDs (empty means all nodes)',
    alias: 'i',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const force = {
  constName: 'force',
  name: 'force',
  definition: {
    describe: 'Force actions even if those can be skipped',
    defaultValue: false,
    alias: 'f',
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const chartDirectory = {
  constName: 'chartDirectory',
  name: 'chart-dir',
  definition: {
    describe: 'Local chart directory path (e.g. ~/full-stack-testing/charts',
    defaultValue: '',
    alias: 'd',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const replicaCount = {
  constName: 'replicaCount',
  name: 'replica-count',
  definition: {
    describe: 'Replica count',
    defaultValue: 1,
    alias: '',
    type: 'number'
  }
}

/** @type {CommandFlag} **/
export const chainId = {
  constName: 'chainId',
  name: 'ledger-id',
  definition: {
    describe: 'Ledger ID (a.k.a. Chain ID)',
    defaultValue: constants.HEDERA_CHAIN_ID, // Ref: https://github.com/hashgraph/hedera-json-rpc-relay#configuration
    alias: 'l',
    type: 'string'
  }
}

// Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
/** @type {CommandFlag} **/
export const operatorId = {
  constName: 'operatorId',
  name: 'operator-id',
  definition: {
    describe: 'Operator ID',
    defaultValue: constants.OPERATOR_ID,
    type: 'string'
  }
}

// Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
/** @type {CommandFlag} **/
export const operatorKey = {
  constName: 'operatorKey',
  name: 'operator-key',
  definition: {
    describe: 'Operator Key',
    defaultValue: constants.OPERATOR_KEY,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const generateGossipKeys = {
  constName: 'generateGossipKeys',
  name: 'gossip-keys',
  definition: {
    describe: 'Generate gossip keys for nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const generateTlsKeys = {
  constName: 'generateTlsKeys',
  name: 'tls-keys',
  definition: {
    describe: 'Generate gRPC TLS keys for nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const tlsClusterIssuerType = {
  constName: 'tlsClusterIssuerType',
  name: 'tls-cluster-issuer-type',
  definition: {
    describe: 'The TLS cluster issuer type to use for hedera explorer, defaults to "self-signed", the available options are: "acme-staging", "acme-prod", or "self-signed"',
    defaultValue: 'self-signed',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const enableHederaExplorerTls = {
  constName: 'enableHederaExplorerTls',
  name: 'enable-hedera-explorer-tls',
  definition: {
    describe: 'Enable the Hedera Explorer TLS, defaults to false',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const hederaExplorerTlsLoadBalancerIp = {
  constName: 'hederaExplorerTlsLoadBalancerIp',
  name: 'hedera-explorer-tls-load-balancer-ip',
  definition: {
    describe: 'The static IP address to use for the Hedera Explorer TLS load balancer, defaults to ""',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const hederaExplorerTlsHostName = {
  constName: 'hederaExplorerTlsHostName',
  name: 'hedera-explorer-tls-host-name',
  definition: {
    describe: 'The host name to use for the Hedera Explorer TLS, defaults to "explorer.fst.local"',
    defaultValue: 'explorer.fst.local',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const deletePvcs = {
  constName: 'deletePvcs',
  name: 'delete-pvcs',
  definition: {
    describe: 'Delete the persistent volume claims',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const deleteSecrets = {
  constName: 'deleteSecrets',
  name: 'delete-secrets',
  definition: {
    describe: 'Delete the network secrets',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const fstChartVersion = {
  constName: 'fstChartVersion',
  name: 'fst-chart-version',
  definition: {
    describe: 'Fullstack testing chart version',
    defaultValue: version.FST_CHART_VERSION,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const applicationProperties = {
  constName: 'applicationProperties',
  name: 'application-properties',
  definition: {
    describe: 'application.properties file for node',
    defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'application.properties'),
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const applicationEnv = {
  constName: 'applicationEnv',
  name: 'application-env',
  definition: {
    describe: 'application.env file for node',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const apiPermissionProperties = {
  constName: 'apiPermissionProperties',
  name: 'api-permission-properties',
  definition: {
    describe: 'api-permission.properties file for node',
    defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'api-permission.properties'),
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const bootstrapProperties = {
  constName: 'bootstrapProperties',
  name: 'bootstrap-properties',
  definition: {
    describe: 'bootstrap.properties file for node',
    defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'bootstrap.properties'),
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const settingTxt = {
  constName: 'settingTxt',
  name: 'settings-txt',
  definition: {
    describe: 'settings.txt file for node',
    defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'settings.txt'),
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const app = {
  constName: 'app',
  name: 'app',
  definition: {
    describe: 'Testing app name',
    defaultValue: constants.HEDERA_APP_NAME,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const appConfig = {
  constName: 'appConfig',
  name: 'app-config',
  definition: {
    describe: 'json config file of testing app',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const localBuildPath = {
  constName: 'localBuildPath',
  name: 'local-build-path',
  definition: {
    describe: 'path of hedera local repo',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const newAccountNumber = {
  constName: 'newAccountNumber',
  name: 'new-account-number',
  definition: {
    describe: 'new account number for node update transaction',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const newAdminKey = {
  constName: 'newAdminKey',
  name: 'new-admin-key',
  definition: {
    describe: 'new admin key for the Hedera account',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const gossipPublicKey = {
  constName: 'gossipPublicKey',
  name: 'gossip-public-key',
  definition: {
    describe: 'path and file name of the public key for signing gossip in PEM key format to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const gossipPrivateKey = {
  constName: 'gossipPrivateKey',
  name: 'gossip-private-key',
  definition: {
    describe: 'path and file name of the private key for signing gossip in PEM key format to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const agreementPublicKey = {
  constName: 'agreementPublicKey',
  name: 'agreement-public-key',
  definition: {
    describe: 'path and file name of the public key for agreement in PEM key format to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const agreementPrivateKey = {
  constName: 'agreementPrivateKey',
  name: 'agreement-private-key',
  definition: {
    describe: 'path and file name of the private key for agreement in PEM key format to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const tlsPublicKey = {
  constName: 'tlsPublicKey',
  name: 'tls-public-key',
  definition: {
    describe: 'path and file name of the public TLS key to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const tlsPrivateKey = {
  constName: 'tlsPrivateKey',
  name: 'tls-private-key',
  definition: {
    describe: 'path and file name of the private TLS key to be used',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const log4j2Xml = {
  constName: 'log4j2Xml',
  name: 'log4j2-xml',
  definition: {
    describe: 'log4j2.xml file for node',
    defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'log4j2.xml'),
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const updateAccountKeys = {
  constName: 'updateAccountKeys',
  name: 'update-account-keys',
  definition: {
    describe: 'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
    defaultValue: true,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const privateKey = {
  constName: 'privateKey',
  name: 'private-key',
  definition: {
    describe: 'ED25519 private key for the Hedera account',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const ecdsaPrivateKey = {
  constName: 'ecdsaPrivateKey',
  name: 'ecdsa-private-key',
  definition: {
    describe: 'ECDSA private key for the Hedera account',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const setAlias = {
  constName: 'setAlias',
  name: 'set-alias',
  definition: {
    describe: 'Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const accountId = {
  constName: 'accountId',
  name: 'account-id',
  definition: {
    describe: 'The Hedera account id, e.g.: 0.0.1001',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const amount = {
  constName: 'amount',
  name: 'hbar-amount',
  definition: {
    describe: 'Amount of HBAR to add',
    defaultValue: 100,
    type: 'number'
  }
}

/** @type {CommandFlag} **/
export const nodeID = {
  constName: 'nodeId',
  name: 'node-id',
  definition: {
    describe: 'Node id (e.g. node99)',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const gossipEndpoints = {
  constName: 'gossipEndpoints',
  name: 'gossip-endpoints',
  definition: {
    describe: 'Comma separated gossip endpoints of the node(e.g. first one is internal, second one is external)',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const grpcEndpoints = {
  constName: 'grpcEndpoints',
  name: 'grpc-endpoints',
  definition: {
    describe: 'Comma separated gRPC endpoints of the node (at most 8)',
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const endpointType = {
  constName: 'endpointType',
  name: 'endpoint-type',
  definition: {
    describe: 'Endpoint type (IP or FQDN)',
    defaultValue: constants.ENDPOINT_TYPE_FQDN,
    type: 'string'
  }
}

/** @type {CommandFlag} **/
export const persistentVolumeClaims = {
  constName: 'persistentVolumeClaims',
  name: 'pvcs',
  definition: {
    describe: 'Enable persistent volume claims to store data outside the pod, required for node add',
    defaultValue: false,
    type: 'boolean'
  }
}

/** @type {CommandFlag} **/
export const debugNodeId = {
  constName: 'debugNodeId',
  name: 'debug-nodeid',
  definition: {
    describe: 'Enable default jvm debug port (5005) for the given node id',
    defaultValue: '',
    type: 'string'
  }
}

/** @type {CommandFlag[]} **/
export const allFlags = [
  accountId,
  agreementPrivateKey,
  agreementPublicKey,
  amount,
  apiPermissionProperties,
  app,
  appConfig,
  applicationEnv,
  applicationProperties,
  bootstrapProperties,
  cacheDir,
  chainId,
  chartDirectory,
  clusterName,
  clusterSetupNamespace,
  deletePvcs,
  deleteSecrets,
  deployCertManager,
  deployCertManagerCrds,
  deployHederaExplorer,
  deployJsonRpcRelay,
  deployMinio,
  deployMirrorNode,
  deployPrometheusStack,
  devMode,
  ecdsaPrivateKey,
  enableHederaExplorerTls,
  enablePrometheusSvcMonitor,
  endpointType,
  fstChartVersion,
  generateGossipKeys,
  generateTlsKeys,
  gossipEndpoints,
  gossipPrivateKey,
  gossipPublicKey,
  grpcEndpoints,
  hederaExplorerTlsHostName,
  hederaExplorerTlsLoadBalancerIp,
  debugNodeId,
  localBuildPath,
  log4j2Xml,
  namespace,
  newAccountNumber,
  newAdminKey,
  nodeID,
  nodeIDs,
  operatorId,
  operatorKey,
  persistentVolumeClaims,
  privateKey,
  profileFile,
  profileName,
  relayReleaseTag,
  releaseTag,
  replicaCount,
  setAlias,
  settingTxt,
  tlsClusterIssuerType,
  tlsPrivateKey,
  tlsPublicKey,
  updateAccountKeys,
  valuesFile
]

/**
 * Resets the definition.disablePrompt for all flags
 */
export function resetDisabledPrompts () {
  allFlags.forEach(f => {
    if (f.definition.disablePrompt) {
      delete f.definition.disablePrompt
    }
  })
}

export const allFlagsMap = new Map(allFlags.map(f => [f.name, f]))

export const nodeConfigFileFlags = new Map([
  apiPermissionProperties,
  applicationProperties,
  bootstrapProperties,
  log4j2Xml,
  settingTxt
].map(f => [f.name, f]))

export const integerFlags = new Map([replicaCount].map(f => [f.name, f]))
