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
import { constants } from '../core/index.mjs'
import * as core from '../core/index.mjs'
import * as helpers from '../core/helpers.mjs'

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

export const devMode = {
  name: 'dev',
  definition: {
    describe: 'Enable developer mode',
    defaultValue: false,
    type: 'boolean'
  }
}

// list of common flags across commands. command specific flags are defined in the command's module.
export const clusterName = {
  name: 'cluster-name',
  definition: {
    describe: 'Cluster name',
    defaultValue: '',
    alias: 'c',
    type: 'string'
  }
}

export const clusterSetupNamespace = {
  name: 'cluster-setup-namespace',
  definition: {
    describe: 'Cluster Setup Namespace',
    alias: 's',
    type: 'string'
  }
}

export const namespace = {
  name: 'namespace',
  definition: {
    describe: 'Namespace',
    alias: 'n',
    type: 'string'
  }
}

export const deployMirrorNode = {
  name: 'mirror-node',
  definition: {
    describe: 'Deploy mirror node',
    defaultValue: true,
    alias: 'm',
    type: 'boolean'
  }
}

export const deployHederaExplorer = {
  name: 'hedera-explorer',
  definition: {
    describe: 'Deploy hedera explorer',
    defaultValue: true,
    alias: 'x',
    type: 'boolean'
  }
}

export const valuesFile = {
  name: 'values-file',
  definition: {
    describe: 'Comma separated chart values files',
    defaultValue: '',
    alias: 'f',
    type: 'string'
  }
}

export const deployPrometheusStack = {
  name: 'prometheus-stack',
  definition: {
    describe: 'Deploy prometheus stack',
    defaultValue: false,
    type: 'boolean'
  }
}

