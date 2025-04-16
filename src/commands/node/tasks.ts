// SPDX-License-Identifier: Apache-2.0

import {type AccountManager} from '../../core/account-manager.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type KeyManager} from '../../core/key-manager.js';
import {type ProfileManager} from '../../core/profile-manager.js';
import {type PlatformInstaller} from '../../core/platform-installer.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type CertificateManager} from '../../core/certificate-manager.js';
import {Zippy} from '../../core/zippy.js';
import * as constants from '../../core/constants.js';
import {
  DEFAULT_NETWORK_NODE_NAME,
  HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  IGNORED_NODE_ACCOUNT_ID,
} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import {
  AccountBalanceQuery,
  AccountId,
  AccountUpdateTransaction,
  type Client,
  FileAppendTransaction,
  FileId,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType,
  Long,
  NodeCreateTransaction,
  NodeDeleteTransaction,
  NodeUpdateTransaction,
  PrivateKey,
  Timestamp,
  TransactionReceipt,
  TransactionResponse,
} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors/solo-error.js';
import {MissingArgumentError} from '../../core/errors/missing-argument-error.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as helpers from '../../core/helpers.js';
import {
  addDebugOptions,
  entityId,
  prepareEndpoints,
  renameAndCopyFile,
  requiresJavaSveFix,
  showVersionBanner,
  sleep,
  splitFlagInput,
} from '../../core/helpers.js';
import chalk from 'chalk';
import {Flags as flags} from '../flags.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {
  type AnyListrContext,
  type AnyObject,
  type ArgvStruct,
  type ConfigBuilder,
  type IP,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
  type SkipCheck,
} from '../../types/aliases.js';
import {PodName} from '../../integration/kube/resources/pod/pod-name.js';
import {NodeStatusCodes, NodeStatusEnums, NodeSubcommandType} from '../../core/enumerations.js';
import {type Lock} from '../../core/lock/lock.js';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {Duration} from '../../core/time/duration.js';
import {type NodeAddConfigClass} from './config-interfaces/node-add-config-class.js';
import {GenesisNetworkDataConstructor} from '../../core/genesis-network-models/genesis-network-data-constructor.js';
import {NodeOverridesModel} from '../../core/node-overrides-model.js';
import {type NamespaceName} from '../../integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {NetworkNodes} from '../../core/network-nodes.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {type Optional, type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../types/index.js';
import {
  type ClusterReference,
  type DeploymentName,
  type NamespaceNameAsString,
} from '../../core/config/remote/types.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ConsensusNode} from '../../core/model/consensus-node.js';
import {type K8} from '../../integration/kube/k8.js';
import {Base64} from 'js-base64';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote-config-manager.js';
import {type LocalConfig} from '../../core/config/local/local-config.js';
import {BaseCommand} from '../base.js';
import {ConsensusNodeComponent} from '../../core/config/remote/components/consensus-node-component.js';
import {ConsensusNodeStates} from '../../core/config/remote/enumerations.js';
import {EnvoyProxyComponent} from '../../core/config/remote/components/envoy-proxy-component.js';
import {HaProxyComponent} from '../../core/config/remote/components/ha-proxy-component.js';
import {HEDERA_PLATFORM_VERSION} from '../../../version.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type NodeDeleteConfigClass} from './config-interfaces/node-delete-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeDeleteContext} from './config-interfaces/node-delete-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeStatesContext} from './config-interfaces/node-states-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeRefreshContext} from './config-interfaces/node-refresh-context.js';
import {type NodeStopContext} from './config-interfaces/node-stop-context.js';
import {type NodeFreezeContext} from './config-interfaces/node-freeze-context.js';
import {type NodeStartContext} from './config-interfaces/node-start-context.js';
import {type NodeRestartContext} from './config-interfaces/node-restart-context.js';
import {type NodeSetupContext} from './config-interfaces/node-setup-context.js';
import {type NodeDownloadGeneratedFilesContext} from './config-interfaces/node-download-generated-files-context.js';
import {type NodeKeysContext} from './config-interfaces/node-keys-context.js';
import {type NodeKeysConfigClass} from './config-interfaces/node-keys-config-class.js';
import {type NodeStartConfigClass} from './config-interfaces/node-start-config-class.js';
import {type CheckedNodesConfigClass, type CheckedNodesContext} from './config-interfaces/node-common-config-class.js';
import {type NetworkNodeServices} from '../../core/network-node-services.js';

