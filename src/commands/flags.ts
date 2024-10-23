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
import { constants } from '../core/index.ts'
import * as core from '../core/index.ts'
import * as version from '../../version.ts'
import path from 'path'
import { type CommandFlag } from '../types/index.ts'
import { type ListrTaskWrapper } from 'listr2'
import { Prompts } from './prompts.js'

/**
 * Set flag from the flag option
 * @param y instance of yargs
 * @param commandFlags a set of command flags
 *
 */
export function setCommandFlags (y: any, ...commandFlags: CommandFlag[]) {
  commandFlags.forEach(flag => {
    y.option(flag.name, flag.definition)
  })
}

export class Flags {
  static readonly devMode: CommandFlag = {
    constName: 'devMode',
    name: 'dev',
    definition: {
      describe: 'Enable developer mode',
      defaultValue: false,
      type: 'boolean'
    },
    prompt: undefined
  }

  static readonly clusterName: CommandFlag = {
    constName: 'clusterName',
    name: 'cluster-name',
    definition: {
      describe: 'Cluster name',
      alias: 'c',
      type: 'string'
    },
    prompt: async function promptClusterName (task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Prompts.promptText(task, input,
          undefined,
          'Enter cluster name: ',
          'cluster name cannot be empty',
          Flags.clusterName.name)
    }
  }

  static readonly clusterSetupNamespace: CommandFlag = {
    constName: 'clusterSetupNamespace',
    name: 'cluster-setup-namespace',
    definition: {
      describe: 'Cluster Setup Namespace',
      defaultValue: constants.SOLO_SETUP_NAMESPACE,
      alias: 's',
      type: 'string'
    },
    prompt: async function promptClusterSetupNamespace (task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Prompts.promptText(task, input,
          'solo-cluster',
          'Enter cluster setup namespace name: ',
          'cluster setup namespace cannot be empty',
          Flags.clusterSetupNamespace.name)
    }
  }

  static readonly namespace: CommandFlag = {
    constName: 'namespace',
    name: 'namespace',
    definition: {
      describe: 'Namespace',
      alias: 'n',
      type: 'string'
    },
    prompt: async function promptNamespace (task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Prompts.promptText(task, input,
          'solo',
          'Enter namespace name: ',
          'namespace cannot be empty',
          Flags.namespace.name)
    }
  }

  static readonly deployHederaExplorer: CommandFlag = {
    constName: 'deployHederaExplorer',
    name: 'hedera-explorer',
    definition: {
      describe: 'Deploy hedera explorer',
      defaultValue: true,
      alias: 'x',
      type: 'boolean'
    }
  }

  static readonly valuesFile: CommandFlag = {
    constName: 'valuesFile',
    name: 'values-file',
    definition: {
      describe: 'Comma separated chart values files',
      defaultValue: '',
      alias: 'f',
      type: 'string'
    }
  }

  static readonly profileFile: CommandFlag = {
    constName: 'profileFile',
    name: 'profile-file',
    definition: {
      describe: 'Resource profile definition (e.g. custom-spec.yaml)',
      defaultValue: constants.DEFAULT_PROFILE_FILE,
      type: 'string'
    }
  }

  static readonly profileName: CommandFlag = {
    constName: 'profileName',
    name: 'profile',
    definition: {
      describe: `Resource profile (${constants.ALL_PROFILES.join(' | ')})`,
      defaultValue: constants.PROFILE_LOCAL,
      type: 'string'
    }
  }

