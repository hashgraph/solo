/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {FREEZE_ADMIN_ACCOUNT} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import * as constants from '../../core/constants.js';
import {PrivateKey} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors.js';
import * as helpers from '../../core/helpers.js';
import path from 'path';
import fs from 'fs';
import {validatePath} from '../../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import {Flags as flags} from '../flags.js';
import {type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {type NetworkNodeServices} from '../../core/network_node_services.js';
import {type NodeAddConfigClass} from './node_add_config.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type PodRef} from '../../core/kube/resources/pod/pod_ref.js';
import {type K8Factory} from '../../core/kube/k8_factory.js';
import {type NodeCommandHandlers} from './handlers.js';
import {type ConsensusNode} from '../../core/model/consensus_node.js';

export const PREPARE_UPGRADE_CONFIGS_NAME = 'prepareUpgradeConfig';
export const DOWNLOAD_GENERATED_FILES_CONFIGS_NAME = 'downloadGeneratedFilesConfig';
export const ADD_CONFIGS_NAME = 'addConfigs';
export const DELETE_CONFIGS_NAME = 'deleteConfigs';
export const UPDATE_CONFIGS_NAME = 'updateConfigs';
export const UPGRADE_CONFIGS_NAME = 'upgradeConfigs';
export const REFRESH_CONFIGS_NAME = 'refreshConfigs';
export const KEYS_CONFIGS_NAME = 'keyConfigs';
export const SETUP_CONFIGS_NAME = 'setupConfigs';
export const START_CONFIGS_NAME = 'startConfigs';

const initializeSetup = async (config: any, k8Factory: K8Factory) => {
  // compute other config parameters
  config.keysDir = path.join(validatePath(config.cacheDir), 'keys');
  config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
  config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys');

  if (!(await k8Factory.default().namespaces().has(config.namespace))) {
    throw new SoloError(`namespace ${config.namespace} does not exist`);
  }

  // prepare staging keys directory
  if (!fs.existsSync(config.stagingKeysDir)) {
    fs.mkdirSync(config.stagingKeysDir, {recursive: true});
  }

  // create cached keys dir if it does not exist yet
  if (!fs.existsSync(config.keysDir)) {
    fs.mkdirSync(config.keysDir);
  }
};

export const prepareUpgradeConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(PREPARE_UPGRADE_CONFIGS_NAME, argv.flags, [
    'nodeClient',
    'freezeAdminPrivateKey',
    'namespace',
  ]) as NodePrepareUpgradeConfigClass;

  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);

  await initializeSetup(config, this.k8Factory);
  config.nodeClient = await this.accountManager.loadNodeClient(config.namespace);

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  return config;
};

export const downloadGeneratedFilesConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(DOWNLOAD_GENERATED_FILES_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'existingNodeAliases',
    'serviceMap',
    'namespace',
  ]) as NodeDownloadGeneratedFilesConfigClass;

  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  config.existingNodeAliases = [];
  await initializeSetup(config, this.k8Factory);

  return config;
};

export const upgradeConfigBuilder = async function (argv, ctx, task, shouldLoadNodeClient = true) {
  const config = this.getConfig(UPGRADE_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'existingNodeAliases',
    'keysDir',
    'nodeClient',
    'podRefs',
    'stagingDir',
    'stagingKeysDir',
    'namespace',
  ]) as NodeUpgradeConfigClass;

  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  config.curDate = new Date();
  config.existingNodeAliases = [];
  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

  await initializeSetup(config, this.k8Factory);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );
  if (shouldLoadNodeClient) {
    ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);
  }

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;
  return config;
};

export const updateConfigBuilder = async function (argv, ctx, task, shouldLoadNodeClient = true) {
  const config = this.getConfig(UPDATE_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'nodeClient',
    'podRefs',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
    'namespace',
  ]) as NodeUpdateConfigClass;

  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  config.curDate = new Date();
  config.existingNodeAliases = [];

  await initializeSetup(config, this.k8Factory);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  if (shouldLoadNodeClient) {
    ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);
  }

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  return config;
};

export const deleteConfigBuilder = async function (argv, ctx, task, shouldLoadNodeClient = true) {
  const config = this.getConfig(DELETE_CONFIGS_NAME, argv.flags, [
    'adminKey',
    'allNodeAliases',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'nodeClient',
    'podRefs',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
    'namespace',
  ]) as NodeDeleteConfigClass;

  config.curDate = new Date();
  config.existingNodeAliases = [];
  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);

  await initializeSetup(config, this.k8Factory);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  if (shouldLoadNodeClient) {
    ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);
  }

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  return config;
};

export const addConfigBuilder = async function (argv, ctx, task, shouldLoadNodeClient = true) {
  const config = this.getConfig(ADD_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'chartPath',
    'curDate',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'lastStateZipPath',
    'nodeClient',
    'podRefs',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
    'namespace',
  ]) as NodeAddConfigClass;

  ctx.adminKey = argv[flags.adminKey.name]
    ? PrivateKey.fromStringED25519(argv[flags.adminKey.name])
    : PrivateKey.fromStringED25519(constants.GENESIS_KEY);

  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  config.curDate = new Date();
  config.existingNodeAliases = [];

  await initializeSetup(config, this.k8Factory);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  if (shouldLoadNodeClient) {
    ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);
  }

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace);

  return config;
};