@injectable()
export class NodeCommandTasks {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.PlatformInstaller) private readonly platformInstaller: PlatformInstaller,
    @inject(InjectTokens.KeyManager) private readonly keyManager: KeyManager,
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.CertificateManager) private readonly certificateManager: CertificateManager,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.platformInstaller = patchInject(platformInstaller, InjectTokens.PlatformInstaller, this.constructor.name);
    this.keyManager = patchInject(keyManager, InjectTokens.KeyManager, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.certificateManager = patchInject(certificateManager, InjectTokens.CertificateManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
  }

  private getFileUpgradeId(deploymentName: DeploymentName): FileId {
    const realm = this.localConfig.getRealm(deploymentName);
    const shard = this.localConfig.getShard(deploymentName);
    return FileId.fromString(entityId(shard, realm, constants.UPGRADE_FILE_ID_NUM));
  }

  private async _prepareUpgradeZip(stagingDirectory: string): Promise<string> {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper = new Zippy(this.logger);
    const upgradeConfigDirectory = PathEx.join(stagingDirectory, 'mock-upgrade', 'data', 'config');
    if (!fs.existsSync(upgradeConfigDirectory)) {
      fs.mkdirSync(upgradeConfigDirectory, {recursive: true});
    }

    // bump field hedera.config.version
    const fileBytes = fs.readFileSync(PathEx.joinWithRealPath(stagingDirectory, 'templates', 'application.properties'));
    const lines = fileBytes.toString().split('\n');
    const newLines = [];
    for (let line of lines) {
      line = line.trim();
      const parts = line.split('=');
      if (parts.length === 2) {
        if (parts[0] === 'hedera.config.version') {
          let version = Number.parseInt(parts[1]);
          line = `hedera.config.version=${++version}`;
        }
        newLines.push(line);
      }
    }
    fs.writeFileSync(PathEx.join(upgradeConfigDirectory, 'application.properties'), newLines.join('\n'));

    return await zipper.zip(
      PathEx.join(stagingDirectory, 'mock-upgrade'),
      PathEx.join(stagingDirectory, 'mock-upgrade.zip'),
    );
  }

  private async _uploadUpgradeZip(
    upgradeZipFile: string,
    nodeClient: Client,
    deploymentName: DeploymentName,
  ): Promise<string> {
    // get byte value of the zip file
    const zipBytes = fs.readFileSync(upgradeZipFile);
    const zipHash = crypto.createHash('sha384').update(zipBytes).digest('hex');
    this.logger.debug(
      `loaded upgrade zip file [ zipHash = ${zipHash} zipBytes.length = ${zipBytes.length}, zipPath = ${upgradeZipFile}]`,
    );

    // create a file upload transaction to upload file to the network
    try {
      let start = 0;

      while (start < zipBytes.length) {
        const zipBytesChunk = new Uint8Array(zipBytes.subarray(start, start + constants.UPGRADE_FILE_CHUNK_SIZE));
        let fileTransaction = null;

        fileTransaction =
          start === 0
            ? new FileUpdateTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk)
            : new FileAppendTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk);
        const resp = await fileTransaction.execute(nodeClient);
        const receipt = await resp.getReceipt(nodeClient);
        this.logger.debug(
          `updated file ${this.getFileUpgradeId(deploymentName)} [chunkSize= ${zipBytesChunk.length}, txReceipt = ${receipt.toString()}]`,
        );

        start += constants.UPGRADE_FILE_CHUNK_SIZE;
        this.logger.debug(`uploaded ${start} bytes of ${zipBytes.length} bytes`);
      }

      return zipHash;
    } catch (error) {
      throw new SoloError(`failed to upload build.zip file: ${error.message}`, error);
    }
  }

  private async copyLocalBuildPathToNode(
    k8: K8,
    podReference: PodReference,
    configManager: ConfigManager,
    localDataLibraryBuildPath: string,
  ): Promise<void> {
    const filterFunction = (path: string | string[]) => {
      return !(path.includes('data/keys') || path.includes('data/config'));
    };

    await k8
      .containers()
      .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
      .copyTo(localDataLibraryBuildPath, `${constants.HEDERA_HAPI_PATH}`, filterFunction);
    if (configManager.getFlag<string>(flags.appConfig)) {
      const testJsonFiles: string[] = configManager.getFlag<string>(flags.appConfig)!.split(',');
      for (const jsonFile of testJsonFiles) {
        if (fs.existsSync(jsonFile)) {
          await k8
            .containers()
            .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
            .copyTo(jsonFile, `${constants.HEDERA_HAPI_PATH}`);
        }
      }
    }
  }

  private _uploadPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    task: SoloListrTaskWrapper<AnyListrContext>,
    localBuildPath: string,
    consensusNodes: Optional<ConsensusNode[]>,
    releaseTag: string,
  ): SoloListr<AnyListrContext> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];

    this.logger.debug('no need to fetch, use local build jar files');

    const buildPathMap = new Map<NodeAlias, string>();
    let defaultDataLibraryBuildPath: string;
    const parameterPairs = localBuildPath.split(',');
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibraryBuildPath] = parameterPair.split('=');
        buildPathMap.set(nodeAlias as NodeAlias, localDataLibraryBuildPath);
      } else {
        defaultDataLibraryBuildPath = parameterPair;
      }
    }

    let localDataLibraryBuildPath: string;

    for (const nodeAlias of nodeAliases) {
      const podReference = podReferences[nodeAlias];
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      localDataLibraryBuildPath = buildPathMap.has(nodeAlias)
        ? buildPathMap.get(nodeAlias)
        : defaultDataLibraryBuildPath;

      if (!fs.existsSync(localDataLibraryBuildPath)) {
        throw new SoloError(`local build path does not exist: ${localDataLibraryBuildPath}`);
      }

      const self = this;

      const k8 = self.k8Factory.getK8(context);

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeAlias)} from ${localDataLibraryBuildPath}`,
        task: async () => {
          const shellRunner = new ShellRunner();
          try {
            const retrievedReleaseTag = await shellRunner.run(
              `git -C ${localDataLibraryBuildPath} describe --tags --abbrev=0`,
            );
            const expectedReleaseTag = releaseTag ? releaseTag : HEDERA_PLATFORM_VERSION;
            if (retrievedReleaseTag.join('\n') !== expectedReleaseTag) {
              this.logger.showUser(
                chalk.cyan(
                  `Checkout version ${retrievedReleaseTag} does not match the release version ${expectedReleaseTag}`,
                ),
              );
            }
          } catch {
            // if we can't find the release tag in the local build path directory, we will skip the check and continue
            self.logger.warn('Could not find release tag in local build path directory');
            self.logger.showUser(
              chalk.yellowBright(
                'The release tag could not be verified, please ensure that the release tag passed on the command line ' +
                  'matches the release tag of the code in the local build path directory',
              ),
            );
          }

          // retry copying the build to the node to handle edge cases during performance testing
          let storedError: Error | null = null;
          let index = 0;
          for (; index < constants.LOCAL_BUILD_COPY_RETRY; index++) {
            storedError = null;
            try {
              // filter the data/config and data/keys to avoid failures due to config and secret mounts
              await self.copyLocalBuildPathToNode(k8, podReference, self.configManager, localDataLibraryBuildPath);
            } catch (error) {
              storedError = error;
            }
          }
          if (storedError) {
            throw new SoloError(`Error in copying local build to node: ${storedError.message}`, storedError);
          }
        },
      });
    }
    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: constants.NODE_COPY_CONCURRENT,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
    });
  }

  private _fetchPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    releaseTag: string,
    task: SoloListrTaskWrapper<AnyListrContext>,
    platformInstaller: PlatformInstaller,
    consensusNodes?: Optional<ConsensusNode[]>,
  ): SoloListr<AnyListrContext> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    for (const nodeAlias of nodeAliases) {
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      const podReference = podReferences[nodeAlias];
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeAlias)} [ platformVersion = ${releaseTag}, context = ${context} ]`,
        task: async () => await platformInstaller.fetchPlatform(podReference, releaseTag, context),
      });
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true, // since we download in the container directly, we want this to be in parallel across all nodes
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  private _checkNodeActivenessTask(
    context_: AnyListrContext,
    task: SoloListrTaskWrapper<AnyListrContext>,
    nodeAliases: NodeAliases,
    status = NodeStatusCodes.ACTIVE,
  ): SoloListr<AnyListrContext> {
    const {
      config: {namespace},
    } = context_;

    const enableDebugger = context_.config.debugNodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;

    const subTasks = nodeAliases.map(nodeAlias => {
      const reminder =
        'debugNodeAlias' in context_.config &&
        context_.config.debugNodeAlias === nodeAlias &&
        status !== NodeStatusCodes.FREEZE_COMPLETE
          ? 'Please attach JVM debugger now.  Sleeping for 1 hour, hit ctrl-c once debugging is complete.'
          : '';
      const title = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`;
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

      const subTask = async (context_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>) => {
        if (enableDebugger) {
          await sleep(Duration.ofHours(1));
        }
        context_.config.podRefs[nodeAlias] = await this._checkNetworkNodeActiveness(
          namespace,
          nodeAlias,
          task,
          title,
          status,
          undefined,
          undefined,
          undefined,
          context,
        );
      };

      return {title, task: subTask};
    });

    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  private async _checkNetworkNodeActiveness(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    task: SoloListrTaskWrapper<AnyListrContext>,
    title: string,
    status = NodeStatusCodes.ACTIVE,
    maxAttempts: number = constants.NETWORK_NODE_ACTIVE_MAX_ATTEMPTS,
    delay: number = constants.NETWORK_NODE_ACTIVE_DELAY,
    timeout: number = constants.NETWORK_NODE_ACTIVE_TIMEOUT,
    context?: string,
  ): Promise<PodReference> {
    const podName = Templates.renderNetworkPodName(nodeAlias);
    const podReference = PodReference.of(namespace, podName);
    task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt ${chalk.blueBright(`0/${maxAttempts}`)}`;

    const consensusNodes = this.remoteConfigManager.getConsensusNodes();
    if (!context) {
      context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
    }

    let attempt = 0;
    let success = false;
    while (attempt < maxAttempts) {
      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        task.title = `${title} - status ${chalk.yellow('TIMEOUT')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        controller.abort();
      }, timeout);

      try {
        const response = await this.k8Factory
          .getK8(context)
          .containers()
          .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
          .execContainer([
            'bash',
            '-c',
            String.raw`curl -s http://localhost:9999/metrics | grep platform_PlatformStatus | grep -v \#`,
          ]);

        if (!response) {
          task.title = `${title} - status ${chalk.yellow('UNKNOWN')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloError('empty response'); // Guard
        }

        const statusLine = response.split('\n').find(line => line.startsWith('platform_PlatformStatus'));

        if (!statusLine) {
          task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloError('missing status line'); // Guard
        }

        const statusNumber = Number.parseInt(statusLine.split(' ').pop());

        if (statusNumber === status) {
          task.title = `${title} - status ${chalk.green(NodeStatusEnums[status])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          success = true;
          clearTimeout(timeoutId);
          break;
        } else if (statusNumber === NodeStatusCodes.CATASTROPHIC_FAILURE) {
          task.title = `${title} - status ${chalk.red('CATASTROPHIC_FAILURE')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          break;
        } else if (statusNumber) {
          task.title = `${title} - status ${chalk.yellow(NodeStatusEnums[statusNumber])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        }
        clearTimeout(timeoutId);
      } catch (error) {
        this.logger.debug(
          `${title} : Error in checking node activeness: attempt: ${attempt}/${maxAttempts}: ${JSON.stringify(error)}`,
        );
      }

      attempt++;
      clearTimeout(timeoutId);
      await sleep(Duration.ofMillis(delay));
    }

    if (!success) {
      throw new SoloError(
        `node '${nodeAlias}' is not ${NodeStatusEnums[status]}` +
          `[ attempt = ${chalk.blueBright(`${attempt}/${maxAttempts}`)} ]`,
      );
    }

    await sleep(Duration.ofSeconds(2)); // delaying prevents - gRPC service error

    return podReference;
  }

  /** Return task for check if node proxies are ready */
  private _checkNodesProxiesTask(
    task: SoloListrTaskWrapper<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>,
    nodeAliases: NodeAliases,
  ): SoloListr<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}> {
    const subTasks: SoloListrTask<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>[] = [];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async context_ => {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          const k8 = this.k8Factory.getK8(context);
          await k8
            .pods()
            .waitForReadyStatus(
              context_.config.namespace,
              [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
              constants.NETWORK_PROXY_MAX_ATTEMPTS,
              constants.NETWORK_PROXY_DELAY,
            );
        },
      });
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGossipKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    const self = this;

    return {
      title: 'Generate gossip keys',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks = self.keyManager.taskGenerateGossipKeys(nodeAliases, config.keysDir, config.curDate);
        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {
            collapseSubtasks: false,
            timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
          },
        });
      },
      skip: context_ => !context_.config.generateGossipKeys,
    };
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGrpcTlsKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    const self = this;
    return {
      title: 'Generate gRPC TLS Keys',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks = self.keyManager.taskGenerateTLSKeys(nodeAliases, config.keysDir, config.curDate);
        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
            timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
          },
        });
      },
      skip: context_ => !context_.config.generateTlsKeys,
    };
  }

  public copyGrpcTlsCertificates(): SoloListrTask<NodeAddContext> {
    const self = this;
    return {
      title: 'Copy gRPC TLS Certificates',
      task: (context_, task) =>
        self.certificateManager.buildCopyTlsCertificatesTasks(
          task,
          context_.config.grpcTlsCertificatePath,
          context_.config.grpcWebTlsCertificatePath,
          context_.config.grpcTlsKeyPath,
          context_.config.grpcWebTlsKeyPath,
        ),
      skip: context_ => !context_.config.grpcTlsCertificatePath && !context_.config.grpcWebTlsCertificatePath,
    };
  }

  private async _addStake(
    namespace: NamespaceName,
    accountId: string,
    nodeAlias: NodeAlias,
    stakeAmount: number = HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  ): Promise<void> {
    try {
      const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
      await this.accountManager.loadNodeClient(
        namespace,
        this.remoteConfigManager.getClusterRefs(),
        deploymentName,
        this.configManager.getFlag<boolean>(flags.forcePortForward),
      );
      const client = this.accountManager._nodeClient;
      const treasuryKey = await this.accountManager.getTreasuryAccountKeys(namespace, deploymentName);
      const treasuryPrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey);
      const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deploymentName);
      client.setOperator(treasuryAccountId, treasuryPrivateKey);

      // check balance
      const treasuryBalance = await new AccountBalanceQuery().setAccountId(treasuryAccountId).execute(client);
      this.logger.debug(`Account ${treasuryAccountId} balance: ${treasuryBalance.hbars}`);

      // get some initial balance
      await this.accountManager.transferAmount(treasuryAccountId, accountId, stakeAmount);

      // check balance
      const balance = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
      this.logger.debug(`Account ${accountId} balance: ${balance.hbars}`);

      // Create the transaction
      const transaction = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setStakedNodeId(Templates.nodeIdFromNodeAlias(nodeAlias))
        .freezeWith(client);

      // Sign the transaction with the account's private key
      const signTx = await transaction.sign(treasuryPrivateKey);

      // Submit the transaction to a Hedera network
      const txResponse = await signTx.execute(client);

      // Request the receipt of the transaction
      const receipt = await txResponse.getReceipt(client);

      // Get the transaction status
      const transactionStatus = receipt.status;
      this.logger.debug(`The transaction consensus status is ${transactionStatus.toString()}`);
    } catch (error) {
      throw new SoloError(`Error in adding stake: ${error.message}`, error);
    }
  }

  public prepareUpgradeZip() {
    const self = this;
    return {
      title: 'Prepare upgrade zip file for node upgrade process',
      task: async context_ => {
        const config = context_.config;
        const {upgradeZipFile, deployment} = context_.config;
        if (upgradeZipFile) {
          this.logger.debug(`Using upgrade zip file: ${context_.upgradeZipFile}`);
          context_.upgradeZipFile = upgradeZipFile;
        } else {
          context_.upgradeZipFile = await self._prepareUpgradeZip(config.stagingDir);
        }
        context_.upgradeZipHash = await self._uploadUpgradeZip(context_.upgradeZipFile, config.nodeClient, deployment);
      },
    };
  }

  public loadAdminKey(): SoloListrTask<NodeUpdateContext | NodeUpgradeContext | NodeDeleteContext> {
    return {
      title: 'Load node admin key',
      task: async context_ => {
        const config = context_.config;
        if ((context_ as NodeUpdateContext | NodeDeleteContext).config.nodeAlias) {
          try {
            const context = helpers.extractContextFromConsensusNodes(
              (context_ as NodeUpdateContext | NodeDeleteContext).config.nodeAlias,
              context_.config.consensusNodes,
            );

            // load nodeAdminKey form k8s if exist
            const keyFromK8 = await this.k8Factory
              .getK8(context)
              .secrets()
              .read(
                config.namespace,
                Templates.renderNodeAdminKeyName((context_ as NodeUpdateContext | NodeDeleteContext).config.nodeAlias),
              );
            const privateKey = Base64.decode(keyFromK8.data.privateKey);
            config.adminKey = PrivateKey.fromStringED25519(privateKey);
          } catch (error) {
            this.logger.debug(`Error in loading node admin key: ${error.message}, use default key`);
            config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
          }
        } else {
          config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        }
      },
    };
  }

  public checkExistingNodesStakedAmount(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeUpgradeContext
  > {
    const self = this;
    return {
      title: 'Check existing nodes staked amount',
      task: async context_ => {
        const config = context_.config;

        // Transfer some hbar to the node for staking purpose
        const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap = this.accountManager.getNodeAccountMap(config.existingNodeAliases, deploymentName);
        const treasuryAccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of config.existingNodeAliases) {
          const accountId = accountMap.get(nodeAlias);
          await self.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public sendPrepareUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeUpgradeContext
  > {
    const self = this;
    return {
      title: 'Send prepare upgrade transaction',
      task: async context_ => {
        const {upgradeZipHash} = context_;
        const {nodeClient, freezeAdminPrivateKey, deployment} = context_.config;
        try {
          const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
          const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);

          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(freezeAccountId).execute(nodeClient);
          self.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          // transfer some tiny amount to the freeze admin account
          await self.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 100_000);

          // set operator of freeze transaction as freeze admin account
          nodeClient.setOperator(freezeAccountId, freezeAdminPrivateKey);

          const prepareUpgradeTx: TransactionResponse = await new FreezeTransaction()
            .setFreezeType(FreezeType.PrepareUpgrade)
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const prepareUpgradeReceipt: TransactionReceipt = await prepareUpgradeTx.getReceipt(nodeClient);

          self.logger.debug(
            `sent prepare upgrade transaction [id: ${prepareUpgradeTx.transactionId.toString()}]`,
            prepareUpgradeReceipt.status.toString(),
          );
        } catch (error) {
          throw new SoloError(`Error in prepare upgrade: ${error.message}`, error);
        }
      },
    };
  }

  public sendFreezeUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeUpgradeContext
  > {
    const self = this;
    return {
      title: 'Send freeze upgrade transaction',
      task: async context_ => {
        const {upgradeZipHash} = context_;
        const {freezeAdminPrivateKey, nodeClient, deployment} = context_.config;
        try {
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);

          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(freezeAdminAccountId).execute(nodeClient);
          self.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
          const freezeUpgradeTx = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeUpgrade)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(nodeClient);
          self.logger.debug(
            `Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
            freezeUpgradeReceipt.status.toString(),
          );
        } catch (error) {
          throw new SoloError(`Error in freeze upgrade: ${error.message}`, error);
        }
      },
    };
  }

  public sendFreezeTransaction(): SoloListrTask<NodeFreezeContext> {
    const self = this;
    return {
      title: 'Send freeze only transaction',
      task: async context_ => {
        const {freezeAdminPrivateKey, deployment, namespace} = context_.config;
        try {
          const nodeClient = await this.accountManager.loadNodeClient(
            namespace,
            this.remoteConfigManager.getClusterRefs(),
            deployment,
          );
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
          nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
          const freezeOnlyTransaction = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeOnly)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const freezeOnlyReceipt = await freezeOnlyTransaction.getReceipt(nodeClient);

          self.logger.debug(
            `sent prepare transaction [id: ${freezeOnlyTransaction.transactionId.toString()}]`,
            freezeOnlyReceipt.status.toString(),
          );
        } catch (error) {
          throw new SoloError(`Error in sending freeze transaction: ${error.message}`, error);
        }
      },
    };
  }

  /** Download generated config files and key files from the network node */
  public downloadNodeGeneratedFiles(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeDownloadGeneratedFilesContext
  > {
    const self = this;
    return {
      title: 'Download generated files from an existing node',
      task: async context_ => {
        const config = context_.config;

        // don't try to download from the same node we are deleting, it won't work
        const nodeAlias: NodeAlias =
          (context_ as any).config.nodeAlias === config.existingNodeAliases[0] && config.existingNodeAliases.length > 1
            ? config.existingNodeAliases[1]
            : config.existingNodeAliases[0];

        const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

        const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
        const k8 = self.k8Factory.getK8(context);

        // copy the config.txt file from the node1 upgrade directory
        await k8
          .containers()
          .readByRef(containerReference)
          .copyFrom(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current/config.txt`, config.stagingDir);

        // if directory data/upgrade/current/data/keys does not exist, then use data/upgrade/current
        let keyDirectory = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/keys`;
        if (!(await k8.containers().readByRef(containerReference).hasDir(keyDirectory))) {
          keyDirectory = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
        }
        const signedKeyFiles = (await k8.containers().readByRef(containerReference).listDir(keyDirectory)).filter(
          file => file.name.startsWith(constants.SIGNING_KEY_PREFIX),
        );
        await k8
          .containers()
          .readByRef(containerReference)
          .execContainer([
            'bash',
            '-c',
            `mkdir -p ${constants.HEDERA_HAPI_PATH}/data/keys_backup && cp -r ${keyDirectory} ${constants.HEDERA_HAPI_PATH}/data/keys_backup/`,
          ]);
        for (const signedKeyFile of signedKeyFiles) {
          await k8
            .containers()
            .readByRef(containerReference)
            .copyFrom(`${keyDirectory}/${signedKeyFile.name}`, `${config.keysDir}`);
        }

        if (
          await k8
            .containers()
            .readByRef(containerReference)
            .hasFile(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`)
        ) {
          await k8
            .containers()
            .readByRef(containerReference)
            .copyFrom(
              `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`,
              `${config.stagingDir}/templates`,
            );
        }
      },
    };
  }

  public downloadNodeUpgradeFiles(): SoloListrTask<NodeUpgradeContext> {
    const self = this;
    return {
      title: 'Download upgrade files from an existing node',
      task: async context_ => {
        const config = context_.config;

        const nodeAlias = context_.config.nodeAliases[0];
        const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

        // found all files under ${constants.HEDERA_HAPI_PATH}/data/upgrade/current/
        const upgradeDirectories = [
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/apps`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/libs`,
        ];
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        for (const upgradeDirectory of upgradeDirectories) {
          // check if directory upgradeDirectory exist in root container
          if (
            !(await self.k8Factory.getK8(context).containers().readByRef(containerReference).hasDir(upgradeDirectory))
          ) {
            continue;
          }
          const files = await self.k8Factory
            .getK8(context)
            .containers()
            .readByRef(containerReference)
            .listDir(upgradeDirectory);
          // iterate all files and copy them to the staging directory
          for (const file of files) {
            if (file.name.endsWith('.mf')) {
              continue;
            }
            if (file.directory) {
              continue;
            }
            this.logger.debug(`Copying file: ${file.name}`);
            await self.k8Factory
              .getK8(context)
              .containers()
              .readByRef(containerReference)
              .copyFrom(`${upgradeDirectory}/${file.name}`, `${config.stagingDir}`);
          }
        }
      },
    };
  }

  private taskCheckNetworkNodePods(
    context_: CheckedNodesContext,
    task: SoloListrTaskWrapper<CheckedNodesContext>,
    nodeAliases: NodeAliases,
    maxAttempts?: number,
  ) {
    context_.config.podRefs = {};
    const consensusNodes = context_.config.consensusNodes;

    const subTasks: SoloListrTask<CheckedNodesContext>[] = [];

    const self = this;
    for (const nodeAlias of nodeAliases) {
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeAlias)}`,
        task: async context_ => {
          try {
            context_.config.podRefs[nodeAlias] = await self.checkNetworkNodePod(
              context_.config.namespace,
              nodeAlias,
              maxAttempts,
              undefined,
              context,
            );
          } catch {
            context_.config.skipStop = true;
          }
        },
      });
    }

    // setup the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  /** Check if the network node pod is running */
  private async checkNetworkNodePod(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    maxAttempts: number = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay: number = constants.PODS_RUNNING_DELAY,
    context?: Optional<string>,
  ): Promise<PodReference> {
    nodeAlias = nodeAlias.trim() as NodeAlias;
    const podName = Templates.renderNetworkPodName(nodeAlias);
    const podReference = PodReference.of(namespace, podName);

    try {
      const k8 = this.k8Factory.getK8(context);

      await k8
        .pods()
        .waitForRunningPhase(
          namespace,
          [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
          maxAttempts,
          delay,
        );

      return podReference;
    } catch (error) {
      throw new SoloError(`no pod found for nodeAlias: ${nodeAlias}`, error);
    }
  }

  public identifyExistingNodes(): SoloListrTask<CheckedNodesContext> {
    const self = this;
    return {
      title: 'Identify existing network nodes',
      task: async (context_, task) => {
        const config = context_.config;
        config.existingNodeAliases = [];
        const clusterReferences = this.remoteConfigManager.getClusterRefs();
        config.serviceMap = await self.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );
        for (const networkNodeServices of config.serviceMap.values()) {
          config.existingNodeAliases.push(networkNodeServices.nodeAlias);
        }
        config.allNodeAliases = [...config.existingNodeAliases];
        return self.taskCheckNetworkNodePods(context_, task, config.existingNodeAliases);
      },
    };
  }

  public uploadStateFiles(skip: SkipCheck | boolean) {
    const self = this;
    return {
      title: 'Upload state files network nodes',
      task: async context_ => {
        const config = context_.config;

        const zipFile = config.stateFile;
        self.logger.debug(`zip file: ${zipFile}`);
        for (const nodeAlias of context_.config.nodeAliases) {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
          const k8 = this.k8Factory.getK8(context);
          const podReference = context_.config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          self.logger.debug(`Uploading state files to pod ${podReference.name}`);
          await k8.containers().readByRef(containerReference).copyTo(zipFile, `${constants.HEDERA_HAPI_PATH}/data`);

          self.logger.info(
            `Deleting the previous state files in pod ${podReference.name} directory ${constants.HEDERA_HAPI_PATH}/data/saved`,
          );
          await k8
            .containers()
            .readByRef(containerReference)
            .execContainer(['rm', '-rf', `${constants.HEDERA_HAPI_PATH}/data/saved/*`]);
          await k8
            .containers()
            .readByRef(containerReference)
            .execContainer([
              'tar',
              '-xvf',
              `${constants.HEDERA_HAPI_PATH}/data/${path.basename(zipFile)}`,
              '-C',
              `${constants.HEDERA_HAPI_PATH}/data/saved`,
            ]);
        }
      },
      skip,
    };
  }

  public identifyNetworkPods(maxAttempts?: number) {
    const self = this;
    return {
      title: 'Identify network pods',
      task: (context_, task) => {
        return self.taskCheckNetworkNodePods(context_, task, context_.config.nodeAliases, maxAttempts);
      },
    };
  }

  public fetchPlatformSoftware(
    aliasesField: string,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeRefreshContext | NodeSetupContext> {
    const self = this;
    return {
      title: 'Fetch platform software into network nodes',
      task: (context_, task) => {
        const {podRefs, releaseTag, localBuildPath} = context_.config;

        return localBuildPath === ''
          ? self._fetchPlatformSoftware(
              context_.config[aliasesField],
              podRefs,
              releaseTag,
              task,
              this.platformInstaller,
              context_.config.consensusNodes,
            )
          : self._uploadPlatformSoftware(
              context_.config[aliasesField],
              podRefs,
              task,
              localBuildPath,
              context_.config.consensusNodes,
              releaseTag,
            );
      },
    };
  }

  public populateServiceMap(): SoloListrTask<NodeAddContext | NodeDeleteContext> {
    return {
      title: 'Populate serviceMap',
      task: async context_ => {
        context_.config.serviceMap = await this.accountManager.getNodeServiceMap(
          context_.config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          context_.config.deployment,
        );
        if (!context_.config.serviceMap.has(context_.config.nodeAlias)) {
          return;
        }

        context_.config.podRefs[context_.config.nodeAlias] = PodReference.of(
          context_.config.namespace,
          context_.config.serviceMap.get(context_.config.nodeAlias).nodePodName,
        );
      },
    };
  }

  public setupNetworkNodes(
    nodeAliasesProperty: string,
    isGenesis: boolean,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeRefreshContext> {
    return {
      title: 'Setup network nodes',
      task: async (context_, task) => {
        // @ts-ignore
        if (!context_.config.nodeAliases || context_.config.nodeAliases.length === 0) {
          // @ts-ignore
          context_.config.nodeAliases = helpers.parseNodeAliases(
            // @ts-ignore
            context_.config.nodeAliasesUnparsed,
            this.remoteConfigManager.getConsensusNodes(),
            this.configManager,
          );
        }
        if (isGenesis) {
          await this.generateGenesisNetworkJson(
            context_.config.namespace,
            context_.config.consensusNodes,
            // @ts-ignore
            context_.config.keysDir,
            // @ts-ignore
            context_.config.stagingDir,
            // @ts-ignore
            context_.config.domainNamesMapping,
          );
        }

        // TODO: during `node add` ctx.config.nodeAliases is empty, since ctx.config.nodeAliasesUnparsed is empty
        await this.generateNodeOverridesJson(
          context_.config.namespace,
          // @ts-ignore
          context_.config.nodeAliases,
          // @ts-ignore
          context_.config.stagingDir,
        );

        const consensusNodes = context_.config.consensusNodes;
        const subTasks = [];
        for (const nodeAlias of context_.config[nodeAliasesProperty]) {
          const podReference = context_.config.podRefs[nodeAlias];
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            // @ts-ignore
            task: () => this.platformInstaller.taskSetup(podReference, context_.config.stagingDir, isGenesis, context),
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        });
      },
    };
  }

  // generates the node overrides file.  This file is used to override the address book.  It is useful in cases where
  // there is a hair pinning issue and the node needs to connect to itself via a different address.
  private async generateNodeOverridesJson(
    namespace: NamespaceName,
    nodeAliases: NodeAliases,
    stagingDirectory: string,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );

    const nodeOverridesModel = new NodeOverridesModel(nodeAliases, networkNodeServiceMap);

    const nodeOverridesYaml = PathEx.join(stagingDirectory, constants.NODE_OVERRIDE_FILE);
    fs.writeFileSync(nodeOverridesYaml, nodeOverridesModel.toYAML());
  }

  /**
   * Generate genesis network json file
   * @param namespace - namespace
   * @param consensusNodes - consensus nodes
   * @param keysDirectory - keys directory
   * @param stagingDirectory - staging directory
   * @param domainNamesMapping
   */
  private async generateGenesisNetworkJson(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    keysDirectory: string,
    stagingDirectory: string,
    domainNamesMapping?: Record<NodeAlias, string>,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );

    let adminPublicKeys = [];
    if (this.configManager.getFlag(flags.adminPublicKeys)) {
      adminPublicKeys = splitFlagInput(this.configManager.getFlag(flags.adminPublicKeys));
    } else {
      // set adminPublicKeys as array of constants.GENESIS_KEY with the same size consensus nodes
      adminPublicKeys = Array.from({length: consensusNodes.length}).fill(constants.GENESIS_KEY);
    }
    const genesisNetworkData = await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      this.keyManager,
      this.accountManager,
      keysDirectory,
      networkNodeServiceMap,
      adminPublicKeys,
      domainNamesMapping,
    );

    const genesisNetworkJson = PathEx.join(stagingDirectory, 'genesis-network.json');
    fs.writeFileSync(genesisNetworkJson, genesisNetworkData.toJSON());
  }

  public prepareStagingDirectory(nodeAliasesProperty: string) {
    return {
      title: 'Prepare staging directory',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = config[nodeAliasesProperty];
        const subTasks = [
          {
            title: 'Copy Gossip keys to staging',
            task: async () => {
              this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, nodeAliases);
            },
          },
          {
            title: 'Copy gRPC TLS keys to staging',
            task: async () => {
              for (const nodeAlias of nodeAliases) {
                const tlsKeyFiles = this.keyManager.prepareTLSKeyFilePaths(nodeAlias, config.keysDir);
                this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
              }
            },
          },
        ];
        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        });
      },
    };
  }

  public startNodes(nodeAliasesProperty: string) {
    return {
      title: 'Starting nodes',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = config[nodeAliasesProperty];
        const subTasks = [];

        for (const nodeAlias of nodeAliases) {
          const podReference = config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          subTasks.push({
            title: `Start node: ${chalk.yellow(nodeAlias)}`,
            task: async () => {
              const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
              const k8 = this.k8Factory.getK8(context);
              await k8
                .containers()
                .readByRef(containerReference)
                .execContainer(['systemctl', 'restart', 'network-node']);
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
            timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
          },
        });
      },
    };
  }

  public enablePortForwarding() {
    return {
      title: 'Enable port forwarding for JVM debugger',
      task: async context_ => {
        const context = helpers.extractContextFromConsensusNodes(
          context_.config.debugNodeAlias,
          context_.config.consensusNodes,
        );
        const podReference = PodReference.of(
          context_.config.namespace,
          PodName.of(`network-${context_.config.debugNodeAlias}-0`),
        );
        this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podReference.name}`);
        await this.k8Factory
          .getK8(context)
          .pods()
          .readByReference(podReference)
          .portForward(constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT);
      },
      skip: context_ => !context_.config.debugNodeAlias,
    };
  }

  public checkAllNodesAreActive(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check all nodes are ACTIVE',
      task: (context_, task) => {
        return this._checkNodeActivenessTask(context_, task, context_.config[nodeAliasesProperty]);
      },
    };
  }

  public checkAllNodesAreFrozen(nodeAliasesProperty: string) {
    return {
      title: 'Check all nodes are FROZEN',
      task: (context_, task) => {
        return this._checkNodeActivenessTask(
          context_,
          task,
          context_.config[nodeAliasesProperty],
          NodeStatusCodes.FREEZE_COMPLETE,
        );
      },
    };
  }

  public checkNodeProxiesAreActive(): SoloListrTask<NodeStartContext | NodeRefreshContext | NodeRestartContext> {
    return {
      title: 'Check node proxies are ACTIVE',
      task: (context_, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.nodeAliases) as SoloListr<AnyListrContext>;
      }, // NodeStartConfigClass NodeRefreshContext
      skip: async context_ =>
        (context_.config as NodeStartConfigClass | NodeRefreshConfigClass).app !== '' &&
        (context_.config as NodeStartConfigClass | NodeRefreshConfigClass).app !== constants.HEDERA_APP_NAME,
    };
  }

  public checkAllNodeProxiesAreActive(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeUpgradeContext
  > {
    return {
      title: 'Check all node proxies are ACTIVE',
      task: (context_, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.allNodeAliases) as SoloListr<AnyListrContext>;
      },
    };
  }

  // Update account manager and transfer hbar for staking purpose
  public triggerStakeWeightCalculate<T extends {config: AnyObject}>(
    transactionType: NodeSubcommandType,
  ): SoloListrTask<T> {
    const self = this;
    return {
      title: 'Trigger stake weight calculate',
      task: async context_ => {
        const config = context_.config;
        self.logger.info(
          'sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate',
        );
        await sleep(Duration.ofSeconds(60));
        const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap = this.accountManager.getNodeAccountMap(config.allNodeAliases, deploymentName);
        let skipNodeAlias: NodeAlias;

        switch (transactionType) {
          case NodeSubcommandType.ADD: {
            break;
          }
          case NodeSubcommandType.UPDATE: {
            if (config.newAccountNumber) {
              // update map with current account ids
              accountMap.set(config.nodeAlias, config.newAccountNumber);
              skipNodeAlias = config.nodeAlias;
            }
            break;
          }
          case NodeSubcommandType.DELETE: {
            if (config.nodeAlias) {
              accountMap.delete(config.nodeAlias);
              skipNodeAlias = config.nodeAlias;
            }
          }
        }

        config.nodeClient = await self.accountManager.refreshNodeClient(
          config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          skipNodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
        );

        // send some write transactions to invoke the handler that will trigger the stake weight recalculate
        const treasuryAccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of accountMap.keys()) {
          const accountId = accountMap.get(nodeAlias);
          config.nodeClient.setOperator(treasuryAccountId, config.treasuryKey);
          await self.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public addNodeStakes(): SoloListrTask<NodeStartContext> {
    const self = this;
    return {
      title: 'Add node stakes',
      task: (context_, task): SoloListr<NodeStartContext> | void => {
        if (context_.config.app === '' || context_.config.app === constants.HEDERA_APP_NAME) {
          const subTasks: SoloListrTask<NodeStartContext>[] = [];

          const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
          const accountMap = this.accountManager.getNodeAccountMap(context_.config.nodeAliases, deploymentName);
          // @ts-expect-error - TS2339: Property stakeAmount does not exist on type NodeStartConfigClass
          // TODO: 'ctx.config.stakeAmount' is never initialized in the config
          const stakeAmountParsed = context_.config.stakeAmount ? splitFlagInput(context_.config.stakeAmount) : [];
          let nodeIndex = 0;
          for (const nodeAlias of context_.config.nodeAliases) {
            const accountId = accountMap.get(nodeAlias);
            const stakeAmount =
              stakeAmountParsed.length > 0 ? stakeAmountParsed[nodeIndex] : HEDERA_NODE_DEFAULT_STAKE_AMOUNT;
            subTasks.push({
              title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await self._addStake(context_.config.namespace, accountId, nodeAlias, +stakeAmount),
            });
            nodeIndex++;
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        }
      },
    };
  }

  public stakeNewNode(): SoloListrTask<NodeAddContext> {
    const self = this;
    return {
      title: 'Stake new node',
      task: async context_ => {
        await self.accountManager.refreshNodeClient(
          context_.config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          context_.config.nodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
          this.configManager.getFlag<boolean>(flags.forcePortForward),
        );
        await this._addStake(context_.config.namespace, context_.newNode.accountId, context_.config.nodeAlias);
      },
    };
  }

  public stopNodes(
    nodeAliasesProperty: string,
  ): SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDeleteContext> {
    return {
      title: 'Stopping nodes',
      task: async (context_, task) => {
        const subTasks: SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDeleteContext>[] = [];

        if (!(context_.config as CheckedNodesConfigClass).skipStop) {
          await this.accountManager.close();
          for (const nodeAlias of context_.config[nodeAliasesProperty]) {
            const podReference = (context_.config as CheckedNodesConfigClass).podRefs[nodeAlias];
            const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
            const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () =>
                await this.k8Factory
                  .getK8(context)
                  .containers()
                  .readByRef(containerReference)
                  .execContainer('systemctl stop network-node'),
            });
          }
        }

        // setup the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
            timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
          },
        });
      },
    };
  }

  public finalize(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Finalize',
      task: () => {
        // reset flags so that keys are not regenerated later
        this.configManager.setFlag(flags.generateGossipKeys, false);
        this.configManager.setFlag(flags.generateTlsKeys, false);
      },
    };
  }

  public dumpNetworkNodesSaveState(): SoloListrTask<NodeRefreshContext> {
    return {
      title: 'Dump network nodes saved state',
      task: (context_, task) => {
        const config: NodeRefreshConfigClass = context_.config;
        const subTasks: SoloListrTask<NodeRefreshContext>[] = [];

        for (const nodeAlias of config.nodeAliases) {
          const podReference = config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: async () =>
              await this.k8Factory
                .getK8(context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`]),
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
    };
  }

  public getNodeLogsAndConfigs(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDeleteContext | NodeUpgradeContext
  > {
    return {
      title: 'Get node logs and configs',
      task: async context_ => {
        await container
          .resolve<NetworkNodes>(NetworkNodes)
          .getLogs(context_.config.namespace, context_.config.contexts);
      },
    };
  }

  public getNodeStateFiles(): SoloListrTask<NodeStatesContext> {
    return {
      title: 'Get node states',
      task: async context_ => {
        for (const nodeAlias of context_.config.nodeAliases) {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          await container
            .resolve<NetworkNodes>(NetworkNodes)
            .getStatesFromPod(context_.config.namespace, nodeAlias, context);
        }
      },
    };
  }

  public checkPVCsEnabled(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check that PVCs are enabled',
      task: () => {
        if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
          throw new SoloError('PVCs are not enabled. Please enable PVCs before adding a node');
        }
      },
    };
  }

  public determineNewNodeAccountNumber(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Determine new node account number',
      task: context_ => {
        const config: NodeAddConfigClass = context_.config;
        const values = {hedera: {nodes: []}};
        let maxNumber: Long = Long.fromNumber(0);

        let lastNodeAlias: NodeAlias = DEFAULT_NETWORK_NODE_NAME;

        for (const networkNodeServices of config.serviceMap.values()) {
          values.hedera.nodes.push({
            accountId: networkNodeServices.accountId,
            name: networkNodeServices.nodeAlias,
            nodeId: networkNodeServices.nodeId,
          });
          maxNumber = Long.fromNumber(
            Math.max(maxNumber.toNumber(), AccountId.fromString(networkNodeServices.accountId).num.toNumber()),
          );
          lastNodeAlias = networkNodeServices.nodeAlias;
        }

        const lastNodeIdMatch = lastNodeAlias.match(/\d+$/);
        if (lastNodeIdMatch.length > 0) {
          const incremented = Number.parseInt(lastNodeIdMatch[0]) + 1;
          lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString()) as NodeAlias;
        }

        const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        context_.maxNum = maxNumber.add(1);
        context_.newNode = {
          accountId: this.accountManager.getAccountIdByNumber(deploymentName, context_.maxNum).toString(),
          name: lastNodeAlias,
        };
        config.nodeAlias = lastNodeAlias as NodeAlias;
        config.allNodeAliases.push(lastNodeAlias as NodeAlias);
      },
    };
  }

  public generateGossipKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGossipKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGossipKey(): SoloListrTask<NodeAddContext> {
    return this._generateGossipKeys(false) as SoloListrTask<NodeAddContext>;
  }

  public generateGrpcTlsKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGrpcTlsKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGrpcTlsKey(): SoloListrTask<NodeAddContext> {
    return this._generateGrpcTlsKeys(false) as SoloListrTask<NodeAddContext>;
  }

  public loadSigningKeyCertificate(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Load signing key certificate',
      task: context_ => {
        const config = context_.config;
        const signingCertFile = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
        const signingCertFullPath = PathEx.joinWithRealPath(config.keysDir, signingCertFile);
        context_.signingCertDer = this.keyManager.getDerFromPemCertificate(signingCertFullPath);
      },
    };
  }

  public computeMTLSCertificateHash(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Compute mTLS certificate hash',
      task: context_ => {
        const config = context_.config;
        const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
        const tlsCertFullPath = PathEx.joinWithRealPath(config.keysDir, tlsCertFile);
        const tlsCertDer = this.keyManager.getDerFromPemCertificate(tlsCertFullPath);
        context_.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
      },
    };
  }

  public prepareGossipEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare gossip endpoints',
      task: context_ => {
        const config = context_.config;
        let endpoints = [];
        if (config.gossipEndpoints) {
          endpoints = splitFlagInput(config.gossipEndpoints);
        } else {
          if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
            throw new SoloError(`--gossip-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`);
          }

          endpoints = [
            `${helpers.getInternalAddress(config.releaseTag, config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
            `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
          ];
        }

        context_.gossipEndpoints = prepareEndpoints(
          config.endpointType,
          endpoints,
          constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
        );
      },
    };
  }

  public refreshNodeList(): SoloListrTask<NodeDeleteContext> {
    return {
      title: 'Refresh node alias list',
      task: context_ => {
        context_.config.allNodeAliases = context_.config.existingNodeAliases.filter(
          (nodeAlias: NodeAlias) => nodeAlias !== context_.config.nodeAlias,
        );

        context_.config.refreshedConsensusNodes = context_.config.consensusNodes.filter(
          (consensusNode: ConsensusNode) => consensusNode.name !== context_.config.nodeAlias,
        );
      },
    };
  }

  public prepareGrpcServiceEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare grpc service endpoints',
      task: context_ => {
        const config = context_.config;
        let endpoints = [];

        if (config.grpcEndpoints) {
          endpoints = splitFlagInput(config.grpcEndpoints);
        } else {
          if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
            throw new SoloError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`);
          }

          endpoints = [
            `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
          ];
        }

        context_.grpcServiceEndpoints = prepareEndpoints(
          config.endpointType,
          endpoints,
          constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
        );
      },
    };
  }

  public sendNodeUpdateTransaction(): SoloListrTask<NodeUpdateContext> {
    const self = this;
    return {
      title: 'Send node update transaction',
      task: async context_ => {
        const config = context_.config;

        const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
        self.logger.info(`nodeId: ${nodeId}, config.newAccountNumber: ${config.newAccountNumber}`);

        if (config.existingNodeAliases.length > 1) {
          config.nodeClient = await self.accountManager.refreshNodeClient(
            config.namespace,
            this.remoteConfigManager.getClusterRefs(),
            config.nodeAlias,
            this.configManager.getFlag<DeploymentName>(flags.deployment),
          );
        }

        try {
          let nodeUpdateTx = new NodeUpdateTransaction().setNodeId(new Long(nodeId));

          if (config.tlsPublicKey && config.tlsPrivateKey) {
            self.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`);
            const tlsCertDer = self.keyManager.getDerFromPemCertificate(config.tlsPublicKey);
            const tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
            nodeUpdateTx = nodeUpdateTx.setCertificateHash(tlsCertHash);

            const publicKeyFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
            const privateKeyFile = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias);
            renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir, self.logger);
            renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir, self.logger);
          }

          if (config.gossipPublicKey && config.gossipPrivateKey) {
            self.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`);
            const signingCertDer = self.keyManager.getDerFromPemCertificate(config.gossipPublicKey);
            nodeUpdateTx = nodeUpdateTx.setGossipCaCertificate(signingCertDer);

            const publicKeyFile = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
            const privateKeyFile = Templates.renderGossipPemPrivateKeyFile(config.nodeAlias);
            renameAndCopyFile(config.gossipPublicKey, publicKeyFile, config.keysDir, self.logger);
            renameAndCopyFile(config.gossipPrivateKey, privateKeyFile, config.keysDir, self.logger);
          }

          if (config.newAccountNumber) {
            nodeUpdateTx = nodeUpdateTx.setAccountId(config.newAccountNumber);
          }

          let parsedNewKey: PrivateKey;
          if (config.newAdminKey) {
            parsedNewKey = PrivateKey.fromStringED25519(config.newAdminKey.toString());
            nodeUpdateTx = nodeUpdateTx.setAdminKey(parsedNewKey.publicKey);
          }
          nodeUpdateTx = nodeUpdateTx.freezeWith(config.nodeClient);

          // config.adminKey contains the original key, needed to sign the transaction
          if (config.newAdminKey) {
            nodeUpdateTx = await nodeUpdateTx.sign(parsedNewKey);
          }
          const signedTx = await nodeUpdateTx.sign(config.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient);
          self.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);
        } catch (error) {
          throw new SoloError(`Error updating node to network: ${error.message}`, error);
        }
      },
    };
  }

  public copyNodeKeysToSecrets(
    nodeListOverride?: string,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext> {
    return {
      title: 'Copy node keys to secrets',
      task: (context_, task) => {
        const subTasks = this.platformInstaller.copyNodeKeys(
          context_.config.stagingDir,
          nodeListOverride ? context_.config[nodeListOverride] : context_.config.consensusNodes,
          context_.config.contexts,
        );

        // set up the sub-tasks for copying node keys to staging directory
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        });
      },
    };
  }

  public updateChartWithConfigMap(
    title: string,
    transactionType: NodeSubcommandType,
    skip: SkipCheck | boolean = false,
  ): SoloListrTask<NodeDeleteContext | NodeAddContext | NodeUpdateContext> {
    const self = this;
    return {
      title,
      task: async context_ => {
        // Prepare parameter and update the network node chart
        const config = context_.config;
        const consensusNodes = context_.config.consensusNodes as ConsensusNode[];
        const clusterReferences = this.remoteConfigManager.getClusterRefs();

        // Make sure valuesArgMap is initialized with empty strings
        const valuesArgumentMap: Record<ClusterReference, string> = {};
        for (const clusterReference of Object.keys(clusterReferences)) {
          valuesArgumentMap[clusterReference] = '';
        }

        if (!config.serviceMap) {
          config.serviceMap = await self.accountManager.getNodeServiceMap(
            config.namespace,
            clusterReferences,
            config.deployment,
          );
        }

        let maxNodeId = 0;
        for (const nodeAlias of config.existingNodeAliases) {
          const nodeId = config.serviceMap.get(nodeAlias).nodeId;
          maxNodeId = Math.max(+nodeId, maxNodeId);
        }

        const nodeId = maxNodeId + 1;

        const clusterNodeIndexMap: Record<ClusterReference, Record<NodeId, /* index in the chart -> */ number>> = {};

        for (const clusterReference of Object.keys(clusterReferences)) {
          clusterNodeIndexMap[clusterReference] = {};

          for (const [index, node] of consensusNodes
            .filter(node => node.cluster === clusterReference)
            .sort((a, b) => a.nodeId - b.nodeId)
            .entries()) {
            clusterNodeIndexMap[clusterReference][node.nodeId] = index;
          }
        }

        switch (transactionType) {
          case NodeSubcommandType.UPDATE: {
            this.prepareValuesArgForNodeUpdate(
              consensusNodes,
              valuesArgumentMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeUpdateConfigClass).newAccountNumber,
              config.nodeAlias,
            );
            break;
          }
          case NodeSubcommandType.DELETE: {
            this.prepareValuesArgForNodeDelete(
              consensusNodes,
              valuesArgumentMap,
              nodeId,
              config.nodeAlias,
              config.serviceMap,
              clusterNodeIndexMap,
            );
            break;
          }
          case NodeSubcommandType.ADD: {
            this.prepareValuesArgForNodeAdd(
              consensusNodes,
              valuesArgumentMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeAddConfigClass).clusterRef,
              nodeId,
              config.nodeAlias,
              (context_ as NodeAddContext).newNode,
              config as NodeAddConfigClass,
            );
            break;
          }
        }

        // Add profile values files
        const profileValuesFile = await self.profileManager.prepareValuesForNodeTransaction(
          PathEx.joinWithRealPath(config.stagingDir, 'config.txt'),
          PathEx.joinWithRealPath(config.stagingDir, 'templates', 'application.properties'),
        );

        if (profileValuesFile) {
          const valuesFiles: Record<ClusterReference, string> = BaseCommand.prepareValuesFilesMap(
            clusterReferences,
            undefined, // do not trigger of adding default value file for chart upgrade due to node add or delete
            profileValuesFile,
            (config as any).valuesFile,
          );

          for (const clusterReference of Object.keys(valuesFiles)) {
            valuesArgumentMap[clusterReference] += valuesFiles[clusterReference];
            this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
              valuesArg: valuesArgumentMap,
            });
          }
        }
        // Add Debug options
        const consensusNode = consensusNodes.find(node => node.name === config.debugNodeAlias);
        const clusterReference = consensusNode
          ? consensusNode.cluster
          : this.k8Factory.default().clusters().readCurrent();

        valuesArgumentMap[clusterReference] = addDebugOptions(
          valuesArgumentMap[clusterReference],
          config.debugNodeAlias,
        );

        // Update all charts
        await Promise.all(
          Object.keys(clusterReferences).map(async clusterReference => {
            const valuesArguments = valuesArgumentMap[clusterReference];
            const context = this.localConfig.clusterRefs[clusterReference];

            await self.chartManager.upgrade(
              config.namespace,
              constants.SOLO_DEPLOYMENT_CHART,
              constants.SOLO_DEPLOYMENT_CHART,
              context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
              config.soloChartVersion,
              valuesArguments,
              context,
            );
            showVersionBanner(self.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');
          }),
        );
      },
      skip,
    };
  }

  /**
   * Builds the values args for update:
   * - Updates the selected node
   * - Keep the rest the same
   */
  private prepareValuesArgForNodeUpdate(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReference, string>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReference, Record<NodeId, /* index in the chart -> */ number>>,
    newAccountNumber: string,
    nodeAlias: NodeAlias,
  ): void {
    for (const consensusNode of consensusNodes) {
      const clusterReference = consensusNode.cluster;
      const index = clusterNodeIndexMap[clusterReference][consensusNode.nodeId];

      // for the case of updating node, use new account number for this node id
      if (newAccountNumber && consensusNode.name === nodeAlias) {
        valuesArgumentMap[clusterReference] +=
          ` --set "hedera.nodes[${index}].accountId=${newAccountNumber}"` +
          ` --set "hedera.nodes[${index}].name=${nodeAlias}"` +
          ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}"`;
      }

      // Populate the values for the rest
      else {
        valuesArgumentMap[clusterReference] +=
          ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(consensusNode.name).accountId}"` +
          ` --set "hedera.nodes[${index}].name=${consensusNode.name}"` +
          ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}"`;
      }
    }
  }

  /**
   * Builds the values args for add:
   * - Adds the new node
   * - Keeps the rest the same
   */
  private prepareValuesArgForNodeAdd(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReference, string>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReference, Record<NodeId, /* index in the chart -> */ number>>,
    clusterReference: ClusterReference,
    nodeId: NodeId,
    nodeAlias: NodeAlias,
    newNode: {accountId: string; name: string},
    config: {
      haproxyIps?: string;
      haproxyIpsParsed?: Record<NodeAlias, IP>;
      envoyIps?: string;
      envoyIpsParsed?: Record<NodeAlias, IP>;
    },
  ): void {
    // Add existing nodes
    for (const node of consensusNodes) {
      if (node.name === nodeAlias) {
        continue;
      }
      const index = clusterNodeIndexMap[clusterReference][node.nodeId];

      valuesArgumentMap[clusterReference] +=
        ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(node.name).accountId}"` +
        ` --set "hedera.nodes[${index}].name=${node.name}"` +
        ` --set "hedera.nodes[${index}].nodeId=${node.nodeId}"`;
    }

    // Add new node
    const index = clusterNodeIndexMap[clusterReference][nodeId];
    valuesArgumentMap[clusterReference] +=
      ` --set "hedera.nodes[${index}].accountId=${newNode.accountId}"` +
      ` --set "hedera.nodes[${index}].name=${newNode.name}"` +
      ` --set "hedera.nodes[${index}].nodeId=${nodeId}" `;

    // Set static IPs for HAProxy
    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
      const ip: string = config.haproxyIpsParsed?.[nodeAlias];
      if (ip) {
        valuesArgumentMap[clusterReference] += ` --set "hedera.nodes[${index}].haproxyStaticIP=${ip}"`;
      }
    }

    // Set static IPs for Envoy Proxy
    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
      const ip: string = config.envoyIpsParsed?.[nodeAlias];
      if (ip) {
        valuesArgumentMap[clusterReference] += ` --set "hedera.nodes[${index}].envoyProxyStaticIP=${ip}"`;
      }
    }
  }

  /**
   * Builds the values args for delete:
   * - Remove the specified node
   * - Keeps the rest the same
   */
  private prepareValuesArgForNodeDelete(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReference, string>,
    nodeId: NodeId,
    nodeAlias: NodeAlias,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReference, Record<NodeId, /* index in the chart -> */ number>>,
  ): void {
    for (const consensusNode of consensusNodes) {
      const clusterReference: ClusterReference = consensusNode.cluster;

      // The index inside the chart
      const index = clusterNodeIndexMap[clusterReference][consensusNode.nodeId];

      // For nodes that are not being deleted
      if (consensusNode.nodeId !== nodeId) {
        valuesArgumentMap[clusterReference] +=
          ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(consensusNode.name).accountId}"` +
          ` --set "hedera.nodes[${index}].name=${consensusNode.name}"` +
          ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}"`;
      }

      // When deleting node
      else if (consensusNode.nodeId === nodeId) {
        valuesArgumentMap[clusterReference] +=
          ` --set "hedera.nodes[${index}].accountId=${IGNORED_NODE_ACCOUNT_ID}"` +
          ` --set "hedera.nodes[${index}].name=${consensusNode.name}"` +
          ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}" `;
      }
    }

    // now remove the deleted node from the serviceMap
    serviceMap.delete(nodeAlias);
  }

  public saveContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext) => AnyObject,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext> {
    return {
      title: 'Save context data',
      task: context_ => {
        const outputDirectory = argv[flags.outputDir.name];
        if (!outputDirectory) {
          throw new SoloError(
            `Path to export context data not specified. Please set a value for --${flags.outputDir.name}`,
          );
        }

        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }
        const exportedContext = parser(context_);
        fs.writeFileSync(PathEx.join(outputDirectory, targetFile), JSON.stringify(exportedContext));
      },
    };
  }

  public loadContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext, contextData: AnyObject) => void,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Load context data',
      task: context_ => {
        const inputDirectory = argv[flags.inputDir.name];
        if (!inputDirectory) {
          throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`);
        }

        // @ts-expect-error - TS2345
        const contextData = JSON.parse(fs.readFileSync(PathEx.joinWithRealPath(inputDirectory, targetFile)));
        parser(context_, contextData);
      },
    };
  }

  public killNodes(): SoloListrTask<NodeDeleteContext | NodeAddContext> {
    return {
      title: 'Kill nodes',
      task: async context_ => {
        const config = context_.config;
        for (const service of config.serviceMap.values()) {
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }
      },
    };
  }

  public killNodesAndUpdateConfigMap(): SoloListrTask<NodeUpdateContext> {
    return {
      title: 'Kill nodes to pick up updated configMaps',
      task: async context_ => {
        const config = context_.config;
        const clusterReferences = this.remoteConfigManager.getClusterRefs();
        // the updated node will have a new pod ID if its account ID changed which is a label
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        for (const service of config.serviceMap.values()) {
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // again, the pod names will change after the pods are killed
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        config.podRefs = {};
        for (const service of config.serviceMap.values()) {
          config.podRefs[service.nodeAlias] = PodReference.of(service.namespace, service.nodePodName);
        }
      },
    };
  }

  public checkNodePodsAreRunning(): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext> {
    return {
      title: 'Check node pods are running',
      task: (context_, task) => {
        const config = context_.config;
        const subTasks: SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDeleteContext>[] = [];

        for (const nodeAlias of config.allNodeAliases) {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          subTasks.push({
            title: `Check Node: ${chalk.yellow(nodeAlias)}`,
            task: async () =>
              await this.k8Factory
                .getK8(context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                ), // timeout 15 minutes
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
    };
  }

  public sleep(title: string, milliseconds: number): SoloListrTask<AnyListrContext> {
    return {
      title,
      task: async () => {
        await sleep(Duration.ofMillis(milliseconds));
      },
    };
  }

  public downloadLastState(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Download last state from an existing node',
      task: async context_ => {
        const config = context_.config;
        const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0]);
        const podReference = PodReference.of(config.namespace, node1FullyQualifiedPodName);
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`;

        const context = helpers.extractContextFromConsensusNodes(
          config.existingNodeAliases[0],
          context_.config.consensusNodes,
        );

        const k8 = this.k8Factory.getK8(context);
        const container = await k8.containers().readByRef(containerReference);

        const archiveCommand = (await requiresJavaSveFix(container))
          ? 'dnf install zip -y && cd "${states[0]}" && zip -r "${states[0]}.zip" . && cd ../ && mv "${states[0]}/${states[0]}.zip" "${states[0]}.zip"'
          : 'jar cf "${states[0]}.zip" -C "${states[0]}" .';

        // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
        const zipFileName = await container.execContainer([
          'bash',
          '-c',
          `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && ${archiveCommand} && echo -n \${states[0]}.zip`,
        ]);

        await k8
          .containers()
          .readByRef(containerReference)
          .copyFrom(`${upgradeDirectory}/${zipFileName}`, config.stagingDir);
        config.lastStateZipPath = PathEx.joinWithRealPath(config.stagingDir, zipFileName);
      },
    };
  }

  public uploadStateToNewNode(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Upload last saved state to new network node',
      task: async context_ => {
        const config = context_.config;
        const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeAlias);
        const podReference = PodReference.of(config.namespace, newNodeFullyQualifiedPodName);
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
        const savedStateDirectory = config.lastStateZipPath.match(/\/(\d+)\.zip$/)[1];
        const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDirectory}`;

        const context = helpers.extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
        const k8 = this.k8Factory.getK8(context);

        const container = k8.containers().readByRef(containerReference);

        await container.execContainer(['bash', '-c', `mkdir -p ${savedStatePath}`]);
        await k8.containers().readByRef(containerReference).copyTo(config.lastStateZipPath, savedStatePath);

        await this.platformInstaller.setPathPermission(
          podReference,
          constants.HEDERA_HAPI_PATH,
          undefined,
          undefined,
          undefined,
          context,
        );

        const extractCommand = (await requiresJavaSveFix(container))
          ? `unzip ${path.basename(config.lastStateZipPath)}`
          : `jar xf ${path.basename(config.lastStateZipPath)}`;

        await k8
          .containers()
          .readByRef(containerReference)
          .execContainer([
            'bash',
            '-c',
            `cd ${savedStatePath} && ${extractCommand} && rm -f ${path.basename(config.lastStateZipPath)}`,
          ]);
      },
    };
  }

  public sendNodeDeleteTransaction(): SoloListrTask<NodeDeleteContext> {
    return {
      title: 'Send node delete transaction',
      task: async context_ => {
        const config: NodeDeleteConfigClass = context_.config;

        try {
          const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
          const accountMap = this.accountManager.getNodeAccountMap(config.existingNodeAliases, deploymentName);
          const deleteAccountId = accountMap.get(config.nodeAlias);
          this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`);
          const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
          const nodeDeleteTx = new NodeDeleteTransaction().setNodeId(new Long(nodeId)).freezeWith(config.nodeClient);

          const signedTx = await nodeDeleteTx.sign(config.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient);

          this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);
        } catch (error) {
          throw new SoloError(`Error deleting node from network: ${error.message}`, error);
        }
      },
    };
  }

  public sendNodeCreateTransaction(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Send node create transaction',
      task: async context_ => {
        const config: NodeAddConfigClass = context_.config;

        try {
          const nodeCreateTx = new NodeCreateTransaction()
            .setAccountId(context_.newNode.accountId)
            .setGossipEndpoints(context_.gossipEndpoints)
            .setServiceEndpoints(context_.grpcServiceEndpoints)
            .setGossipCaCertificate(context_.signingCertDer)
            .setCertificateHash(context_.tlsCertHash)
            .setAdminKey(context_.adminKey.publicKey)
            .freezeWith(config.nodeClient);
          const signedTx = await nodeCreateTx.sign(context_.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeCreateReceipt = await txResp.getReceipt(config.nodeClient);
          this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`);
        } catch (error) {
          throw new SoloError(`Error adding node to network: ${error.message}`, error);
        }
      },
    };
  }

  public initialize(
    argv: ArgvStruct,
    configInit: ConfigBuilder,
    lease: Lock | null,
    shouldLoadNodeClient: boolean = true,
  ): SoloListrTask<AnyListrContext> {
    const {required, optional} = argv;
    argv.flags = [...required, ...optional];

    return {
      title: 'Initialize',
      task: async (context_, task): Promise<SoloListr<AnyListrContext> | void> => {
        if (argv[flags.devMode.name]) {
          this.logger.setDevMode(true);
        }

        this.configManager.update(argv);

        // disable the prompts that we don't want to prompt the user for
        flags.disablePrompts(optional);

        const flagsToPrompt = [];
        for (const pFlag of required) {
          if (argv[pFlag.name] === undefined) {
            flagsToPrompt.push(pFlag);
          }
        }

        await this.configManager.executePrompt(task, flagsToPrompt);

        const config = await configInit(argv, context_, task, shouldLoadNodeClient);
        context_.config = config;
        config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
        config.contexts = this.remoteConfigManager.getContexts();

        for (const flag of required) {
          if (config[flag.constName] === undefined) {
            throw new MissingArgumentError(`No value set for required flag: ${flag.name}`, flag.name);
          }
        }

        this.logger.debug('Initialized config', {config});

        if (lease) {
          return ListrLock.newAcquireLockTask(lease, task);
        }
      },
    };
  }

  public addNewConsensusNodeToRemoteConfig(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Add new node to remote config',
      task: async (context_, task) => {
        const nodeAlias = context_.config.nodeAlias;
        const namespace: NamespaceNameAsString = context_.config.namespace.name;
        const clusterReference = context_.config.clusterRef;
        const context = this.localConfig.clusterRefs[clusterReference];

        task.title += `: ${nodeAlias}`;

        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.add(
            new ConsensusNodeComponent(
              nodeAlias,
              clusterReference,
              namespace,
              ConsensusNodeStates.STARTED,
              Templates.nodeIdFromNodeAlias(nodeAlias),
            ),
          );

          remoteConfig.components.add(new EnvoyProxyComponent(`envoy-proxy-${nodeAlias}`, clusterReference, namespace));

          remoteConfig.components.add(new HaProxyComponent(`haproxy-${nodeAlias}`, clusterReference, namespace));
        });

        context_.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

        // if the consensusNodes does not contain the nodeAlias then add it
        if (!context_.config.consensusNodes.some((node: ConsensusNode) => node.name === nodeAlias)) {
          const cluster = this.remoteConfigManager.clusters[clusterReference];

          context_.config.consensusNodes.push(
            new ConsensusNode(
              nodeAlias,
              Templates.nodeIdFromNodeAlias(nodeAlias),
              namespace,
              clusterReference,
              context,
              cluster.dnsBaseDomain,
              cluster.dnsConsensusNodePattern,
              Templates.renderConsensusNodeFullyQualifiedDomainName(
                nodeAlias,
                Templates.nodeIdFromNodeAlias(nodeAlias),
                namespace,
                clusterReference,
                cluster.dnsBaseDomain,
                cluster.dnsConsensusNodePattern,
              ),
            ),
          );
        }
      },
    };
  }
}
