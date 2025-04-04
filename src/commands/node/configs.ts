// SPDX-License-Identifier: Apache-2.0

import {Templates} from '../../core/templates.js';
import * as constants from '../../core/constants.js';
import {AccountId, PrivateKey} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors/solo-error.js';
import * as helpers from '../../core/helpers.js';
import fs from 'node:fs';
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
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
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
    context_: NodePrepareUpgradeContext,
    task: SoloListrTaskWrapper<NodePrepareUpgradeContext>,
  ): Promise<NodePrepareUpgradeConfigClass> {
    context_.config = this.configManager.getConfig(PREPARE_UPGRADE_CONFIGS_NAME, argv.flags, [
      'nodeClient',
      'freezeAdminPrivateKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodePrepareUpgradeConfigClass;

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(context_.config, this.k8Factory);
    context_.config.nodeClient = await this.accountManager.loadNodeClient(
      context_.config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      context_.config.deployment,
    );

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

    return context_.config;
  }

  public async downloadGeneratedFilesConfigBuilder(
    argv: ArgvStruct,
    context_: NodeDownloadGeneratedFilesContext,
    task: SoloListrTaskWrapper<NodeDownloadGeneratedFilesContext>,
  ): Promise<NodeDownloadGeneratedFilesConfigClass> {
    context_.config = this.configManager.getConfig(DOWNLOAD_GENERATED_FILES_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'serviceMap',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeDownloadGeneratedFilesConfigClass;

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.existingNodeAliases = [];
    await this.initializeSetup(context_.config, this.k8Factory);

    return context_.config;
  }

  public async upgradeConfigBuilder(
    argv: ArgvStruct,
    context_: NodeUpgradeContext,
    task: SoloListrTaskWrapper<NodeUpgradeContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeUpgradeConfigClass> {
    context_.config = this.configManager.getConfig(UPGRADE_CONFIGS_NAME, argv.flags, [
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

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.curDate = new Date();
    context_.config.existingNodeAliases = [];
    context_.config.nodeAliases = helpers.parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    await this.initializeSetup(context_.config, this.k8Factory);

    if (shouldLoadNodeClient) {
      context_.config.nodeClient = await this.accountManager.loadNodeClient(
        context_.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        context_.config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;
    return context_.config;
  }

  public async updateConfigBuilder(
    argv: ArgvStruct,
    context_: NodeUpdateContext,
    task: SoloListrTaskWrapper<NodeUpdateContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeUpdateConfigClass> {
    context_.config = this.configManager.getConfig(UPDATE_CONFIGS_NAME, argv.flags, [
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

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.curDate = new Date();
    context_.config.existingNodeAliases = [];

    await this.initializeSetup(context_.config, this.k8Factory);

    if (shouldLoadNodeClient) {
      context_.config.nodeClient = await this.accountManager.loadNodeClient(
        context_.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        context_.config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(
      context_.config.namespace,
      context_.config.deployment,
    );
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    context_.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (context_.config.domainNames) {
      context_.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(context_.config.domainNames);
    }

    return context_.config;
  }

  public async deleteConfigBuilder(
    argv: ArgvStruct,
    context_: NodeDeleteContext,
    task: SoloListrTaskWrapper<NodeDeleteContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeDeleteConfigClass> {
    context_.config = this.configManager.getConfig(DELETE_CONFIGS_NAME, argv.flags, [
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

    context_.config.curDate = new Date();
    context_.config.existingNodeAliases = [];
    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(context_.config, this.k8Factory);

    if (shouldLoadNodeClient) {
      context_.config.nodeClient = await this.accountManager.loadNodeClient(
        context_.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        context_.config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(
      context_.config.namespace,
      context_.config.deployment,
    );
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    context_.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (context_.config.domainNames) {
      context_.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(context_.config.domainNames);
    }

    return context_.config;
  }

  public async addConfigBuilder(
    argv: ArgvStruct,
    context_: NodeAddContext,
    task: SoloListrTaskWrapper<NodeAddContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeAddConfigClass> {
    context_.config = this.configManager.getConfig(ADD_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
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

    context_.adminKey = argv[flags.adminKey.name]
      ? PrivateKey.fromStringED25519(argv[flags.adminKey.name])
      : PrivateKey.fromStringED25519(constants.GENESIS_KEY);

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.curDate = new Date();
    context_.config.existingNodeAliases = [];

    await this.initializeSetup(context_.config, this.k8Factory);

    if (shouldLoadNodeClient) {
      context_.config.nodeClient = await this.accountManager.loadNodeClient(
        context_.config.namespace,
        this.remoteConfigManager.getClusterRefs(),
        context_.config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(
      context_.config.namespace,
      context_.config.deployment,
    );
    const treasuryAccountPrivateKey = treasuryAccount.privateKey;
    context_.config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    context_.config.serviceMap = await this.accountManager.getNodeServiceMap(
      context_.config.namespace,
      this.remoteConfigManager.getClusterRefs(),
      context_.config.deployment,
    );

    context_.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    context_.config.contexts = this.remoteConfigManager.getContexts();

    if (!context_.config.clusterRef) {
      context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
    }

    if (context_.config.domainNames) {
      context_.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(context_.config.domainNames);
    }

    return context_.config;
  }

  public async logsConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeLogsContext,
    task: SoloListrTaskWrapper<NodeLogsContext>,
  ): Promise<NodeLogsConfigClass> {
    context_.config = {
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

    return context_.config;
  }

  public async statesConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeStatesContext,
    task: SoloListrTaskWrapper<NodeStatesContext>,
  ): Promise<NodeStatesConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfigManager.getConsensusNodes();
    context_.config = {
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

    return context_.config;
  }

  public async refreshConfigBuilder(
    argv: ArgvStruct,
    context_: NodeRefreshContext,
    task: SoloListrTaskWrapper<NodeRefreshContext>,
  ): Promise<NodeRefreshConfigClass> {
    context_.config = this.configManager.getConfig(REFRESH_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeRefreshConfigClass;

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.nodeAliases = helpers.parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    await this.initializeSetup(context_.config, this.k8Factory);

    if (context_.config.domainNames) {
      context_.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(context_.config.domainNames);
    }

    return context_.config;
  }

  public async keysConfigBuilder(argv: ArgvStruct, context_: NodeKeysContext): Promise<NodeKeysConfigClass> {
    context_.config = this.configManager.getConfig(KEYS_CONFIGS_NAME, argv.flags, [
      'curDate',
      'keysDir',
      'nodeAliases',
      'consensusNodes',
      'contexts',
    ]) as NodeKeysConfigClass;

    context_.config.curDate = new Date();
    context_.config.nodeAliases = helpers.parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      this.remoteConfigManager.getConsensusNodes(),
      this.configManager,
    );

    context_.config.keysDir = PathEx.join(this.configManager.getFlag(flags.cacheDir), 'keys');

    if (!fs.existsSync(context_.config.keysDir)) {
      fs.mkdirSync(context_.config.keysDir);
    }
    return context_.config;
  }

  public async stopConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeStopContext,
    task: SoloListrTaskWrapper<NodeStopContext>,
  ): Promise<NodeStopConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfigManager.getConsensusNodes();
    context_.config = {
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

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);
    return context_.config;
  }

  public async freezeConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeFreezeContext,
    task: SoloListrTaskWrapper<NodeFreezeContext>,
  ): Promise<NodeFreezeConfigClass> {
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeFreezeConfigClass;

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

    return context_.config;
  }

  public async startConfigBuilder(
    argv: ArgvStruct,
    context_: NodeStartContext,
    task: SoloListrTaskWrapper<NodeStartContext>,
  ): Promise<NodeStartConfigClass> {
    context_.config = this.configManager.getConfig(START_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeStartConfigClass;
    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

    for (const consensusNode of context_.config.consensusNodes) {
      const k8 = this.k8Factory.getK8(consensusNode.context);
      if (!(await k8.namespaces().has(context_.config.namespace))) {
        throw new SoloError(`namespace ${context_.config.namespace} does not exist`);
      }
    }

    context_.config.nodeAliases = helpers.parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      context_.config.consensusNodes,
      this.configManager,
    );

    return context_.config;
  }

  public async restartConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeRestartContext,
    task: SoloListrTaskWrapper<NodeRestartContext>,
  ): Promise<NodeRestartConfigClass> {
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfigManager.getConsensusNodes(),
      contexts: this.remoteConfigManager.getContexts(),
    } as NodeRestartConfigClass;

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);

    return context_.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    context_: NodeSetupContext,
    task: SoloListrTaskWrapper<NodeSetupContext>,
  ): Promise<NodeSetupConfigClass> {
    context_.config = this.configManager.getConfig(SETUP_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeSetupConfigClass;

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    context_.config.nodeAliases = helpers.parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      context_.config.consensusNodes,
      this.configManager,
    );

    await this.initializeSetup(context_.config, this.k8Factory);

    if (context_.config.domainNames) {
      context_.config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(context_.config.domainNames);
    }

    return context_.config;
  }
}