  static readonly deployPrometheusStack: CommandFlag = {
    constName: 'deployPrometheusStack',
    name: 'prometheus-stack',
    definition: {
      describe: 'Deploy prometheus stack',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly enablePrometheusSvcMonitor: CommandFlag = {
    constName: 'enablePrometheusSvcMonitor',
    name: 'prometheus-svc-monitor',
    definition: {
      describe: 'Enable prometheus service monitor for the network nodes',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly deployMinio: CommandFlag = {
    constName: 'deployMinio',
    name: 'minio',
    definition: {
      describe: 'Deploy minio operator',
      defaultValue: true,
      type: 'boolean'
    }
  }

  static readonly deployCertManager: CommandFlag = {
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
  static readonly deployCertManagerCrds: CommandFlag = {
    constName: 'deployCertManagerCrds',
    name: 'cert-manager-crds',
    definition: {
      describe: 'Deploy cert manager CRDs',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly deployJsonRpcRelay: CommandFlag = {
    constName: 'deployJsonRpcRelay',
    name: 'json-rpc-relay',
    definition: {
      describe: 'Deploy JSON RPC Relay',
      defaultValue: false,
      alias: 'j',
      type: 'boolean'
    }
  }

  static readonly releaseTag: CommandFlag = {
    constName: 'releaseTag',
    name: 'release-tag',
    definition: {
      describe: `Release tag to be used (e.g. ${version.HEDERA_PLATFORM_VERSION})`,
      alias: 't',
      defaultValue: version.HEDERA_PLATFORM_VERSION,
      type: 'string'
    }
  }

  static readonly relayReleaseTag: CommandFlag = {
    constName: 'relayReleaseTag',
    name: 'relay-release',
    definition: {
      describe: 'Relay release tag to be used (e.g. v0.48.0)',
      defaultValue: 'v0.53.0',
      type: 'string'
    }
  }

  static readonly cacheDir: CommandFlag = {
    constName: 'cacheDir',
    name: 'cache-dir',
    definition: {
      describe: 'Local cache directory',
      defaultValue: core.constants.SOLO_CACHE_DIR,
      type: 'string'
    }
  }

  static readonly nodeAliasesUnparsed: CommandFlag = {
    constName: 'nodeAliasesUnparsed',
    name: 'node-aliases-unparsed',
    definition: {
      describe: 'Comma separated node aliases (empty means all nodes)',
      alias: 'i',
      type: 'string'
    }
  }

  static readonly force: CommandFlag = {
    constName: 'force',
    name: 'force',
    definition: {
      describe: 'Force actions even if those can be skipped',
      defaultValue: false,
      alias: 'f',
      type: 'boolean'
    }
  }

  static readonly chartDirectory: CommandFlag = {
    constName: 'chartDirectory',
    name: 'chart-dir',
    definition: {
      describe: 'Local chart directory path (e.g. ~/solo-charts/charts',
      defaultValue: '',
      alias: 'd',
      type: 'string'
    }
  }

  static readonly replicaCount: CommandFlag = {
    constName: 'replicaCount',
    name: 'replica-count',
    definition: {
      describe: 'Replica count',
      defaultValue: 1,
      alias: '',
      type: 'number'
    }
  }

  static readonly chainId: CommandFlag = {
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
  static readonly operatorId: CommandFlag = {
    constName: 'operatorId',
    name: 'operator-id',
    definition: {
      describe: 'Operator ID',
      defaultValue: constants.OPERATOR_ID,
      type: 'string'
    }
  }

// Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
  static readonly operatorKey: CommandFlag = {
    constName: 'operatorKey',
    name: 'operator-key',
    definition: {
      describe: 'Operator Key',
      defaultValue: constants.OPERATOR_KEY,
      type: 'string'
    }
  }

  static readonly generateGossipKeys: CommandFlag = {
    constName: 'generateGossipKeys',
    name: 'gossip-keys',
    definition: {
      describe: 'Generate gossip keys for nodes',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly generateTlsKeys: CommandFlag = {
    constName: 'generateTlsKeys',
    name: 'tls-keys',
    definition: {
      describe: 'Generate gRPC TLS keys for nodes',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly tlsClusterIssuerType: CommandFlag = {
    constName: 'tlsClusterIssuerType',
    name: 'tls-cluster-issuer-type',
    definition: {
      describe: 'The TLS cluster issuer type to use for hedera explorer, defaults to "self-signed", the available options are: "acme-staging", "acme-prod", or "self-signed"',
      defaultValue: 'self-signed',
      type: 'string'
    }
  }

  static readonly enableHederaExplorerTls: CommandFlag = {
    constName: 'enableHederaExplorerTls',
    name: 'enable-hedera-explorer-tls',
    definition: {
      describe: 'Enable the Hedera Explorer TLS, defaults to false',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly hederaExplorerTlsLoadBalancerIp: CommandFlag = {
    constName: 'hederaExplorerTlsLoadBalancerIp',
    name: 'hedera-explorer-tls-load-balancer-ip',
    definition: {
      describe: 'The static IP address to use for the Hedera Explorer TLS load balancer, defaults to ""',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly hederaExplorerTlsHostName: CommandFlag = {
    constName: 'hederaExplorerTlsHostName',
    name: 'hedera-explorer-tls-host-name',
    definition: {
      describe: 'The host name to use for the Hedera Explorer TLS, defaults to "explorer.solo.local"',
      defaultValue: 'explorer.solo.local',
      type: 'string'
    }
  }

  static readonly deletePvcs: CommandFlag = {
    constName: 'deletePvcs',
    name: 'delete-pvcs',
    definition: {
      describe: 'Delete the persistent volume claims',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly deleteSecrets: CommandFlag = {
    constName: 'deleteSecrets',
    name: 'delete-secrets',
    definition: {
      describe: 'Delete the network secrets',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly soloChartVersion: CommandFlag = {
    constName: 'soloChartVersion',
    name: 'solo-chart-version',
    definition: {
      describe: 'Solo testing chart version',
      defaultValue: version.SOLO_CHART_VERSION,
      type: 'string'
    }
  }

  static readonly applicationProperties: CommandFlag = {
    constName: 'applicationProperties',
    name: 'application-properties',
    definition: {
      describe: 'application.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'application.properties'),
      type: 'string'
    }
  }

  static readonly applicationEnv: CommandFlag = {
    constName: 'applicationEnv',
    name: 'application-env',
    definition: {
      describe: 'application.env file for node',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly apiPermissionProperties: CommandFlag = {
    constName: 'apiPermissionProperties',
    name: 'api-permission-properties',
    definition: {
      describe: 'api-permission.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'api-permission.properties'),
      type: 'string'
    }
  }

  static readonly bootstrapProperties: CommandFlag = {
    constName: 'bootstrapProperties',
    name: 'bootstrap-properties',
    definition: {
      describe: 'bootstrap.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'bootstrap.properties'),
      type: 'string'
    }
  }

  static readonly settingTxt: CommandFlag = {
    constName: 'settingTxt',
    name: 'settings-txt',
    definition: {
      describe: 'settings.txt file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'settings.txt'),
      type: 'string'
    }
  }

  static readonly app: CommandFlag = {
    constName: 'app',
    name: 'app',
    definition: {
      describe: 'Testing app name',
      defaultValue: constants.HEDERA_APP_NAME,
      type: 'string'
    }
  }

  static readonly appConfig: CommandFlag = {
    constName: 'appConfig',
    name: 'app-config',
    definition: {
      describe: 'json config file of testing app',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly localBuildPath: CommandFlag = {
    constName: 'localBuildPath',
    name: 'local-build-path',
    definition: {
      describe: 'path of hedera local repo',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly newAccountNumber: CommandFlag = {
    constName: 'newAccountNumber',
    name: 'new-account-number',
    definition: {
      describe: 'new account number for node update transaction',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly newAdminKey: CommandFlag = {
    constName: 'newAdminKey',
    name: 'new-admin-key',
    definition: {
      describe: 'new admin key for the Hedera account',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly gossipPublicKey: CommandFlag = {
    constName: 'gossipPublicKey',
    name: 'gossip-public-key',
    definition: {
      describe: 'path and file name of the public key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly gossipPrivateKey: CommandFlag = {
    constName: 'gossipPrivateKey',
    name: 'gossip-private-key',
    definition: {
      describe: 'path and file name of the private key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly tlsPublicKey: CommandFlag = {
    constName: 'tlsPublicKey',
    name: 'tls-public-key',
    definition: {
      describe: 'path and file name of the public TLS key to be used',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly tlsPrivateKey: CommandFlag = {
    constName: 'tlsPrivateKey',
    name: 'tls-private-key',
    definition: {
      describe: 'path and file name of the private TLS key to be used',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly log4j2Xml: CommandFlag = {
    constName: 'log4j2Xml',
    name: 'log4j2-xml',
    definition: {
      describe: 'log4j2.xml file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'log4j2.xml'),
      type: 'string'
    }
  }

  static readonly updateAccountKeys: CommandFlag = {
    constName: 'updateAccountKeys',
    name: 'update-account-keys',
    definition: {
      describe: 'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
      defaultValue: true,
      type: 'boolean'
    }
  }

  static readonly privateKey: CommandFlag = {
    constName: 'privateKey',
    name: 'private-key',
    definition: {
      describe: 'ED25519 private key for the Hedera account',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly ecdsaPrivateKey: CommandFlag = {
    constName: 'ecdsaPrivateKey',
    name: 'ecdsa-private-key',
    definition: {
      describe: 'ECDSA private key for the Hedera account',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly setAlias: CommandFlag = {
    constName: 'setAlias',
    name: 'set-alias',
    definition: {
      describe: 'Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly accountId: CommandFlag = {
    constName: 'accountId',
    name: 'account-id',
    definition: {
      describe: 'The Hedera account id, e.g.: 0.0.1001',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly amount: CommandFlag = {
    constName: 'amount',
    name: 'hbar-amount',
    definition: {
      describe: 'Amount of HBAR to add',
      defaultValue: 100,
      type: 'number'
    }
  }

  static readonly nodeAlias: CommandFlag = {
    constName: 'nodeAlias',
    name: 'node-alias',
    definition: {
      describe: 'Node alias (e.g. node99)',
      type: 'string'
    }
  }

  static readonly gossipEndpoints: CommandFlag = {
    constName: 'gossipEndpoints',
    name: 'gossip-endpoints',
    definition: {
      describe: 'Comma separated gossip endpoints of the node(e.g. first one is internal, second one is external)',
      type: 'string'
    }
  }

  static readonly grpcEndpoints: CommandFlag = {
    constName: 'grpcEndpoints',
    name: 'grpc-endpoints',
    definition: {
      describe: 'Comma separated gRPC endpoints of the node (at most 8)',
      type: 'string'
    }
  }

  static readonly endpointType: CommandFlag = {
    constName: 'endpointType',
    name: 'endpoint-type',
    definition: {
      describe: 'Endpoint type (IP or FQDN)',
      defaultValue: constants.ENDPOINT_TYPE_FQDN,
      type: 'string'
    }
  }

  static readonly persistentVolumeClaims: CommandFlag = {
    constName: 'persistentVolumeClaims',
    name: 'pvcs',
    definition: {
      describe: 'Enable persistent volume claims to store data outside the pod, required for node add',
      defaultValue: false,
      type: 'boolean'
    }
  }

  static readonly debugNodeAlias: CommandFlag = {
    constName: 'debugNodeAlias',
    name: 'debug-node-alias',
    definition: {
      describe: 'Enable default jvm debug port (5005) for the given node id',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly outputDir: CommandFlag = {
    constName: 'outputDir',
    name: 'output-dir',
    definition: {
      describe: 'Path to the directory where the command context will be saved to',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly inputDir: CommandFlag = {
    constName: 'inputDir',
    name: 'input-dir',
    definition: {
      describe: 'Path to the directory where the command context will be loaded from',
      defaultValue: '',
      type: 'string'
    }
  }

  static readonly adminKey: CommandFlag = {
    constName: 'adminKey',
    name: 'admin-key',
    definition: {
      describe: 'Admin key',
      defaultValue: constants.GENESIS_KEY,
      type: 'string'
    }
  }

  static readonly quiet: CommandFlag = {
    constName: 'quiet',
    name: 'quiet-mode',
    definition: {
      describe: 'Quiet mode, do not prompt for confirmation',
      defaultValue: false,
      alias: 'q',
      type: 'boolean',
      disablePrompt: true
    }
  }

  static readonly mirrorNodeVersion: CommandFlag = {
    constName: 'mirrorNodeVersion',
    name: 'mirror-node-version',
    definition: {
      describe: 'Mirror node chart version',
      defaultValue: '',
      type: 'string'
    }
  }

}


export const allFlags: CommandFlag[] = [
  accountId,
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
  deployPrometheusStack,
  devMode,
  ecdsaPrivateKey,
  enableHederaExplorerTls,
  enablePrometheusSvcMonitor,
  endpointType,
  soloChartVersion,
  generateGossipKeys,
  generateTlsKeys,
  gossipEndpoints,
  gossipPrivateKey,
  gossipPublicKey,
  grpcEndpoints,
  hederaExplorerTlsHostName,
  hederaExplorerTlsLoadBalancerIp,
  inputDir,
  debugNodeAlias,
  localBuildPath,
  log4j2Xml,
  namespace,
  newAccountNumber,
  newAdminKey,
  nodeAlias,
  nodeAliasesUnparsed,
  operatorId,
  operatorKey,
  outputDir,
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
  valuesFile,
  mirrorNodeVersion
]

/** Resets the definition.disablePrompt for all flags */
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

export const DEFAULT_FLAGS = {
  requiredFlags: [],
  requiredFlagsWithDisabledPrompt: [namespace, cacheDir, releaseTag],
  optionalFlags: [devMode]
}
