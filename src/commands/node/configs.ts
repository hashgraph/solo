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
import {FREEZE_ADMIN_ACCOUNT} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import * as constants from '../../core/constants.js';
import {PrivateKey} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors.js';
import * as helpers from '../../core/helpers.js';
import path from 'path';
import fs from 'fs';
import {validatePath} from '../../core/helpers.js';
import {Flags as flags} from '../flags.js';
import type {NodeAlias, NodeAliases, PodName} from '../../types/aliases.js';
import type {NetworkNodeServices} from '../../core/network_node_services.js';

export const PREPARE_UPGRADE_CONFIGS_NAME = 'prepareUpgradeConfig';
export const DOWNLOAD_GENERATED_FILES_CONFIGS_NAME = 'downloadGeneratedFilesConfig';
export const ADD_CONFIGS_NAME = 'addConfigs';
export const DELETE_CONFIGS_NAME = 'deleteConfigs';
export const UPDATE_CONFIGS_NAME = 'updateConfigs';
export const REFRESH_CONFIGS_NAME = 'refreshConfigs';
export const KEYS_CONFIGS_NAME = 'keyConfigs';
export const SETUP_CONFIGS_NAME = 'setupConfigs';
export const START_CONFIGS_NAME = 'startConfigs';

const initializeSetup = async (config, k8) => {
  // compute other config parameters
  config.keysDir = path.join(validatePath(config.cacheDir), 'keys');
  config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
  config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys');

  if (!(await k8.hasNamespace(config.namespace))) {
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
  ]) as NodePrepareUpgradeConfigClass;

  await initializeSetup(config, this.k8);
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
  ]) as NodeDownloadGeneratedFilesConfigClass;

  config.existingNodeAliases = [];
  await initializeSetup(config, this.k8);

  return config;
};

export const updateConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(UPDATE_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'nodeClient',
    'podNames',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
  ]) as NodeUpdateConfigClass;

  config.curDate = new Date();
  config.existingNodeAliases = [];

  await initializeSetup(config, this.k8);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
  ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  return config;
};

export const deleteConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(DELETE_CONFIGS_NAME, argv.flags, [
    'adminKey',
    'allNodeAliases',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'nodeClient',
    'podNames',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
  ]) as NodeDeleteConfigClass;

  config.curDate = new Date();
  config.existingNodeAliases = [];

  await initializeSetup(config, this.k8);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
  ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  return config;
};

export const addConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(ADD_CONFIGS_NAME, argv.flags, [
    'allNodeAliases',
    'chartPath',
    'curDate',
    'existingNodeAliases',
    'freezeAdminPrivateKey',
    'keysDir',
    'lastStateZipPath',
    'nodeClient',
    'podNames',
    'serviceMap',
    'stagingDir',
    'stagingKeysDir',
    'treasuryKey',
  ]) as NodeAddConfigClass;

  ctx.adminKey = argv[flags.adminKey.name]
    ? PrivateKey.fromStringED25519(argv[flags.adminKey.name])
    : PrivateKey.fromStringED25519(constants.GENESIS_KEY);
  config.curDate = new Date();
  config.existingNodeAliases = [];

  await initializeSetup(config, this.k8);

  // set config in the context for later tasks to use
  ctx.config = config;

  ctx.config.chartPath = await this.prepareChartPath(
    ctx.config.chartDirectory,
    constants.SOLO_TESTING_CHART_URL,
    constants.SOLO_DEPLOYMENT_CHART,
  );

  // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
  ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace);

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
  config.freezeAdminPrivateKey = accountKeys.privateKey;

  const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
  const treasuryAccountPrivateKey = treasuryAccount.privateKey;
  config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

  config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace);

  return config;
};

export const logsConfigBuilder = function (argv, ctx, task) {
  /** @type {{namespace: string, nodeAliases: NodeAliases, nodeAliasesUnparsed: string}} */
  const config = {
    namespace: this.configManager.getFlag(flags.namespace),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
  };
  ctx.config = config;
  return config;
};

