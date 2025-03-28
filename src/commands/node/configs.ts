// SPDX-License-Identifier: Apache-2.0

import {FREEZE_ADMIN_ACCOUNT} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import * as constants from '../../core/constants.js';
import {PrivateKey} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors/solo-error.js';
import * as helpers from '../../core/helpers.js';
import fs from 'fs';
import {checkNamespace} from '../../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import {Flags as flags} from '../flags.js';
import {type AnyObject, type ArgvStruct} from '../../types/aliases.js';
import {type NodeAddConfigClass} from './config-interfaces/node-add-config-class.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type LocalConfig} from '../../core/config/local/local-config.js';
import {type AccountManager} from '../../core/account-manager.js';
import {type Helm} from '../../core/helm.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote-config-manager.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type NodeSetupConfigClass} from './config-interfaces/node-setup-config-class.js';
import {type NodeStartConfigClass} from './config-interfaces/node-start-config-class.js';
import {type NodeKeysConfigClass} from './config-interfaces/node-keys-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeLogsConfigClass} from './config-interfaces/node-logs-config-class.js';
import {type NodeDeleteConfigClass} from './config-interfaces/node-delete-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeUpgradeConfigClass} from './config-interfaces/node-upgrade-config-class.js';
import {type NodeDownloadGeneratedFilesConfigClass} from './config-interfaces/node-download-generated-files-config-class.js';
import {type NodePrepareUpgradeConfigClass} from './config-interfaces/node-prepare-upgrade-config-class.js';
import {type SoloListrTaskWrapper} from '../../types/index.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeDownloadGeneratedFilesContext} from './config-interfaces/node-download-generated-files-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeDeleteContext} from './config-interfaces/node-delete-context.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeLogsContext} from './config-interfaces/node-logs-context.js';
import {type NodeStatesConfigClass} from './config-interfaces/node-states-config-class.js';
import {type NodeStatesContext} from './config-interfaces/node-states-context.js';
import {type NodeRefreshContext} from './config-interfaces/node-refresh-context.js';
import {type NodeKeysContext} from './config-interfaces/node-keys-context.js';
import {type NodeStopConfigClass} from './config-interfaces/node-stop-config-class.js';
import {type NodeStopContext} from './config-interfaces/node-stop-context.js';
import {type NodeFreezeConfigClass} from './config-interfaces/node-freeze-config-class.js';
import {type NodeFreezeContext} from './config-interfaces/node-freeze-context.js';
import {type NodeStartContext} from './config-interfaces/node-start-context.js';
import {type NodeRestartConfigClass} from './config-interfaces/node-restart-config-class.js';
import {type NodeRestartContext} from './config-interfaces/node-restart-context.js';
import {type NodeSetupContext} from './config-interfaces/node-setup-context.js';
import {type NodePrepareUpgradeContext} from './config-interfaces/node-prepare-upgrade-context.js';

const PREPARE_UPGRADE_CONFIGS_NAME = 'prepareUpgradeConfig';
const DOWNLOAD_GENERATED_FILES_CONFIGS_NAME = 'downloadGeneratedFilesConfig';
const ADD_CONFIGS_NAME = 'addConfigs';
const DELETE_CONFIGS_NAME = 'deleteConfigs';
const UPDATE_CONFIGS_NAME = 'updateConfigs';
const UPGRADE_CONFIGS_NAME = 'upgradeConfigs';
const REFRESH_CONFIGS_NAME = 'refreshConfigs';
const KEYS_CONFIGS_NAME = 'keyConfigs';
const SETUP_CONFIGS_NAME = 'setupConfigs';
const START_CONFIGS_NAME = 'startConfigs';