export const enablePrometheusSvcMonitor = {
  name: 'enable-prometheus-svc-monitor',
  definition: {
    describe: 'Enable prometheus service monitor for the network nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

export const deployMinio = {
  name: 'minio',
  definition: {
    describe: 'Deploy minio operator',
    defaultValue: true,
    type: 'boolean'
  }
}

export const deployCertManager = {
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
export const deployCertManagerCrds = {
  name: 'cert-manager-crds',
  definition: {
    describe: 'Deploy cert manager CRDs',
    defaultValue: false,
    type: 'boolean'
  }
}

export const deployJsonRpcRelay = {
  name: 'json-rpc-relay',
  definition: {
    describe: 'Deploy JSON RPC Relay',
    defaultValue: false,
    alias: 'j',
    type: 'boolean'
  }
}

export const releaseTag = {
  name: 'release-tag',
  definition: {
    describe: 'Release tag to be used (e.g. v0.42.5)',
    alias: 't',
    type: 'string'
  }
}

export const relayReleaseTag = {
  name: 'relay-release',
  definition: {
    describe: 'Relay release tag to be used (e.g. v0.39.1)',
    defaultValue: '',
    type: 'string'
  }
}

export const cacheDir = {
  name: 'cache-dir',
  definition: {
    describe: 'Local cache directory',
    defaultValue: core.constants.SOLO_CACHE_DIR,
    type: 'string'
  }
}

export const nodeIDs = {
  name: 'node-ids',
  definition: {
    describe: 'Comma separated node IDs (empty means all nodes)',
    alias: 'i',
    type: 'string'
  }
}

export const force = {
  name: 'force',
  definition: {
    describe: 'Force actions even if those can be skipped',
    defaultValue: false,
    alias: 'f',
    type: 'boolean'
  }
}

export const chartDirectory = {
  name: 'chart-dir',
  definition: {
    describe: 'Local chart directory path (e.g. ~/full-stack-testing/charts',
    defaultValue: '',
    alias: 'd',
    type: 'string'
  }
}

export const replicaCount = {
  name: 'replica-count',
  definition: {
    describe: 'Replica count',
    defaultValue: 1,
    alias: '',
    type: 'number'
  }
}

export const chainId = {
  name: 'ledger-id',
  definition: {
    describe: 'Ledger ID (a.k.a. Chain ID)',
    defaultValue: '298', // Ref: https://github.com/hashgraph/hedera-json-rpc-relay#configuration
    alias: 'l',
    type: 'string'
  }
}

// Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
export const operatorId = {
  name: 'operator-id',
  definition: {
    describe: 'Operator ID',
    defaultValue: constants.OPERATOR_ID,
    type: 'string'
  }
}

// Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
export const operatorKey = {
  name: 'operator-key',
  definition: {
    describe: 'Operator Key',
    defaultValue: constants.OPERATOR_KEY,
    type: 'string'
  }
}

export const generateGossipKeys = {
  name: 'gossip-keys',
  definition: {
    describe: 'Generate gossip keys for nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

export const generateTlsKeys = {
  name: 'tls-keys',
  definition: {
    describe: 'Generate gRPC TLS keys for nodes',
    defaultValue: false,
    type: 'boolean'
  }
}

export const keyFormat = {
  name: 'key-format',
  definition: {
    describe: 'Public and Private key file format (pem or pfx)',
    defaultValue: 'pfx',
    type: 'string'
  }
}

export const tlsClusterIssuerType = {
  name: 'tls-cluster-issuer-type',
  definition: {
    describe: 'The TLS cluster issuer type to use for hedera explorer, defaults to "self-signed", the available options are: "acme-staging", "acme-prod", or "self-signed"',
    defaultValue: 'self-signed',
    type: 'string'
  }
}

export const enableHederaExplorerTls = { // KEEP
  name: 'enable-hedera-explorer-tls',
  definition: {
    describe: 'Enable the Hedera Explorer TLS, defaults to false',
    defaultValue: false,
    type: 'boolean'
  }
}

export const hederaExplorerTlsLoadBalancerIp = {
  name: 'hedera-explorer-tls-load-balancer-ip',
  definition: {
    describe: 'The static IP address to use for the Hedera Explorer TLS load balancer, defaults to ""',
    defaultValue: '',
    type: 'string'
  }
}

export const hederaExplorerTlsHostName = {
  name: 'hedera-explorer-tls-host-name',
  definition: {
    describe: 'The host name to use for the Hedera Explorer TLS, defaults to "explorer.fst.local"',
    defaultValue: 'explorer.fst.local',
    type: 'string'
  }
}

export const deletePvcs = {
  name: 'delete-pvcs',
  definition: {
    describe: 'Delete the persistent volume claims',
    defaultValue: false,
    type: 'boolean'
  }
}

export const fstChartVersion = {
  name: 'fst-chart-version',
  definition: {
    describe: 'Fullstack testing chart version',
    defaultValue: helpers.packageVersion(),
    type: 'string'
  }
}

export const applicationProperties = {
  name: 'application-properties',
  definition: {
    describe: 'application.properties file for node',
    defaultValue: `${constants.SOLO_CACHE_DIR}/templates/application.properties`,
    type: 'string'
  }
}

export const apiPermissionProperties = {
  name: 'api-permission-properties',
  definition: {
    describe: 'api-permission.properties file for node',
    defaultValue: `${constants.SOLO_CACHE_DIR}/templates/api-permission.properties`,
    type: 'string'
  }
}

export const bootstrapProperties = {
  name: 'bootstrap-properties',
  definition: {
    describe: 'bootstrap.properties file for node',
    defaultValue: `${constants.SOLO_CACHE_DIR}/templates/bootstrap.properties`,
    type: 'string'
  }
}

export const settingTxt = {
  name: 'settings-txt',
  definition: {
    describe: 'settings.txt file for node',
    defaultValue: `${constants.SOLO_CACHE_DIR}/templates/settings.txt`,
    type: 'string'
  }
}

export const log4j2Xml = {
  name: 'log4j2-xml',
  definition: {
    describe: 'log4j2.xml file for node',
    defaultValue: `${constants.SOLO_CACHE_DIR}/templates/log4j2.xml`,
    type: 'string'
  }
}

export const updateAccountKeys = {
  name: 'update-account-keys',
  definition: {
    describe: 'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
    defaultValue: true,
    type: 'boolean'
  }
}

export const allFlags = [
  devMode,
  clusterName,
  clusterSetupNamespace,
  namespace,
  deployMirrorNode,
  deployHederaExplorer,
  deployJsonRpcRelay,
  valuesFile,
  deployPrometheusStack,
  enablePrometheusSvcMonitor,
  deployMinio,
  deployCertManager,
  deployCertManagerCrds,
  releaseTag,
  relayReleaseTag,
  cacheDir,
  nodeIDs,
  chartDirectory,
  replicaCount,
  chainId,
  operatorId,
  operatorKey,
  generateGossipKeys,
  generateTlsKeys,
  keyFormat,
  tlsClusterIssuerType,
  enableHederaExplorerTls,
  hederaExplorerTlsLoadBalancerIp,
  hederaExplorerTlsHostName,
  deletePvcs,
  fstChartVersion,
  applicationProperties,
  apiPermissionProperties,
  bootstrapProperties,
  settingTxt,
  log4j2Xml,
  updateAccountKeys
]

export const allFlagsMap = new Map(allFlags.map(f => [f.name, f]))
export const nodeConfigFileFlags = new Map([
  applicationProperties,
  apiPermissionProperties,
  bootstrapProperties,
  settingTxt,
  log4j2Xml
].map(f => [f.name, f]))

export const integerFlags = new Map([replicaCount].map(f => [f.name, f]))