export const logsConfigBuilder = async function (argv, ctx, task) {
  const config = {
    namespace: await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
    deployment: this.configManager.getFlag(flags.deployment),
  } as NodeLogsConfigClass;
  ctx.config = config;
  return config;
};

export const statesConfigBuilder = async function (argv, ctx, task) {
  const config = {
    namespace: await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
    deployment: this.configManager.getFlag(flags.deployment),
  };
  ctx.config = config;
  return config;
};

export const refreshConfigBuilder = async function (argv, ctx, task) {
  ctx.config = this.getConfig(REFRESH_CONFIGS_NAME, argv.flags, [
    'nodeAliases',
    'podRefs',
    'namespace',
  ]) as NodeRefreshConfigClass;

  ctx.config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);

  await initializeSetup(ctx.config, this.k8Factory);

  return ctx.config;
};

export const keysConfigBuilder = function (argv, ctx, task) {
  const config = this.getConfig(KEYS_CONFIGS_NAME, argv.flags, [
    'curDate',
    'keysDir',
    'nodeAliases',
  ]) as NodeKeysConfigClass;

  config.curDate = new Date();
  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);
  config.keysDir = path.join(this.configManager.getFlag(flags.cacheDir), 'keys');

  if (!fs.existsSync(config.keysDir)) {
    fs.mkdirSync(config.keysDir);
  }
  return config;
};

export const stopConfigBuilder = async function (argv, ctx, task) {
  ctx.config = {
    namespace: await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
    deployment: this.configManager.getFlag(flags.deployment),
  };

  if (!(await this.k8Factory.default().namespaces().has(ctx.config.namespace))) {
    throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
  }

  return ctx.config;
};

export const startConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(START_CONFIGS_NAME, argv.flags, ['nodeAliases', 'namespace']) as NodeStartConfigClass;
  config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);

  if (!(await this.k8Factory.default().namespaces().has(config.namespace))) {
    throw new SoloError(`namespace ${config.namespace} does not exist`);
  }

  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

  return config;
};

export const setupConfigBuilder = async function (this: NodeCommandHandlers, argv, ctx, task) {
  ctx.config = this.getConfig(SETUP_CONFIGS_NAME, argv.flags, [
    'nodeAliases',
    'podRefs',
    'namespace',
  ]) as NodeSetupConfigClass;

  ctx.config.namespace = await resolveNamespaceFromDeployment(this.parent.localConfig, this.configManager, task);
  ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);
  ctx.config.consensusNodes = this.parent.getConsensusNodes();

  await initializeSetup(ctx.config, this.k8Factory);

  return ctx.config;
};

export interface NodeLogsConfigClass {
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: string[];
}

export interface NodeRefreshConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  releaseTag: string;
  nodeAliases: NodeAliases;
  podRefs: Record<NodeAlias, PodRef>;
  getUnusedConfigs: () => string[];
}

export interface NodeKeysConfigClass {
  cacheDir: string;
  devMode: boolean;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  nodeAliasesUnparsed: string;
  curDate: Date;
  keysDir: string;
  nodeAliases: NodeAliases;
  getUnusedConfigs: () => string[];
}

export interface NodeStartConfigClass {
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  podRefs: Record<NodeAlias, PodRef>;
  nodeAliasesUnparsed: string;
}

export interface NodeDeleteConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAlias: NodeAlias;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  nodeClient: any;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<string, NetworkNodeServices>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  getUnusedConfigs: () => string[];
  curDate: Date;
}

export interface NodeSetupConfigClass {
  app: string;
  appConfig: string;
  adminKey: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  releaseTag: string;
  nodeAliases: NodeAliases;
  podRefs: Record<NodeAlias, PodRef>;
  consensusNodes: ConsensusNode[];
  skipStop?: boolean;
  keysDir: string;
  stagingDir: string;
  getUnusedConfigs: () => string[];
}

export interface NodeUpgradeConfigClass {
  nodeAliasesUnparsed: string;
  nodeAliases: NodeAliases;
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  soloChartVersion: string;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: any;
  podRefs: Record<NodeAlias, PodRef>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  getUnusedConfigs: () => string[];
  curDate: Date;
}

export interface NodeUpdateConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  gossipEndpoints: string;
  gossipPrivateKey: string;
  gossipPublicKey: string;
  grpcEndpoints: string;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  newAccountNumber: string;
  newAdminKey: PrivateKey;
  nodeAlias: NodeAlias;
  releaseTag: string;
  tlsPrivateKey: string;
  tlsPublicKey: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: any;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<string, NetworkNodeServices>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  getUnusedConfigs: () => string[];
  curDate: Date;
}

interface NodePrepareUpgradeConfigClass {
  cacheDir: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  getUnusedConfigs: () => string[];
}

interface NodeDownloadGeneratedFilesConfigClass {
  cacheDir: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  getUnusedConfigs: () => string[];
  existingNodeAliases: NodeAliases[];
  allNodeAliases: NodeAliases[];
  serviceMap: Map<string, NetworkNodeServices>;
}