@injectable()
export class NodeCommandConfigs {
  public constructor(
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

  private async initializeSetup(config: AnyObject, k8Factory: K8Factory): Promise<void> {
    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
    config.stagingKeysDir = PathEx.join(config.stagingDir, 'keys');

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

  public async prepareUpgradeConfigBuilder(
    argv: ArgvStruct,
    ctx: NodePrepareUpgradeContext,
    task: SoloListrTaskWrapper<NodePrepareUpgradeContext>,
  ): Promise<NodePrepareUpgradeConfigClass> {
    ctx.config = this.configManager.getConfig(PREPARE_UPGRADE_CONFIGS_NAME, argv.flags, [
      'nodeClient',
      'freezeAdminPrivateKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodePrepareUpgradeConfigClass;

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(ctx.config, this.k8Factory);
    ctx.config.nodeClient = await this.accountManager.loadNodeClient(
      ctx.config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      ctx.config.deployment,
    );

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;

    return ctx.config;
  }

  public async downloadGeneratedFilesConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeDownloadGeneratedFilesContext,
    task: SoloListrTaskWrapper<NodeDownloadGeneratedFilesContext>,
  ): Promise<NodeDownloadGeneratedFilesConfigClass> {
    ctx.config = this.configManager.getConfig(DOWNLOAD_GENERATED_FILES_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'serviceMap',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeDownloadGeneratedFilesConfigClass;

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.existingNodeAliases = [];
    await this.initializeSetup(ctx.config, this.k8Factory);

    return ctx.config;
  }

  public async upgradeConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeUpgradeContext,
    task: SoloListrTaskWrapper<NodeUpgradeContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeUpgradeConfigClass> {
    ctx.config = this.configManager.getConfig(UPGRADE_CONFIGS_NAME, argv.flags, [
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

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.curDate = new Date();
    ctx.config.existingNodeAliases = [];
    ctx.config.nodeAliases = helpers.parseNodeAliases(
      ctx.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    await this.initializeSetup(ctx.config, this.k8Factory);

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
        ctx.config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;
    return ctx.config;
  }

  public async updateConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeUpdateContext,
    task: SoloListrTaskWrapper<NodeUpdateContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeUpdateConfigClass> {
    ctx.config = this.configManager.getConfig(UPDATE_CONFIGS_NAME, argv.flags, [
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

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.curDate = new Date();
    ctx.config.existingNodeAliases = [];

    await this.initializeSetup(ctx.config, this.k8Factory);

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
        ctx.config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(ctx.config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    ctx.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (ctx.config.domainNames) {
      ctx.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(ctx.config.domainNames);
    }

    return ctx.config;
  }

  public async deleteConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeDeleteContext,
    task: SoloListrTaskWrapper<NodeDeleteContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeDeleteConfigClass> {
    ctx.config = this.configManager.getConfig(DELETE_CONFIGS_NAME, argv.flags, [
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

    ctx.config.curDate = new Date();
    ctx.config.existingNodeAliases = [];
    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(ctx.config, this.k8Factory);

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
        ctx.config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(ctx.config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    ctx.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (ctx.config.domainNames) {
      ctx.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(ctx.config.domainNames);
    }

    return ctx.config;
  }

  public async addConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeAddContext,
    task: SoloListrTaskWrapper<NodeAddContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeAddConfigClass> {
    ctx.config = this.configManager.getConfig(ADD_CONFIGS_NAME, argv.flags, [
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

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.curDate = new Date();
    ctx.config.existingNodeAliases = [];

    await this.initializeSetup(ctx.config, this.k8Factory);

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
        ctx.config.deployment,
      );
    }

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(ctx.config.namespace);
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    ctx.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    ctx.config.serviceMap = await this.accountManager.getNodeServiceMap(
      ctx.config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      ctx.config.deployment,
    );

    ctx.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    ctx.config.contexts = this.remoteConfigManager.getContexts();

    if (!ctx.config.clusterRef) ctx.config.clusterRef = this.k8Factory.default().clusters().readCurrent();

    if (ctx.config.domainNames) {
      ctx.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(ctx.config.domainNames);
    }

    return ctx.config;
  }

  public async logsConfigBuilder(
    _argv: ArgvStruct,
    ctx: NodeLogsContext,
    task: SoloListrTaskWrapper<NodeLogsContext>,
  ): Promise<NodeLogsConfigClass> {
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        this.remoteConfigManager.getConsensusNodes(),
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeLogsConfigClass;

    return ctx.config;
  }

  public async statesConfigBuilder(
    _argv: ArgvStruct,
    ctx: NodeStatesContext,
    task: SoloListrTaskWrapper<NodeStatesContext>,
  ): Promise<NodeStatesConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfigManager.getConsensusNodes();
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        consensusNodes,
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes,
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeStatesConfigClass;

    return ctx.config;
  }

  public async refreshConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeRefreshContext,
    task: SoloListrTaskWrapper<NodeRefreshContext>,
  ): Promise<NodeRefreshConfigClass> {
    ctx.config = this.configManager.getConfig(REFRESH_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeRefreshConfigClass;

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.nodeAliases = helpers.parseNodeAliases(
      ctx.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    await this.initializeSetup(ctx.config, this.k8Factory);

    if (ctx.config.domainNames) {
      ctx.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(ctx.config.domainNames);
    }

    return ctx.config;
  }

  public async keysConfigBuilder(argv: ArgvStruct, ctx: NodeKeysContext): Promise<NodeKeysConfigClass> {
    ctx.config = this.configManager.getConfig(KEYS_CONFIGS_NAME, argv.flags, [
      'curDate',
      'keysDir',
      'nodeAliases',
      'consensusNodes',
      'contexts',
    ]) as NodeKeysConfigClass;

    ctx.config.curDate = new Date();
    ctx.config.nodeAliases = helpers.parseNodeAliases(
      ctx.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    ctx.config.keysDir = PathEx.join(this.configManager.getFlag(flags.cacheDir), 'keys');

    if (!fs.existsSync(ctx.config.keysDir)) {
      fs.mkdirSync(ctx.config.keysDir);
    }
    return ctx.config;
  }

  public async stopConfigBuilder(
    _argv: ArgvStruct,
    ctx: NodeStopContext,
    task: SoloListrTaskWrapper<NodeStopContext>,
  ): Promise<NodeStopConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfigManager.getConsensusNodes();
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: helpers.parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        consensusNodes,
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes,
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeStopConfigClass;

    await checkNamespace(ctx.config.consensusNodes, this.k8Factory, ctx.config.namespace);
    return ctx.config;
  }

  public async freezeConfigBuilder(
    _argv: ArgvStruct,
    ctx: NodeFreezeContext,
    task: SoloListrTaskWrapper<NodeFreezeContext>,
  ): Promise<NodeFreezeConfigClass> {
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeFreezeConfigClass;

    await checkNamespace(ctx.config.consensusNodes, this.k8Factory, ctx.config.namespace);

    const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, ctx.config.namespace);
    ctx.config.freezeAdminPrivateKey = accountKeys.privateKey;

    return ctx.config;
  }

  public async startConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeStartContext,
    task: SoloListrTaskWrapper<NodeStartContext>,
  ): Promise<NodeStartConfigClass> {
    ctx.config = this.configManager.getConfig(START_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeStartConfigClass;
    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

    for (const consensusNode of ctx.config.consensusNodes) {
      const k8 = this.k8Factory.getK8(consensusNode.context);
      if (!(await k8.namespaces().has(ctx.config.namespace))) {
        throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
      }
    }

    ctx.config.nodeAliases = helpers.parseNodeAliases(
      ctx.config.nodeAliasesUnparsed,
      ctx.config.consensusNodes,
      this.configManager,
    );

    return ctx.config;
  }

  public async restartConfigBuilder(
    _argv: ArgvStruct,
    ctx: NodeRestartContext,
    task: SoloListrTaskWrapper<NodeRestartContext>,
  ): Promise<NodeRestartConfigClass> {
    ctx.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeRestartConfigClass;

    await checkNamespace(ctx.config.consensusNodes, this.k8Factory, ctx.config.namespace);

    return ctx.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    ctx: NodeSetupContext,
    task: SoloListrTaskWrapper<NodeSetupContext>,
  ): Promise<NodeSetupConfigClass> {
    ctx.config = this.configManager.getConfig(SETUP_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeSetupConfigClass;

    ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    ctx.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    ctx.config.nodeAliases = helpers.parseNodeAliases(
      ctx.config.nodeAliasesUnparsed,
      ctx.config.consensusNodes,
      this.configManager,
    );

    await this.initializeSetup(ctx.config, this.k8Factory);

    if (ctx.config.domainNames) {
      ctx.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(ctx.config.domainNames);
    }

    return ctx.config;
  }
}
