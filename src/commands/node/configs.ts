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
import {type ConsensusNode} from '../../core/model/consensus_node.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type ConfigManager} from '../../core/config_manager.js';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {type LocalConfig} from '../../core/config/local_config.js';
import {type AccountManager} from '../../core/account_manager.js';
import {type Helm} from '../../core/helm.js';
import {type ConfigMap, getConfig} from '../../core/config_builder.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';

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

@injectable()
export class NodeCommandConfigs {
  constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.Helm) private readonly helm: Helm,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
  }

  private async initializeSetup(config: any, k8Factory: K8Factory) {
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
  }

  public async prepareUpgradeConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    const config = getConfig(this.configManager, configMaps, PREPARE_UPGRADE_CONFIGS_NAME, argv.flags, [
      'nodeClient',
      'freezeAdminPrivateKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodePrepareUpgradeConfigClass;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(config, this.k8Factory);
    config.nodeClient = await this.accountManager.loadNodeClient(
      config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      config.deployment,
    );

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    return config;
  }

  public async downloadGeneratedFilesConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    const config = getConfig(this.configManager, configMaps, DOWNLOAD_GENERATED_FILES_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'serviceMap',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeDownloadGeneratedFilesConfigClass;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.existingNodeAliases = [];
    await this.initializeSetup(config, this.k8Factory);

    return config;
  }

  public async upgradeConfigBuilder(argv, ctx, task, configMaps?: ConfigMap, shouldLoadNodeClient = true) {
    const config = getConfig(this.configManager, configMaps, UPGRADE_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'keysDir',
      'nodeClient',
      'podRefs',
      'stagingDir',
      'stagingKeysDir',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeUpgradeConfigClass;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.curDate = new Date();
    config.existingNodeAliases = [];
    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

    await this.initializeSetup(config, this.k8Factory);

    // set config in the context for later tasks to use
    ctx.config = config;

    ctx.config.chartPath = await helpers.prepareChartPath(
      this.helm,
      ctx.config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );
    if (shouldLoadNodeClient) {
      ctx.config.nodeClient = await this.accountManager.loadNodeClient(
        ctx.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
    config.freezeAdminPrivateKey = accountKeys.privateKey;
    return config;
  }

  public async updateConfigBuilder(argv, ctx, task, configMaps?: ConfigMap, shouldLoadNodeClient = true) {
    const config = getConfig(this.configManager, configMaps, UPDATE_CONFIGS_NAME, argv.flags, [
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
      'consensusNodes',
      'contexts',
    ]) as NodeUpdateConfigClass;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.curDate = new Date();
    config.existingNodeAliases = [];

    await this.initializeSetup(config, this.k8Factory);

    // set config in the context for later tasks to use
    ctx.config = config;

    ctx.config.chartPath = await helpers.prepareChartPath(
      this.helm,
      ctx.config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );

    if (shouldLoadNodeClient) {
      ctx.config.nodeClient = await this.accountManager.loadNodeClient(
        ctx.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    return config;
  }

  public async deleteConfigBuilder(argv, ctx, task, configMaps?: ConfigMap, shouldLoadNodeClient = true) {
    const config = getConfig(this.configManager, configMaps, DELETE_CONFIGS_NAME, argv.flags, [
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
      'consensusNodes',
      'contexts',
    ]) as NodeDeleteConfigClass;

    config.curDate = new Date();
    config.existingNodeAliases = [];
    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(config, this.k8Factory);

    // set config in the context for later tasks to use
    ctx.config = config;

    ctx.config.chartPath = await helpers.prepareChartPath(
      this.helm,
      ctx.config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );

    if (shouldLoadNodeClient) {
      ctx.config.nodeClient = await this.accountManager.loadNodeClient(
        ctx.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    return config;
  }

  public async addConfigBuilder(argv, ctx, task, configMaps?: ConfigMap, shouldLoadNodeClient = true) {
    const config = getConfig(this.configManager, configMaps, ADD_CONFIGS_NAME, argv.flags, [
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
      'consensusNodes',
      'contexts',
    ]) as NodeAddConfigClass;

    ctx.adminKey = argv[flags.adminKey.name]
      ? PrivateKey.fromStringED25519(argv[flags.adminKey.name])
      : PrivateKey.fromStringED25519(constants.GENESIS_KEY);

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.curDate = new Date();
    config.existingNodeAliases = [];

    await this.initializeSetup(config, this.k8Factory);

    // set config in the context for later tasks to use
    ctx.config = config;

    ctx.config.chartPath = await helpers.prepareChartPath(
      this.helm,
      ctx.config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );

    if (shouldLoadNodeClient) {
      ctx.config.nodeClient = await this.accountManager.loadNodeClient(
        ctx.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace);
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    config.serviceMap = await this.accountManager.getNodeServiceMap(
      config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      config.deployment,
    );

    config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    config.contexts = this.remoteConfigManager.getContexts();

    return config;
  }

  public async logsConfigBuilder(argv, ctx, task) {
    const config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeLogsConfigClass;
    ctx.config = config;
    return config;
  }

  public async statesConfigBuilder(argv, ctx, task) {
    const config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    };
    ctx.config = config;
    return config;
  }

  public async refreshConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    ctx.config = getConfig(this.configManager, configMaps, REFRESH_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeRefreshConfigClass;

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);

    await this.initializeSetup(ctx.config, this.k8Factory);

    return ctx.config;
  }

  public async keysConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    const config: NodeKeysConfigClass = getConfig(this.configManager, configMaps, KEYS_CONFIGS_NAME, argv.flags, [
      'curDate',
      'keysDir',
      'nodeAliases',
      'consensusNodes',
      'contexts',
    ]) as NodeKeysConfigClass;

    config.curDate = new Date();
    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);
    if (config.nodeAliases.length === 0) {
      const consensusNodes = this.remoteConfigManager.getConsensusNodes();

      // @ts-expect-error TS2322 Type 'string[]' is not assignable to type 'NodeAliases'
      config.nodeAliases = consensusNodes.map((node: {name: string}) => {
        return node.name;
      });
      if (config.nodeAliases.length === 0) {
        throw new SoloError('no node aliases provided via flags or RemoteConfig');
      }
    }
    config.keysDir = path.join(this.configManager.getFlag(flags.cacheDir), 'keys');

    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir);
    }
    return config;
  }

  public async stopConfigBuilder(argv, ctx, task) {
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    };

    if (!(await this.k8Factory.default().namespaces().has(ctx.config.namespace))) {
      throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
    }

    return ctx.config;
  }

  public async startConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    const config = getConfig(this.configManager, configMaps, START_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeStartConfigClass;
    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

    for (const consensusNode of config.consensusNodes) {
      const k8 = this.k8Factory.getK8(consensusNode.context);
      if (!(await k8.namespaces().has(config.namespace))) {
        throw new SoloError(`namespace ${config.namespace} does not exist`);
      }
    }

    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

    return config;
  }

  public async setupConfigBuilder(argv, ctx, task, configMaps?: ConfigMap) {
    const config = getConfig(this.configManager, configMaps, SETUP_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeSetupConfigClass;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);
    config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

    await this.initializeSetup(config, this.k8Factory);

    // set config in the context for later tasks to use
    ctx.config = config;

    return ctx.config;
  }
}

export interface NodeLogsConfigClass {
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: string[];
  consensusNodes: ConsensusNode[];
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
}

export interface NodeStartConfigClass {
  app: string;
  cacheDir: string;
  consensusNodes: ConsensusNode[];
  debugNodeAlias: NodeAlias;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  podRefs: Record<NodeAlias, PodRef>;
  nodeAliasesUnparsed: string;
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
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
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
}

interface NodePrepareUpgradeConfigClass {
  cacheDir: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  getUnusedConfigs: () => string[];
  consensusNodes: ConsensusNode[];
  contexts: string[];
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
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