export const statesConfigBuilder = function (argv, ctx, task) {
  /** @type {{namespace: string, nodeAliases: NodeAliases, nodeAliasesUnparsed:string}} */
  const config = {
    namespace: this.configManager.getFlag(flags.namespace),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
  };
  ctx.config = config;
  return config;
};

export const refreshConfigBuilder = async function (argv, ctx, task) {
  ctx.config = this.getConfig(REFRESH_CONFIGS_NAME, argv.flags, ['nodeAliases', 'podNames']) as NodeRefreshConfigClass;

  ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);

  await initializeSetup(ctx.config, this.k8);

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
  /** @type {{namespace: string, nodeAliases: NodeAliases}} */
  ctx.config = {
    namespace: this.configManager.getFlag(flags.namespace),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
  };

  if (!(await this.k8.hasNamespace(ctx.config.namespace))) {
    throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
  }

  return ctx.config;
};

export const startConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(START_CONFIGS_NAME, argv.flags, ['nodeAliases']) as NodeStartConfigClass;

  if (!(await this.k8.hasNamespace(config.namespace))) {
    throw new SoloError(`namespace ${config.namespace} does not exist`);
  }

  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

  return config;
};

export const setupConfigBuilder = async function (argv, ctx, task) {
  const config = this.getConfig(SETUP_CONFIGS_NAME, argv.flags, ['nodeAliases', 'podNames']) as NodeSetupConfigClass;

  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

  await initializeSetup(config, this.k8);

  // set config in the context for later tasks to use
  ctx.config = config;

  return ctx.config;
};

export interface NodeLogsConfigClass {
  namespace: string;
  nodeAliases: string[];
}

export interface NodeRefreshConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  namespace: string;
  nodeAliasesUnparsed: string;
  releaseTag: string;
  nodeAliases: NodeAliases;
  podNames: Record<NodeAlias, PodName>;
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

export interface NodeStopConfigClass {
  namespace: string;
  nodeAliases: NodeAliases;
  podNames: Record<PodName, NodeAlias>;
}

export interface NodeStartConfigClass {
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  namespace: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  podNames: Record<NodeAlias, PodName>;
  nodeAliasesUnparsed: string;
}

export interface NodeAddConfigClass {
  app: string;
  cacheDir: string;
  chainId: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  gossipEndpoints: string;
  grpcEndpoints: string;
  localBuildPath: string;
  namespace: string;
  nodeAlias: NodeAlias;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  curDate: Date;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  lastStateZipPath: string;
  nodeClient: any;
  podNames: Record<NodeAlias, PodName>;
  serviceMap: Map<string, NetworkNodeServices>;
  treasuryKey: PrivateKey;
  stagingDir: string;
  stagingKeysDir: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  haproxyIps: string;
  envoyIps: string;
  getUnusedConfigs: () => string[];
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
  namespace: string;
  nodeAlias: NodeAlias;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  nodeClient: any;
  podNames: Record<NodeAlias, PodName>;
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
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  namespace: string;
  nodeAliasesUnparsed: string;
  releaseTag: string;
  nodeAliases: NodeAliases;
  podNames: object;
  getUnusedConfigs: () => string[];
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
  namespace: string;
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
  podNames: Record<NodeAlias, PodName>;
  serviceMap: Map<string, NetworkNodeServices>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  getUnusedConfigs: () => string[];
  curDate: Date;
}

interface NodePrepareUpgradeConfigClass {
  cacheDir: string;
  namespace: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  getUnusedConfigs: () => string[];
}

interface NodeDownloadGeneratedFilesConfigClass {
  cacheDir: string;
  namespace: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  getUnusedConfigs: () => string[];
  existingNodeAliases: NodeAliases[];
  allNodeAliases: NodeAliases[];
  serviceMap: Map<string, NetworkNodeServices>;
}
