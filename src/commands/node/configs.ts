// SPDX-License-Identifier: Apache-2.0

import {Templates} from '../../core/templates.js';
import * as constants from '../../core/constants.js';
import {AccountId, PrivateKey} from '@hiero-ledger/sdk';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {checkNamespace, parseNodeAliases} from '../../core/helpers.js';
import fs from 'node:fs';
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
import {type AccountManager} from '../../core/account-manager.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {FilePermissions} from '../../business/utils/file-permissions.js';
import {type NodeSetupConfigClass} from './config-interfaces/node-setup-config-class.js';
import {type NodeStartConfigClass} from './config-interfaces/node-start-config-class.js';
import {type NodeKeysConfigClass} from './config-interfaces/node-keys-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeLogsConfigClass} from './config-interfaces/node-logs-config-class.js';
import {type NodeDestroyConfigClass} from './config-interfaces/node-destroy-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeUpgradeConfigClass} from './config-interfaces/node-upgrade-config-class.js';
import {type NodePrepareUpgradeConfigClass} from './config-interfaces/node-prepare-upgrade-config-class.js';
import {type SoloListrTaskWrapper} from '../../types/index.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeDestroyContext} from './config-interfaces/node-destroy-context.js';
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
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {SemanticVersion} from '../../business/utils/semantic-version.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {assertUpgradeVersionNotOlder} from '../../core/upgrade-version-guard.js';
import {SOLO_USER_AGENT_HEADER} from '../../core/constants.js';
import {type NodeConnectionsConfigClass} from './config-interfaces/node-connections-config-class.js';
import {type NodeConnectionsContext} from './config-interfaces/node-connections-context.js';
import {NodeCollectJfrLogsConfigClass} from './config-interfaces/node-collect-jfr-logs-config-class.js';
import {NodeCollectJfrLogsContext} from './config-interfaces/node-collect-jfr-logs-context.js';
import {optionFromFlag} from '../command-helpers.js';
import {type AccountIdWithKeyPairObject, type ComponentData, type Context} from '../../types/index.js';
import {type K8} from '../../integration/kube/k8.js';

const PREPARE_UPGRADE_CONFIGS_NAME: string = 'prepareUpgradeConfig';
const ADD_CONFIGS_NAME: string = 'addConfigs';
const DESTROY_CONFIGS_NAME: string = 'destroyConfigs';
const UPDATE_CONFIGS_NAME: string = 'updateConfigs';
const UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';
const REFRESH_CONFIGS_NAME: string = 'refreshConfigs';
const KEYS_CONFIGS_NAME: string = 'keyConfigs';
const SETUP_CONFIGS_NAME: string = 'setupConfigs';
const START_CONFIGS_NAME: string = 'startConfigs';

@injectable()
export class NodeCommandConfigs {
  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  private async initializeSetup(config: AnyObject, k8Factory: K8Factory): Promise<void> {
    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);

    if (!(await k8Factory.default().namespaces().has(config.namespace))) {
      throw new SoloErrors.system.namespaceNotFound(String(config.namespace));
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir, {mode: 0o700});
      FilePermissions.restrictToOwner(config.keysDir, true);
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

    context_.config.nodeClient = await this.accountManager.refreshNodeClient(
      context_.config.namespace,
      this.remoteConfig.getClusterRefs(),
      context_.config.deployment,
      undefined,
      {type: 'all', skipNodeAlias: context_.config.skipNodeAlias},
    );

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      context_.config.namespace,
    );
    context_.config.freezeAdminPrivateKey = accountKeys.privateKey;

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
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeUpgradeConfigClass;

    context_.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    context_.config.curDate = new Date();
    context_.config.existingNodeAliases = [];
    context_.config.nodeAliases = parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      this.remoteConfig.getConsensusNodes(),
      this.configManager,
    );

    // check if the intended package version exists
    if (context_.config.upgradeVersion) {
      const semVersion: SemanticVersion<string> = new SemanticVersion<string>(context_.config.upgradeVersion);
      const HEDERA_BUILDS_URL: string = 'https://builds.hedera.com';
      const BUILD_ZIP_URL: string = `${HEDERA_BUILDS_URL}/node/software/v${semVersion.major}.${semVersion.minor}/build-${context_.config.upgradeVersion}.zip`;
      try {
        // do not fetch or download, just check if URL exists or not
        const response: Response = await fetch(BUILD_ZIP_URL, {
          method: 'HEAD',
          headers: {
            'User-Agent': SOLO_USER_AGENT_HEADER,
          },
        });
        if (!response.ok) {
          throw new SoloErrors.validation.upgradeVersionNotFound(context_.config.upgradeVersion);
        }
      } catch (error) {
        throw new SoloErrors.system.upgradeVersionFetchFailed(context_.config.upgradeVersion, error);
      }

      // Compare target version against the version stored in remote config
      assertUpgradeVersionNotOlder(
        'Consensus node',
        context_.config.upgradeVersion,
        this.remoteConfig.configuration.versions.consensusNode,
        optionFromFlag(flags.upgradeVersion),
      );
    }

    await this.initializeSetup(context_.config, this.k8Factory);

    if (shouldLoadNodeClient) {
      context_.config.nodeClient = await this.accountManager.loadNodeClient(
        context_.config.namespace,
        this.remoteConfig.getClusterRefs(),
        context_.config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
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
    const config: NodeUpdateConfigClass = this.configManager.getConfig(UPDATE_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'freezeAdminPrivateKey',
      'keysDir',
      'nodeClient',
      'podRefs',
      'serviceMap',
      'stagingDir',
      'treasuryKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeUpdateConfigClass;

    context_.config = config;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.curDate = new Date();
    config.existingNodeAliases = [];

    await this.initializeSetup(config, this.k8Factory);

    if (shouldLoadNodeClient) {
      config.nodeClient = await this.accountManager.loadNodeClient(
        config.namespace,
        this.remoteConfig.getClusterRefs(),
        config.deployment,
      );
    }

    // check consensus releaseTag to make sure it is a valid semantic version string starting with 'v'
    config.releaseTag = SemanticVersion.getValidSemanticVersion(config.releaseTag, true, 'Consensus release tag');

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      config.namespace,
    );
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount: AccountIdWithKeyPairObject = await this.accountManager.getTreasuryAccountKeys(
      config.namespace,
      config.deployment,
    );
    const treasuryAccountPrivateKey: string = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    return config;
  }

  public async destroyConfigBuilder(
    argv: ArgvStruct,
    context_: NodeDestroyContext,
    task: SoloListrTaskWrapper<NodeDestroyContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeDestroyConfigClass> {
    const config: NodeDestroyConfigClass = this.configManager.getConfig(DESTROY_CONFIGS_NAME, argv.flags, [
      'adminKey',
      'allNodeAliases',
      'existingNodeAliases',
      'freezeAdminPrivateKey',
      'keysDir',
      'nodeClient',
      'podRefs',
      'serviceMap',
      'stagingDir',
      'treasuryKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeDestroyConfigClass;

    context_.config = config;

    config.curDate = new Date();
    config.existingNodeAliases = [];
    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

    await this.initializeSetup(config, this.k8Factory);

    if (shouldLoadNodeClient) {
      config.nodeClient = await this.accountManager.loadNodeClient(
        config.namespace,
        this.remoteConfig.getClusterRefs(),
        config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      config.namespace,
    );
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount: AccountIdWithKeyPairObject = await this.accountManager.getTreasuryAccountKeys(
      config.namespace,
      config.deployment,
    );
    const treasuryAccountPrivateKey: string = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    return config;
  }

  public async addConfigBuilder(
    argv: ArgvStruct,
    context_: NodeAddContext,
    task: SoloListrTaskWrapper<NodeAddContext>,
    shouldLoadNodeClient: boolean = true,
  ): Promise<NodeAddConfigClass> {
    const config: NodeAddConfigClass = this.configManager.getConfig(ADD_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'newNodeAliases',
      'curDate',
      'existingNodeAliases',
      'freezeAdminPrivateKey',
      'keysDir',
      'lastStateZipPath',
      'nodeClient',
      'podRefs',
      'serviceMap',
      'stagingDir',
      'treasuryKey',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeAddConfigClass;

    context_.config = config;

    context_.adminKey = argv[flags.adminKey?.name]
      ? PrivateKey.fromStringED25519(argv[flags.adminKey?.name])
      : PrivateKey.fromStringED25519(constants.GENESIS_KEY);

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.curDate = new Date();
    config.existingNodeAliases = [];

    await this.initializeSetup(config, this.k8Factory);

    if (shouldLoadNodeClient) {
      config.nodeClient = await this.accountManager.loadNodeClient(
        config.namespace,
        this.remoteConfig.getClusterRefs(),
        config.deployment,
      );
    }

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
      freezeAdminAccountId.toString(),
      config.namespace,
    );
    config.freezeAdminPrivateKey = accountKeys.privateKey;

    const treasuryAccount: AccountIdWithKeyPairObject = await this.accountManager.getTreasuryAccountKeys(
      config.namespace,
      config.deployment,
    );
    const treasuryAccountPrivateKey: string = treasuryAccount.privateKey;
    config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey);

    config.serviceMap = await this.accountManager.getNodeServiceMap(
      config.namespace,
      this.remoteConfig.getClusterRefs(),
      config.deployment,
    );

    config.consensusNodes = this.remoteConfig.getConsensusNodes();
    config.contexts = this.remoteConfig.getContexts();

    if (!config.clusterRef) {
      config.clusterRef = this.remoteConfig.getClusterRefs()?.entries()?.next()?.value[0];
      if (!config.clusterRef) {
        throw new SoloErrors.system.clusterReferenceUndetermined();
      }
    }

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    return config;
  }

  public async logsConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeLogsContext,
    task: SoloListrTaskWrapper<NodeLogsContext>,
  ): Promise<NodeLogsConfigClass> {
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        this.remoteConfig.getConsensusNodes(),
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfig.getConsensusNodes(),
      contexts: this.remoteConfig.getContexts(),
    } as NodeLogsConfigClass;

    return context_.config;
  }

  public async connectionsConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeConnectionsContext,
    task: SoloListrTaskWrapper<NodeConnectionsContext>,
  ): Promise<NodeConnectionsConfigClass> {
    const context: Context = this.remoteConfig.getContexts()[0];
    context_.config = {
      deployment: this.configManager.getFlag(flags.deployment),
      check: this.configManager.getFlag<boolean>(flags.check),
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      context,
      componentsData: [] as ComponentData[],
      newAccount: undefined,
    } as NodeConnectionsConfigClass;

    return context_.config;
  }

  public async statesConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeStatesContext,
    task: SoloListrTaskWrapper<NodeStatesContext>,
  ): Promise<NodeStatesConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        consensusNodes,
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes,
      contexts: this.remoteConfig.getContexts(),
    } as NodeStatesConfigClass;

    return context_.config;
  }

  public async refreshConfigBuilder(
    argv: ArgvStruct,
    context_: NodeRefreshContext,
    task: SoloListrTaskWrapper<NodeRefreshContext>,
  ): Promise<NodeRefreshConfigClass> {
    const config: NodeRefreshConfigClass = this.configManager.getConfig(REFRESH_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeRefreshConfigClass;

    context_.config = config;

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.nodeAliases = parseNodeAliases(
      config.nodeAliasesUnparsed,
      this.remoteConfig.getConsensusNodes(),
      this.configManager,
    );

    await this.initializeSetup(config, this.k8Factory);

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    return config;
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
    context_.config.nodeAliases = parseNodeAliases(
      context_.config.nodeAliasesUnparsed,
      this.remoteConfig.getConsensusNodes(),
      this.configManager,
    );

    context_.config.keysDir = PathEx.join(this.configManager.getFlag(flags.cacheDir), 'keys');

    if (!fs.existsSync(context_.config.keysDir)) {
      fs.mkdirSync(context_.config.keysDir, {mode: 0o700});
      FilePermissions.restrictToOwner(context_.config.keysDir, true);
    }
    return context_.config;
  }

  public async stopConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeStopContext,
    task: SoloListrTaskWrapper<NodeStopContext>,
  ): Promise<NodeStopConfigClass> {
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      nodeAliases: parseNodeAliases(
        this.configManager.getFlag(flags.nodeAliasesUnparsed),
        consensusNodes,
        this.configManager,
      ),
      nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes,
      contexts: this.remoteConfig.getContexts(),
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
      consensusNodes: this.remoteConfig.getConsensusNodes(),
      contexts: this.remoteConfig.getContexts(),
      freezeBlockDrainSeconds: this.configManager.getFlag<number>(flags.freezeBlockDrainSeconds),
    } as NodeFreezeConfigClass;

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);

    const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(context_.config.deployment);
    const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
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
    context_.config.consensusNodes = this.remoteConfig.getConsensusNodes();

    for (const consensusNode of context_.config.consensusNodes) {
      const k8: K8 = this.k8Factory.getK8(consensusNode.context);
      if (!(await k8.namespaces().has(context_.config.namespace))) {
        throw new SoloErrors.system.namespaceNotFound(String(context_.config.namespace));
      }
    }

    context_.config.nodeAliases = parseNodeAliases(
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
      consensusNodes: this.remoteConfig.getConsensusNodes(),
      contexts: this.remoteConfig.getContexts(),
    } as NodeRestartConfigClass;

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);

    return context_.config;
  }

  public async collectJfrConfigBuilder(
    _argv: ArgvStruct,
    context_: NodeCollectJfrLogsContext,
    task: SoloListrTaskWrapper<NodeCollectJfrLogsContext>,
  ): Promise<NodeCollectJfrLogsConfigClass> {
    context_.config = {
      namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
      deployment: this.configManager.getFlag(flags.deployment),
      consensusNodes: this.remoteConfig.getConsensusNodes(),
      contexts: this.remoteConfig.getContexts(),
      nodeAlias: this.configManager.getFlag(flags.nodeAlias),
    } as NodeCollectJfrLogsConfigClass;

    await checkNamespace(context_.config.consensusNodes, this.k8Factory, context_.config.namespace);

    return context_.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    context_: NodeSetupContext,
    task: SoloListrTaskWrapper<NodeSetupContext>,
  ): Promise<NodeSetupConfigClass> {
    const config: NodeSetupConfigClass = this.configManager.getConfig(SETUP_CONFIGS_NAME, argv.flags, [
      'nodeAliases',
      'podRefs',
      'namespace',
      'consensusNodes',
      'contexts',
    ]) as NodeSetupConfigClass;

    context_.config = config;

    // Only enforce the saved-version match when there is at least one consensus node that has actually
    // progressed past REQUESTED. On a fresh deployment the remote-config version may have been
    // backfilled from a flag default before the user-supplied release-tag was recorded, so comparing
    // against it would falsely reject a valid first-time setup.
    const savedVersion: SemanticVersion<string> = this.remoteConfig.configuration.versions.consensusNode;
    const hasDeployedConsensusNode: boolean = (this.remoteConfig.configuration.state.consensusNodes ?? []).some(
      (node): boolean => node.metadata?.phase && node.metadata.phase !== DeploymentPhase.REQUESTED,
    );
    if (
      hasDeployedConsensusNode &&
      !savedVersion.equals(config.releaseTag) && // allow different versions only for local builds
      !config.localBuildPath
    ) {
      throw new SoloErrors.validation.nodeVersionMismatch(savedVersion.toString(), config.releaseTag);
    }

    config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    config.consensusNodes = this.remoteConfig.getConsensusNodes();
    config.nodeAliases = parseNodeAliases(config.nodeAliasesUnparsed, config.consensusNodes, this.configManager);

    await this.initializeSetup(config, this.k8Factory);

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    return config;
  }
}
