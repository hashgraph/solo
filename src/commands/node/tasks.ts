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
  FREEZE_ADMIN_ACCOUNT,
  HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  IGNORED_NODE_ACCOUNT_ID,
  TREASURY_ACCOUNT_ID,
} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import {Task} from '../../core/task.js';
import {
  AccountBalanceQuery,
  AccountId,
  AccountUpdateTransaction,
  type Client,
  FileAppendTransaction,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType,
  Long,
  NodeCreateTransaction,
  NodeDeleteTransaction,
  NodeUpdateTransaction,
  PrivateKey,
  Timestamp,
} from '@hashgraph/sdk';
import {SoloError} from '../../core/errors/solo-error.js';
import {MissingArgumentError} from '../../core/errors/missing-argument-error.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as helpers from '../../core/helpers.js';
import {
  addDebugOptions,
  getNodeAccountMap,
  prepareEndpoints,
  renameAndCopyFile,
  showVersionBanner,
  sleep,
  splitFlagInput,
} from '../../core/helpers.js';
import chalk from 'chalk';
import {Flags as flags} from '../flags.js';
import {type SoloLogger} from '../../core/logging.js';
import {
  type AnyListrContext,
  type AnyObject, ArgvStruct,
  type ConfigBuilder,
  type NodeAlias,
  type NodeAliases,
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
import {PodRef} from '../../integration/kube/resources/pod/pod-ref.js';
import {ContainerRef} from '../../integration/kube/resources/container/container-ref.js';
import {NetworkNodes} from '../../core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {type Optional, SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../types/index.js';
import {type ClusterRef, type DeploymentName, type NamespaceNameAsString} from '../../core/config/remote/types.js';
import {inject, injectable} from 'tsyringe-neo';
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
import {type NetworkNodeServices} from '../../core/network-node-services.js';
import {HEDERA_PLATFORM_VERSION} from '../../../version.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type Listr} from 'listr2';
import {PathEx} from '../../business/utils/path-ex.js';
import {type NodeDeleteConfigClass} from './config-interfaces/node-delete-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {NodeDeleteContext} from './config-interfaces/node-delete-context.js';

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

  private async _prepareUpgradeZip(stagingDir: string): Promise<string> {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper = new Zippy(this.logger);
    const upgradeConfigDir = PathEx.join(stagingDir, 'mock-upgrade', 'data', 'config');
    if (!fs.existsSync(upgradeConfigDir)) {
      fs.mkdirSync(upgradeConfigDir, {recursive: true});
    }

    // bump field hedera.config.version
    const fileBytes = fs.readFileSync(PathEx.joinWithRealPath(stagingDir, 'templates', 'application.properties'));
    const lines = fileBytes.toString().split('\n');
    const newLines = [];
    for (let line of lines) {
      line = line.trim();
      const parts = line.split('=');
      if (parts.length === 2) {
        if (parts[0] === 'hedera.config.version') {
          let version = parseInt(parts[1]);
          line = `hedera.config.version=${++version}`;
        }
        newLines.push(line);
      }
    }
    fs.writeFileSync(PathEx.join(upgradeConfigDir, 'application.properties'), newLines.join('\n'));

    return await zipper.zip(PathEx.join(stagingDir, 'mock-upgrade'), PathEx.join(stagingDir, 'mock-upgrade.zip'));
  }

  private async _uploadUpgradeZip(upgradeZipFile: string, nodeClient: Client): Promise<string> {
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

        if (start === 0) {
          fileTransaction = new FileUpdateTransaction().setFileId(constants.UPGRADE_FILE_ID).setContents(zipBytesChunk);
        } else {
          fileTransaction = new FileAppendTransaction().setFileId(constants.UPGRADE_FILE_ID).setContents(zipBytesChunk);
        }
        const resp = await fileTransaction.execute(nodeClient);
        const receipt = await resp.getReceipt(nodeClient);
        this.logger.debug(
          `updated file ${constants.UPGRADE_FILE_ID} [chunkSize= ${zipBytesChunk.length}, txReceipt = ${receipt.toString()}]`,
        );

        start += constants.UPGRADE_FILE_CHUNK_SIZE;
        this.logger.debug(`uploaded ${start} bytes of ${zipBytes.length} bytes`);
      }

      return zipHash;
    } catch (e) {
      throw new SoloError(`failed to upload build.zip file: ${e.message}`, e);
    }
  }

  private async copyLocalBuildPathToNode(
    k8: K8,
    podRef: PodRef,
    configManager: ConfigManager,
    localDataLibBuildPath: string,
  ): Promise<void> {
    const filterFunction = (path: string | string[]) => {
      return !(path.includes('data/keys') || path.includes('data/config'));
    };

    await k8
      .containers()
      .readByRef(ContainerRef.of(podRef, constants.ROOT_CONTAINER))
      .copyTo(localDataLibBuildPath, `${constants.HEDERA_HAPI_PATH}`, filterFunction);
    if (configManager.getFlag<string>(flags.appConfig)) {
      const testJsonFiles: string[] = configManager.getFlag<string>(flags.appConfig)!.split(',');
      for (const jsonFile of testJsonFiles) {
        if (fs.existsSync(jsonFile)) {
          await k8
            .containers()
            .readByRef(ContainerRef.of(podRef, constants.ROOT_CONTAINER))
            .copyTo(jsonFile, `${constants.HEDERA_HAPI_PATH}`);
        }
      }
    }
  }

  private _uploadPlatformSoftware(
    nodeAliases: NodeAliases,
    podRefs: Record<NodeAlias, PodRef>,
    task: SoloListrTaskWrapper<any>,
    localBuildPath: string,
    consensusNodes: Optional<ConsensusNode[]>,
    releaseTag: string,
  ) {
    const subTasks = [];

    this.logger.debug('no need to fetch, use local build jar files');

    const buildPathMap = new Map<NodeAlias, string>();
    let defaultDataLibBuildPath: string;
    const parameterPairs = localBuildPath.split(',');
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibBuildPath] = parameterPair.split('=');
        buildPathMap.set(nodeAlias as NodeAlias, localDataLibBuildPath);
      } else {
        defaultDataLibBuildPath = parameterPair;
      }
    }

    let localDataLibBuildPath: string;

    for (const nodeAlias of nodeAliases) {
      const podRef = podRefs[nodeAlias];
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      if (buildPathMap.has(nodeAlias)) {
        localDataLibBuildPath = buildPathMap.get(nodeAlias);
      } else {
        localDataLibBuildPath = defaultDataLibBuildPath;
      }

      if (!fs.existsSync(localDataLibBuildPath)) {
        throw new SoloError(`local build path does not exist: ${localDataLibBuildPath}`);
      }

      const self = this;

      const k8 = self.k8Factory.getK8(context);

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeAlias)} from ${localDataLibBuildPath}`,
        task: async () => {
          const shellRunner = new ShellRunner();
          try {
            const retrievedReleaseTag = await shellRunner.run(
              `git -C ${localDataLibBuildPath} describe --tags --abbrev=0`,
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
          let error: Error | null = null;
          let i = 0;
          for (; i < constants.LOCAL_BUILD_COPY_RETRY; i++) {
            error = null;
            try {
              // filter the data/config and data/keys to avoid failures due to config and secret mounts
              await self.copyLocalBuildPathToNode(k8, podRef, self.configManager, localDataLibBuildPath);
            } catch (e) {
              error = e;
            }
          }
          if (error) {
            throw new SoloError(`Error in copying local build to node: ${error.message}`, error);
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
    podRefs: Record<NodeAlias, PodRef>,
    releaseTag: string,
    task: SoloListrTaskWrapper<any>,
    platformInstaller: PlatformInstaller,
    consensusNodes?: Optional<ConsensusNode[]>,
  ) {
    const subTasks = [];
    for (const nodeAlias of nodeAliases) {
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      const podRef = podRefs[nodeAlias];
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeAlias)} [ platformVersion = ${releaseTag}, context = ${context} ]`,
        task: async () => await platformInstaller.fetchPlatform(podRef, releaseTag, context),
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
    ctx: any,
    task: SoloListrTaskWrapper<any>,
    nodeAliases: NodeAliases,
    status = NodeStatusCodes.ACTIVE,
  ) {
    const {
      config: {namespace},
    } = ctx;

    const enableDebugger = ctx.config.debugNodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;

    const subTasks = nodeAliases.map((nodeAlias, i) => {
      const reminder =
        'debugNodeAlias' in ctx.config &&
        ctx.config.debugNodeAlias === nodeAlias &&
        status !== NodeStatusCodes.FREEZE_COMPLETE
          ? 'Please attach JVM debugger now.  Sleeping for 1 hour, hit ctrl-c once debugging is complete.'
          : '';
      const title = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`;
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);

      const subTask = async (ctx: any, task: SoloListrTaskWrapper<any>) => {
        if (enableDebugger) {
          await sleep(Duration.ofHours(1));
        }
        ctx.config.podRefs[nodeAlias] = await this._checkNetworkNodeActiveness(
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
    maxAttempts = constants.NETWORK_NODE_ACTIVE_MAX_ATTEMPTS,
    delay = constants.NETWORK_NODE_ACTIVE_DELAY,
    timeout = constants.NETWORK_NODE_ACTIVE_TIMEOUT,
    context?: string,
  ): Promise<PodRef> {
    const podName = Templates.renderNetworkPodName(nodeAlias);
    const podRef = PodRef.of(namespace, podName);
    task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt ${chalk.blueBright(`0/${maxAttempts}`)}`;

    const consensusNodes = this.remoteConfigManager.getConsensusNodes();
    if (!context) context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);

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
          .readByRef(ContainerRef.of(podRef, constants.ROOT_CONTAINER))
          .execContainer([
            'bash',
            '-c',
            'curl -s http://localhost:9999/metrics | grep platform_PlatformStatus | grep -v \\#',
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

        const statusNumber = parseInt(statusLine.split(' ').pop());

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
      } catch (e) {
        this.logger.debug(
          `${title} : Error in checking node activeness: attempt: ${attempt}/${maxAttempts}: ${JSON.stringify(e)}`,
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

    return podRef;
  }

  /** Return task for check if node proxies are ready */
  private _checkNodesProxiesTask(ctx: any, task: SoloListrTaskWrapper<any>, nodeAliases: NodeAliases) {
    const subTasks = [];
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async ctx => {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);
          const k8 = this.k8Factory.getK8(context);
          await k8
            .pods()
            .waitForReadyStatus(
              ctx.config.namespace,
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
  private _generateGossipKeys(generateMultiple: boolean) {
    const self = this;

    return {
      title: 'Generate gossip keys',
      task: (ctx, task) => {
        const config = ctx.config;
        const nodeAliases = generateMultiple ? config.nodeAliases : [config.nodeAlias];
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
      skip: ctx => !ctx.config.generateGossipKeys,
    };
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGrpcTlsKeys(generateMultiple: boolean) {
    const self = this;
    return {
      title: 'Generate gRPC TLS Keys',
      task: (ctx, task) => {
        const config = ctx.config;
        const nodeAliases = generateMultiple ? config.nodeAliases : [config.nodeAlias];
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
      skip: ctx => !ctx.config.generateTlsKeys,
    };
  }

  public copyGrpcTlsCertificates(): SoloListrTask<NodeAddContext> {
    const self = this;
    return {
      title: 'Copy gRPC TLS Certificates',
      task: (ctx, task) =>
        self.certificateManager.buildCopyTlsCertificatesTasks(
          task,
          ctx.config.grpcTlsCertificatePath,
          ctx.config.grpcWebTlsCertificatePath,
          ctx.config.grpcTlsKeyPath,
          ctx.config.grpcWebTlsKeyPath,
        ),
      skip: ctx => !ctx.config.grpcTlsCertificatePath && !ctx.config.grpcWebTlsCertificatePath,
    };
  }

  private async _addStake(
    namespace: NamespaceName,
    accountId: string,
    nodeAlias: NodeAlias,
    stakeAmount: number = HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
    context?: string,
  ): Promise<void> {
    try {
      const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
      await this.accountManager.loadNodeClient(
        namespace,
        this.remoteConfigManager.getClusterRefs(),
        deploymentName,
        this.configManager.getFlag<boolean>(flags.forcePortForward),
        context,
      );
      const client = this.accountManager._nodeClient;
      const treasuryKey = await this.accountManager.getTreasuryAccountKeys(namespace);
      const treasuryPrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey);
      client.setOperator(TREASURY_ACCOUNT_ID, treasuryPrivateKey);

      // check balance
      const treasuryBalance = await new AccountBalanceQuery().setAccountId(TREASURY_ACCOUNT_ID).execute(client);
      this.logger.debug(`Account ${TREASURY_ACCOUNT_ID} balance: ${treasuryBalance.hbars}`);

      // get some initial balance
      await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, stakeAmount);

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
    } catch (e) {
      throw new SoloError(`Error in adding stake: ${e.message}`, e);
    }
  }

  public prepareUpgradeZip() {
    const self = this;
    return {
      title: 'Prepare upgrade zip file for node upgrade process',
      task: async ctx => {
        const config = ctx.config;
        const {upgradeZipFile} = ctx.config;
        if (upgradeZipFile) {
          this.logger.debug(`Using upgrade zip file: ${ctx.upgradeZipFile}`);
          ctx.upgradeZipFile = upgradeZipFile;
        } else {
          ctx.upgradeZipFile = await self._prepareUpgradeZip(config.stagingDir);
        }
        ctx.upgradeZipHash = await self._uploadUpgradeZip(ctx.upgradeZipFile, config.nodeClient);
      },
    };
  }

  public loadAdminKey() {
    return {
      title: 'Load node admin key',
      task: async ctx => {
        const config = ctx.config;
        if (ctx.config.nodeAlias) {
          try {
            const context = helpers.extractContextFromConsensusNodes(ctx.config.nodeAlias, ctx.config.consensusNodes);

            // load nodeAdminKey form k8s if exist
            const keyFromK8 = await this.k8Factory
              .getK8(context)
              .secrets()
              .read(config.namespace, Templates.renderNodeAdminKeyName(config.nodeAlias));
            const privateKey = Base64.decode(keyFromK8.data.privateKey);
            config.adminKey = PrivateKey.fromStringED25519(privateKey);
          } catch (e) {
            this.logger.debug(`Error in loading node admin key: ${e.message}, use default key`);
            config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
          }
        } else {
          config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        }
      },
    };
  }

  public checkExistingNodesStakedAmount() {
    const self = this;
    return {
      title: 'Check existing nodes staked amount',
      task: async ctx => {
        const config = ctx.config;

        // Transfer some hbar to the node for staking purpose
        const accountMap = getNodeAccountMap(config.existingNodeAliases);
        for (const nodeAlias of config.existingNodeAliases) {
          const accountId = accountMap.get(nodeAlias);
          await self.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1);
        }
      },
    };
  }

  public sendPrepareUpgradeTransaction() {
    const self = this;
    return {
      title: 'Send prepare upgrade transaction',
      task: async ctx => {
        const {upgradeZipHash} = ctx;
        const {nodeClient, freezeAdminPrivateKey} = ctx.config;
        try {
          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(FREEZE_ADMIN_ACCOUNT).execute(nodeClient);
          self.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          // transfer some tiny amount to the freeze admin account
          await self.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 100000);

          // set operator of freeze transaction as freeze admin account
          nodeClient.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey);

          const prepareUpgradeTx = await new FreezeTransaction()
            .setFreezeType(FreezeType.PrepareUpgrade)
            .setFileId(constants.UPGRADE_FILE_ID)
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const prepareUpgradeReceipt = await prepareUpgradeTx.getReceipt(nodeClient);

          self.logger.debug(
            `sent prepare upgrade transaction [id: ${prepareUpgradeTx.transactionId.toString()}]`,
            prepareUpgradeReceipt.status.toString(),
          );
        } catch (e) {
          throw new SoloError(`Error in prepare upgrade: ${e.message}`, e);
        }
      },
    };
  }

  public sendFreezeUpgradeTransaction() {
    const self = this;
    return {
      title: 'Send freeze upgrade transaction',
      task: async ctx => {
        const {upgradeZipHash} = ctx;
        const {freezeAdminPrivateKey, nodeClient} = ctx.config;
        try {
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(FREEZE_ADMIN_ACCOUNT).execute(nodeClient);
          self.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          nodeClient.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey);
          const freezeUpgradeTx = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeUpgrade)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .setFileId(constants.UPGRADE_FILE_ID)
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(nodeClient);
          self.logger.debug(
            `Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
            freezeUpgradeReceipt.status.toString(),
          );
        } catch (e) {
          throw new SoloError(`Error in freeze upgrade: ${e.message}`, e);
        }
      },
    };
  }

  public sendFreezeTransaction() {
    const self = this;
    return {
      title: 'Send freeze only transaction',
      task: async ctx => {
        const {freezeAdminPrivateKey} = ctx.config;
        try {
          const nodeClient = await this.accountManager.loadNodeClient(
            ctx.config.namespace,
            this.remoteConfigManager.getClusterRefs(),
            ctx.config.deployment,
          );
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          nodeClient.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey);
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
        } catch (e) {
          throw new SoloError(`Error in sending freeze transaction: ${e.message}`, e);
        }
      },
    };
  }

  /** Download generated config files and key files from the network node */
  public downloadNodeGeneratedFiles() {
    const self = this;
    return {
      title: 'Download generated files from an existing node',
      task: async ctx => {
        const config = ctx.config;

        // don't try to download from the same node we are deleting, it won't work
        const nodeAlias =
          ctx.config.nodeAlias === config.existingNodeAliases[0] && config.existingNodeAliases.length > 1
            ? config.existingNodeAliases[1]
            : config.existingNodeAliases[0];

        const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podRef = PodRef.of(config.namespace, nodeFullyQualifiedPodName);
        const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);

        const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);
        const k8 = self.k8Factory.getK8(context);

        // copy the config.txt file from the node1 upgrade directory
        await k8
          .containers()
          .readByRef(containerRef)
          .copyFrom(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current/config.txt`, config.stagingDir);

        // if directory data/upgrade/current/data/keys does not exist, then use data/upgrade/current
        let keyDir = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/keys`;
        if (!(await k8.containers().readByRef(containerRef).hasDir(keyDir))) {
          keyDir = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
        }
        const signedKeyFiles = (await k8.containers().readByRef(containerRef).listDir(keyDir)).filter(file =>
          file.name.startsWith(constants.SIGNING_KEY_PREFIX),
        );
        await k8
          .containers()
          .readByRef(containerRef)
          .execContainer([
            'bash',
            '-c',
            `mkdir -p ${constants.HEDERA_HAPI_PATH}/data/keys_backup && cp -r ${keyDir} ${constants.HEDERA_HAPI_PATH}/data/keys_backup/`,
          ]);
        for (const signedKeyFile of signedKeyFiles) {
          await k8
            .containers()
            .readByRef(containerRef)
            .copyFrom(`${keyDir}/${signedKeyFile.name}`, `${config.keysDir}`);
        }

        if (
          await k8
            .containers()
            .readByRef(containerRef)
            .hasFile(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`)
        ) {
          await k8
            .containers()
            .readByRef(containerRef)
            .copyFrom(
              `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`,
              `${config.stagingDir}/templates`,
            );
        }
      },
    };
  }

  public downloadNodeUpgradeFiles() {
    const self = this;
    return {
      title: 'Download upgrade files from an existing node',
      task: async ctx => {
        const config = ctx.config;

        const nodeAlias = ctx.config.nodeAliases[0];
        const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podRef = PodRef.of(config.namespace, nodeFullyQualifiedPodName);
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);

        // found all files under ${constants.HEDERA_HAPI_PATH}/data/upgrade/current/
        const upgradeDirectories = [
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/apps`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/libs`,
        ];
        const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
        for (const upgradeDir of upgradeDirectories) {
          // check if directory upgradeDir exist in root container
          if (!(await self.k8Factory.getK8(context).containers().readByRef(containerRef).hasDir(upgradeDir))) {
            continue;
          }
          const files = await self.k8Factory.getK8(context).containers().readByRef(containerRef).listDir(upgradeDir);
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
              .readByRef(containerRef)
              .copyFrom(`${upgradeDir}/${file.name}`, `${config.stagingDir}`);
          }
        }
      },
    };
  }

  private taskCheckNetworkNodePods(
    ctx: any,
    task: SoloListrTaskWrapper<any>,
    nodeAliases: NodeAliases,
    maxAttempts = undefined,
  ) {
    if (!ctx.config) ctx.config = {};

    ctx.config.podRefs = {};
    const consensusNodes: Optional<ConsensusNode[]> = ctx.config.consensusNodes;

    const subTasks = [];
    const self = this;
    for (const nodeAlias of nodeAliases) {
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeAlias)}`,
        task: async ctx => {
          try {
            ctx.config.podRefs[nodeAlias] = await self.checkNetworkNodePod(
              ctx.config.namespace,
              nodeAlias,
              maxAttempts,
              undefined,
              context,
            );
          } catch {
            ctx.config.skipStop = true;
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
  ): Promise<PodRef> {
    nodeAlias = nodeAlias.trim() as NodeAlias;
    const podName = Templates.renderNetworkPodName(nodeAlias);
    const podRef = PodRef.of(namespace, podName);

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

      return podRef;
    } catch (e) {
      throw new SoloError(`no pod found for nodeAlias: ${nodeAlias}`, e);
    }
  }

  public identifyExistingNodes() {
    const self = this;
    return {
      title: 'Identify existing network nodes',
      task: async (ctx, task) => {
        const config = ctx.config;
        config.existingNodeAliases = [];
        const clusterRefs = this.remoteConfigManager.getClusterRefs();
        config.serviceMap = await self.accountManager.getNodeServiceMap(
          config.namespace,
          clusterRefs,
          config.deployment,
        );
        for (const networkNodeServices of config.serviceMap.values()) {
          config.existingNodeAliases.push(networkNodeServices.nodeAlias);
        }
        config.allNodeAliases = [...config.existingNodeAliases];
        return self.taskCheckNetworkNodePods(ctx, task, config.existingNodeAliases);
      },
    };
  }

  public uploadStateFiles(skip: SkipCheck | boolean) {
    const self = this;
    return {
      title: 'Upload state files network nodes',
      task: async ctx => {
        const config = ctx.config;

        const zipFile = config.stateFile;
        self.logger.debug(`zip file: ${zipFile}`);
        for (const nodeAlias of ctx.config.nodeAliases) {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
          const k8 = this.k8Factory.getK8(context);
          const podRef = ctx.config.podRefs[nodeAlias];
          const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
          self.logger.debug(`Uploading state files to pod ${podRef.name}`);
          await k8.containers().readByRef(containerRef).copyTo(zipFile, `${constants.HEDERA_HAPI_PATH}/data`);

          self.logger.info(
            `Deleting the previous state files in pod ${podRef.name} directory ${constants.HEDERA_HAPI_PATH}/data/saved`,
          );
          await k8
            .containers()
            .readByRef(containerRef)
            .execContainer(['rm', '-rf', `${constants.HEDERA_HAPI_PATH}/data/saved/*`]);
          await k8
            .containers()
            .readByRef(containerRef)
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
      task: (ctx, task) => {
        return self.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeAliases, maxAttempts);
      },
    };
  }

  public fetchPlatformSoftware(aliasesField: string) {
    const self = this;
    return {
      title: 'Fetch platform software into network nodes',
      task: (ctx, task) => {
        const {podRefs, releaseTag, localBuildPath} = ctx.config;

        return localBuildPath !== ''
          ? self._uploadPlatformSoftware(
              ctx.config[aliasesField],
              podRefs,
              task,
              localBuildPath,
              ctx.config.consensusNodes,
              releaseTag,
            )
          : self._fetchPlatformSoftware(
              ctx.config[aliasesField],
              podRefs,
              releaseTag,
              task,
              this.platformInstaller,
              ctx.config.consensusNodes,
            );
      },
    };
  }

  public populateServiceMap() {
    return {
      title: 'Populate serviceMap',
      task: async ctx => {
        ctx.config.serviceMap = await this.accountManager.getNodeServiceMap(
          ctx.config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          ctx.config.deployment,
        );
        ctx.config.podRefs[ctx.config.nodeAlias] = PodRef.of(
          ctx.config.namespace,
          ctx.config.serviceMap.get(ctx.config.nodeAlias).nodePodName,
        );
      },
    };
  }

  public setupNetworkNodes(nodeAliasesProperty: string, isGenesis: boolean) {
    return {
      title: 'Setup network nodes',
      task: async (ctx, task) => {
        ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);
        if (isGenesis) {
          await this.generateGenesisNetworkJson(
            ctx.config.namespace,
            ctx.config.consensusNodes,
            ctx.config.keysDir,
            ctx.config.stagingDir,
          );
        }

        // TODO: during `node add` ctx.config.nodeAliases is empty, since ctx.config.nodeAliasesUnparsed is empty
        await this.generateNodeOverridesJson(ctx.config.namespace, ctx.config.nodeAliases, ctx.config.stagingDir);

        const consensusNodes = ctx.config.consensusNodes;
        const subTasks = [];
        for (const nodeAlias of ctx.config[nodeAliasesProperty]) {
          const podRef = ctx.config.podRefs[nodeAlias];
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: () => this.platformInstaller.taskSetup(podRef, ctx.config.stagingDir, isGenesis, context),
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
    stagingDir: string,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );

    const nodeOverridesModel = new NodeOverridesModel(nodeAliases, networkNodeServiceMap);

    const nodeOverridesYaml = PathEx.join(stagingDir, constants.NODE_OVERRIDE_FILE);
    fs.writeFileSync(nodeOverridesYaml, nodeOverridesModel.toYAML());
  }

  /**
   * Generate genesis network json file
   * @param namespace - namespace
   * @param consensusNodes - consensus nodes
   * @param keysDir - keys directory
   * @param stagingDir - staging directory
   */
  private async generateGenesisNetworkJson(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    keysDir: string,
    stagingDir: string,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );

    const adminPublicKeys = splitFlagInput(this.configManager.getFlag(flags.adminPublicKeys));
    const genesisNetworkData = await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      this.keyManager,
      this.accountManager,
      keysDir,
      networkNodeServiceMap,
      adminPublicKeys,
    );

    const genesisNetworkJson = PathEx.join(stagingDir, 'genesis-network.json');
    fs.writeFileSync(genesisNetworkJson, genesisNetworkData.toJSON());
  }

  public prepareStagingDirectory(nodeAliasesProperty: string) {
    return {
      title: 'Prepare staging directory',
      task: (ctx, task) => {
        const config = ctx.config;
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
      task: (ctx, task) => {
        const config = ctx.config;
        const nodeAliases = config[nodeAliasesProperty];
        const subTasks = [];

        for (const nodeAlias of nodeAliases) {
          const podRef = config.podRefs[nodeAlias];
          const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
          subTasks.push({
            title: `Start node: ${chalk.yellow(nodeAlias)}`,
            task: async () => {
              const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
              const k8 = this.k8Factory.getK8(context);
              await k8.containers().readByRef(containerRef).execContainer(['systemctl', 'restart', 'network-node']);
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
      task: async ctx => {
        const context = helpers.extractContextFromConsensusNodes(ctx.config.debugNodeAlias, ctx.config.consensusNodes);
        const podRef = PodRef.of(ctx.config.namespace, PodName.of(`network-${ctx.config.debugNodeAlias}-0`));
        this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podRef.name}`);
        await this.k8Factory
          .getK8(context)
          .pods()
          .readByRef(podRef)
          .portForward(constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT);
      },
      skip: ctx => !ctx.config.debugNodeAlias,
    };
  }

  public checkAllNodesAreActive(nodeAliasesProperty: string) {
    return {
      title: 'Check all nodes are ACTIVE',
      task: (ctx, task) => {
        return this._checkNodeActivenessTask(ctx, task, ctx.config[nodeAliasesProperty]);
      },
    };
  }

  public checkAllNodesAreFrozen(nodeAliasesProperty: string) {
    return {
      title: 'Check all nodes are FROZEN',
      task: (ctx, task) => {
        return this._checkNodeActivenessTask(
          ctx,
          task,
          ctx.config[nodeAliasesProperty],
          NodeStatusCodes.FREEZE_COMPLETE,
        );
      },
    };
  }

  public checkNodeProxiesAreActive() {
    return {
      title: 'Check node proxies are ACTIVE',
      task: (ctx, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(ctx, task, ctx.config.nodeAliases);
      },
      skip: async ctx => ctx.config.app !== '' && ctx.config.app !== constants.HEDERA_APP_NAME,
    };
  }

  public checkAllNodeProxiesAreActive() {
    return {
      title: 'Check all node proxies are ACTIVE',
      task: (ctx, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases);
      },
    };
  }

  // Update account manager and transfer hbar for staking purpose
  public triggerStakeWeightCalculate(transactionType: NodeSubcommandType) {
    const self = this;
    return {
      title: 'Trigger stake weight calculate',
      task: async ctx => {
        const config = ctx.config;
        self.logger.info(
          'sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate',
        );
        await sleep(Duration.ofSeconds(60));
        const accountMap = getNodeAccountMap(config.allNodeAliases);
        let skipNodeAlias: NodeAlias;

        switch (transactionType) {
          case NodeSubcommandType.ADD:
            break;
          case NodeSubcommandType.UPDATE:
            if (config.newAccountNumber) {
              // update map with current account ids
              accountMap.set(config.nodeAlias, config.newAccountNumber);
              skipNodeAlias = config.nodeAlias;
            }
            break;
          case NodeSubcommandType.DELETE:
            if (config.nodeAlias) {
              accountMap.delete(config.nodeAlias);
              skipNodeAlias = config.nodeAlias;
            }
        }

        config.nodeClient = await self.accountManager.refreshNodeClient(
          config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          skipNodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
        );

        // send some write transactions to invoke the handler that will trigger the stake weight recalculate
        for (const nodeAlias of accountMap.keys()) {
          const accountId = accountMap.get(nodeAlias);
          config.nodeClient.setOperator(TREASURY_ACCOUNT_ID, config.treasuryKey);
          await self.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1);
        }
      },
    };
  }

  public addNodeStakes() {
    const self = this;
    return {
      title: 'Add node stakes',
      task: (ctx, task) => {
        if (ctx.config.app === '' || ctx.config.app === constants.HEDERA_APP_NAME) {
          const subTasks = [];
          const accountMap = getNodeAccountMap(ctx.config.nodeAliases);
          const stakeAmountParsed = ctx.config.stakeAmount ? splitFlagInput(ctx.config.stakeAmount) : [];
          let nodeIndex = 0;
          for (const nodeAlias of ctx.config.nodeAliases) {
            const accountId = accountMap.get(nodeAlias);
            const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);
            const stakeAmount =
              stakeAmountParsed.length > 0 ? stakeAmountParsed[nodeIndex] : HEDERA_NODE_DEFAULT_STAKE_AMOUNT;
            subTasks.push({
              title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await self._addStake(ctx.config.namespace, accountId, nodeAlias, +stakeAmount, context),
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

  public stakeNewNode() {
    const self = this;
    return {
      title: 'Stake new node',
      task: async ctx => {
        const context = helpers.extractContextFromConsensusNodes(ctx.config.nodeAlias, ctx.config.consensusNodes);
        await self.accountManager.refreshNodeClient(
          ctx.config.namespace,
          this.remoteConfigManager.getClusterRefs(),
          ctx.config.nodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
          this.configManager.getFlag<boolean>(flags.forcePortForward),
        );
        await this._addStake(ctx.config.namespace, ctx.newNode.accountId, ctx.config.nodeAlias, undefined, context);
      },
    };
  }

  public stopNodes(nodeAliasesProperty: string) {
    return {
      title: 'Stopping nodes',
      task: async (ctx, task) => {
        const subTasks = [];
        if (!ctx.config.skipStop) {
          await this.accountManager.close();
          for (const nodeAlias of ctx.config[nodeAliasesProperty]) {
            const podRef = ctx.config.podRefs[nodeAlias];
            const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
            const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);

            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () =>
                await this.k8Factory
                  .getK8(context)
                  .containers()
                  .readByRef(containerRef)
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

  finalize() {
    return new Task('Finalize', () => {
      // reset flags so that keys are not regenerated later
      this.configManager.setFlag(flags.generateGossipKeys, false);
      this.configManager.setFlag(flags.generateTlsKeys, false);
    });
  }

  dumpNetworkNodesSaveState() {
    return new Task('Dump network nodes saved state', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config: NodeRefreshConfigClass = ctx.config;
      const subTasks = [];
      for (const nodeAlias of config.nodeAliases) {
        const podRef = config.podRefs[nodeAlias];
        const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);

        subTasks.push({
          title: `Node: ${chalk.yellow(nodeAlias)}`,
          task: async () =>
            await this.k8Factory
              .getK8(context)
              .containers()
              .readByRef(containerRef)
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
    });
  }

  getNodeLogsAndConfigs() {
    return new Task('Get node logs and configs', async ctx => {
      await container.resolve<NetworkNodes>(NetworkNodes).getLogs(ctx.config.namespace, ctx.config.contexts);
    });
  }

  getNodeStateFiles() {
    return new Task('Get node states', async ctx => {
      for (const nodeAlias of ctx.config.nodeAliases) {
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);
        await container.resolve<NetworkNodes>(NetworkNodes).getStatesFromPod(ctx.config.namespace, nodeAlias, context);
      }
    });
  }

  checkPVCsEnabled() {
    return new Task('Check that PVCs are enabled', () => {
      if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
        throw new SoloError('PVCs are not enabled. Please enable PVCs before adding a node');
      }
    });
  }

  determineNewNodeAccountNumber() {
    return new Task('Determine new node account number', ctx => {
      const config: NodeAddConfigClass = ctx.config;
      const values = {hedera: {nodes: []}};
      let maxNum: Long = Long.fromNumber(0);

      let lastNodeAlias = DEFAULT_NETWORK_NODE_NAME;

      for (const networkNodeServices of config.serviceMap.values()) {
        values.hedera.nodes.push({
          accountId: networkNodeServices.accountId,
          name: networkNodeServices.nodeAlias,
          nodeId: networkNodeServices.nodeId,
        });
        maxNum =
          maxNum > AccountId.fromString(networkNodeServices.accountId).num
            ? maxNum
            : AccountId.fromString(networkNodeServices.accountId).num;
        lastNodeAlias = networkNodeServices.nodeAlias;
      }

      const lastNodeIdMatch = lastNodeAlias.match(/\d+$/);
      if (lastNodeIdMatch.length) {
        const incremented = parseInt(lastNodeIdMatch[0]) + 1;
        lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString());
      }

      ctx.maxNum = maxNum.add(1);
      ctx.newNode = {
        accountId: `${constants.HEDERA_NODE_ACCOUNT_ID_START.realm}.${constants.HEDERA_NODE_ACCOUNT_ID_START.shard}.${ctx.maxNum}`,
        name: lastNodeAlias,
      };
      config.nodeAlias = lastNodeAlias as NodeAlias;
      config.allNodeAliases.push(lastNodeAlias as NodeAlias);
    });
  }

  generateGossipKeys() {
    return this._generateGossipKeys(true);
  }

  generateGossipKey() {
    return this._generateGossipKeys(false);
  }

  generateGrpcTlsKeys() {
    return this._generateGrpcTlsKeys(true);
  }

  generateGrpcTlsKey() {
    return this._generateGrpcTlsKeys(false);
  }

  loadSigningKeyCertificate() {
    return new Task('Load signing key certificate', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config = ctx.config;
      const signingCertFile = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
      const signingCertFullPath = PathEx.joinWithRealPath(config.keysDir, signingCertFile);
      ctx.signingCertDer = this.keyManager.getDerFromPemCertificate(signingCertFullPath);
    });
  }

  computeMTLSCertificateHash() {
    return new Task('Compute mTLS certificate hash', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config = ctx.config;
      const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
      const tlsCertFullPath = PathEx.joinWithRealPath(config.keysDir, tlsCertFile);
      const tlsCertDer = this.keyManager.getDerFromPemCertificate(tlsCertFullPath);
      ctx.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
    });
  }

  prepareGossipEndpoints() {
    return new Task('Prepare gossip endpoints', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config = ctx.config;
      let endpoints = [];
      if (!config.gossipEndpoints) {
        if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
          throw new SoloError(`--gossip-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`);
        }

        endpoints = [
          `${helpers.getInternalIp(config.releaseTag, config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
          `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
        ];
      } else {
        endpoints = splitFlagInput(config.gossipEndpoints);
      }

      ctx.gossipEndpoints = prepareEndpoints(
        config.endpointType,
        endpoints,
        constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
      );
    });
  }

  // this is only used by `node delete`
  refreshNodeList() {
    return new Task('Refresh node alias list', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      ctx.config.allNodeAliases = ctx.config.existingNodeAliases.filter(
        (nodeAlias: NodeAlias) => nodeAlias !== ctx.config.nodeAlias,
      );
      ctx.config.consensusNodes = ctx.config.consensusNodes.filter(
        (consensusNode: ConsensusNode) => consensusNode.name !== ctx.config.nodeAlias,
      );
    });
  }

  prepareGrpcServiceEndpoints() {
    return new Task('Prepare grpc service endpoints', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config = ctx.config;
      let endpoints = [];

      if (!config.grpcEndpoints) {
        if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
          throw new SoloError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`);
        }

        endpoints = [
          `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
        ];
      } else {
        endpoints = splitFlagInput(config.grpcEndpoints);
      }

      ctx.grpcServiceEndpoints = prepareEndpoints(
        config.endpointType,
        endpoints,
        constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
      );
    });
  }

  sendNodeUpdateTransaction() {
    const self = this;
    return new Task('Send node update transaction', async ctx => {
      const config: NodeUpdateConfigClass = ctx.config;

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
      } catch (e) {
        throw new SoloError(`Error updating node to network: ${e.message}`, e);
      }
    });
  }

  copyNodeKeysToSecrets() {
    return new Task('Copy node keys to secrets', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const subTasks = this.platformInstaller.copyNodeKeys(
        ctx.config.stagingDir,
        ctx.config.consensusNodes,
        ctx.config.contexts,
      );

      // set up the sub-tasks for copying node keys to staging directory
      return task.newListr(subTasks, {
        concurrent: true,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      });
    });
  }

  updateChartWithConfigMap(
    title: string,
    transactionType: NodeSubcommandType,
    skip: SkipCheck | boolean = false,
  ): SoloListrTask<any> {
    const self = this;
    return {
      title,
      task: async ctx => {
        // Prepare parameter and update the network node chart
        const config = ctx.config;

        const consensusNodes = ctx.config.consensusNodes as ConsensusNode[];
        const valuesArgMap: Record<ClusterRef, string> = {};

        // Make sure valuesArgMap is initialized with empty strings
        if (consensusNodes.length) {
          consensusNodes.forEach(node => (valuesArgMap[node.cluster] = ''));
        } else {
          valuesArgMap[this.k8Factory.default().clusters().readCurrent()] = '';
        }

        const clusterRefs = this.remoteConfigManager.getClusterRefs();
        if (!Object.keys(clusterRefs).length) {
          const clusterRef = this.k8Factory.default().clusters().readCurrent();
          clusterRefs[clusterRef] = this.localConfig.clusterRefs[clusterRef];
        }

        if (!config.serviceMap) {
          config.serviceMap = await self.accountManager.getNodeServiceMap(
            config.namespace,
            clusterRefs,
            config.deployment,
          );
        }

        let maxNodeId = 0;
        for (const nodeAlias of config.existingNodeAliases) {
          const nodeId = config.serviceMap.get(nodeAlias).nodeId;
          maxNodeId = Math.max(nodeId, maxNodeId);
        }

        const nodeId = maxNodeId + 1;
        const index = config.existingNodeAliases.length;

        // On Update and Delete
        for (let i = 0; i < index; i++) {
          const consensusNode = consensusNodes.find(node => node.nodeId === i);
          if (!consensusNode) break; // break in the case that no consensus node is found, which can happen from a node delete
          const clusterRef = consensusNode ? consensusNode.cluster : this.k8Factory.default().clusters().readCurrent();

          // TODO the node array index in the set command will be different from the loop index in the case of multiple clusters
          // TODO also, if a node delete has been ran, or a node add, then the node array will still have to be contiguous, but the nodeId will not match the index
          if (
            transactionType === NodeSubcommandType.UPDATE &&
            config.newAccountNumber &&
            i === Templates.nodeIdFromNodeAlias(config.nodeAlias)
          ) {
            // for the case of updating node
            // use new account number for this node id
            valuesArgMap[clusterRef] +=
              ` --set "hedera.nodes[${i}].accountId=${config.newAccountNumber}" --set "hedera.nodes[${i}].name=${config.nodeAlias}" --set "hedera.nodes[${i}].nodeId=${i}" `;
          } else if (transactionType !== NodeSubcommandType.DELETE || i !== nodeId) {
            // for the case of deleting node
            valuesArgMap[clusterRef] +=
              ` --set "hedera.nodes[${i}].accountId=${config.serviceMap.get(config.existingNodeAliases[i]).accountId}" --set "hedera.nodes[${i}].name=${config.existingNodeAliases[i]}" --set "hedera.nodes[${i}].nodeId=${i}" `;
          } else if (transactionType === NodeSubcommandType.DELETE && i === nodeId) {
            valuesArgMap[clusterRef] +=
              ` --set "hedera.nodes[${i}].accountId=${IGNORED_NODE_ACCOUNT_ID}" --set "hedera.nodes[${i}].name=${config.existingNodeAliases[i]}" --set "hedera.nodes[${i}].nodeId=${i}" `;
          }
        }

        // now remove the deleted node from the serviceMap
        if (transactionType === NodeSubcommandType.DELETE) {
          config.serviceMap.delete(config.nodeAlias);
        }

        // When adding a new node
        if (transactionType === NodeSubcommandType.ADD && ctx.newNode && ctx.newNode.accountId) {
          const consensusNode = consensusNodes.find(node => node.nodeId === index);
          const clusterRef = consensusNode ? consensusNode.cluster : this.k8Factory.default().clusters().readCurrent();

          valuesArgMap[clusterRef] +=
            ` --set "hedera.nodes[${index}].accountId=${ctx.newNode.accountId}"` +
            ` --set "hedera.nodes[${index}].name=${ctx.newNode.name}"` +
            ` --set "hedera.nodes[${index}].nodeId=${nodeId}" `;

          if (config.haproxyIps) {
            config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
          }

          if (config.envoyIps) {
            config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
          }

          const nodeAlias: NodeAlias = config.nodeAlias;
          const nodeIndexInValues = Templates.nodeIdFromNodeAlias(nodeAlias);
          const consensusNodeInValues = consensusNodes.find(node => node.name === nodeAlias);
          const clusterForConsensusNodeInValues = consensusNodeInValues
            ? consensusNodeInValues.cluster
            : this.k8Factory.default().clusters().readCurrent();

          // Set static IPs for HAProxy
          if (config.haproxyIpsParsed) {
            const ip: string = config.haproxyIpsParsed?.[nodeAlias];

            if (ip) {
              valuesArgMap[clusterForConsensusNodeInValues] +=
                ` --set "hedera.nodes[${nodeIndexInValues}].haproxyStaticIP=${ip}"`;
            }
          }

          // Set static IPs for Envoy Proxy
          if (config.envoyIpsParsed) {
            const ip: string = config.envoyIpsParsed?.[nodeAlias];

            if (ip) {
              valuesArgMap[clusterForConsensusNodeInValues] +=
                ` --set "hedera.nodes[${nodeIndexInValues}].envoyProxyStaticIP=${ip}"`;
            }
          }
        }

        // Add profile values files
        const profileValuesFile = await self.profileManager.prepareValuesForNodeTransaction(
          PathEx.joinWithRealPath(config.stagingDir, 'config.txt'),
          PathEx.joinWithRealPath(config.stagingDir, 'templates', 'application.properties'),
        );

        if (profileValuesFile) {
          const valuesFiles: Record<ClusterRef, string> = BaseCommand.prepareValuesFilesMap(
            clusterRefs,
            undefined, // do not trigger of adding default value file for chart upgrade due to node add or delete
            profileValuesFile,
            config.valuesFile,
          );

          for (const clusterRef of Object.keys(valuesFiles)) {
            valuesArgMap[clusterRef] += valuesFiles[clusterRef];
            this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterRef}`, {valuesArg: valuesArgMap});
          }
        }

        // Add Debug options
        const consensusNode = consensusNodes.find(node => node.name === config.debugNodeAlias);
        const clusterRef = consensusNode ? consensusNode.cluster : this.k8Factory.default().clusters().readCurrent();

        valuesArgMap[clusterRef] = addDebugOptions(valuesArgMap[clusterRef], config.debugNodeAlias);

        // Update charts
        await self.chartManager.upgrade(
          config.namespace,
          constants.SOLO_DEPLOYMENT_CHART,
          ctx.config.chartPath,
          config.soloChartVersion,
          valuesArgMap[clusterRef],
          this.localConfig.clusterRefs[clusterRef],
        );
        showVersionBanner(self.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');
      },
      skip,
    };
  }

  saveContextData(argv: any, targetFile: string, parser: any) {
    return new Task('Save context data', ctx => {
      const outputDir = argv[flags.outputDir.name];
      if (!outputDir) {
        throw new SoloError(
          `Path to export context data not specified. Please set a value for --${flags.outputDir.name}`,
        );
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
      }
      const exportedCtx = parser(ctx);
      fs.writeFileSync(PathEx.join(outputDir, targetFile), JSON.stringify(exportedCtx));
    });
  }

  loadContextData(argv: any, targetFile: string, parser: any) {
    return new Task('Load context data', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const inputDir = argv[flags.inputDir.name];
      if (!inputDir) {
        throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`);
      }
      // @ts-ignore
      const ctxData = JSON.parse(fs.readFileSync(PathEx.joinWithRealPath(inputDir, targetFile)));
      parser(ctx, ctxData);
    });
  }

  killNodes() {
    return new Task(
      'Kill nodes',
      async (ctx: {config: {serviceMap: Map<NodeAlias, NetworkNodeServices>} & AnyObject}) => {
        const config = ctx.config;
        for (const service of config.serviceMap.values()) {
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByRef(PodRef.of(config.namespace, service.nodePodName))
            .killPod();
        }
      },
    );
  }

  killNodesAndUpdateConfigMap() {
    return new Task(
      'Kill nodes to pick up updated configMaps',
      async (ctx: {config: {serviceMap: Map<NodeAlias, NetworkNodeServices>} & AnyObject}) => {
        const config = ctx.config;
        const clusterRefs = this.remoteConfigManager.getClusterRefs();
        // the updated node will have a new pod ID if its account ID changed which is a label
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterRefs,
          config.deployment,
        );

        for (const service of config.serviceMap.values()) {
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByRef(PodRef.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // again, the pod names will change after the pods are killed
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterRefs,
          config.deployment,
        );

        config.podRefs = {};
        for (const service of config.serviceMap.values()) {
          config.podRefs[service.nodeAlias] = PodRef.of(service.namespace, service.nodePodName);
        }
      },
    );
  }

  checkNodePodsAreRunning() {
    return new Task('Check node pods are running', (ctx: any, task: SoloListrTaskWrapper<any>) => {
      const config: NodeUpdateConfigClass = ctx.config;
      const subTasks = [];
      for (const nodeAlias of config.allNodeAliases) {
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, ctx.config.consensusNodes);
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
    });
  }

  sleep(title: string, milliseconds: number) {
    return new Task(title, async (ctx: any, task: SoloListrTaskWrapper<any>) => {
      await sleep(Duration.ofMillis(milliseconds));
    });
  }

  public downloadLastState(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Download last state from an existing node',
      task: async ctx => {
        const config = ctx.config;
        const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0]);
        const podRef = PodRef.of(config.namespace, node1FullyQualifiedPodName);
        const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
        const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`;

        const context = helpers.extractContextFromConsensusNodes(
          config.existingNodeAliases[0],
          ctx.config.consensusNodes,
        );

        const k8 = this.k8Factory.getK8(context);

        // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
        const zipFileName = await k8
          .containers()
          .readByRef(containerRef)
          .execContainer([
            'bash',
            '-c',
            `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && jar cf "\${states[0]}.zip" -C "\${states[0]}" . && echo -n \${states[0]}.zip`,
          ]);

        await k8.containers().readByRef(containerRef).copyFrom(`${upgradeDirectory}/${zipFileName}`, config.stagingDir);
        config.lastStateZipPath = PathEx.joinWithRealPath(config.stagingDir, zipFileName);
      },
    };
  }

  public uploadStateToNewNode(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Upload last saved state to new network node',
      task: async ctx => {
        const config = ctx.config;
        const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeAlias);
        const podRef = PodRef.of(config.namespace, newNodeFullyQualifiedPodName);
        const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);
        const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
        const savedStateDir = config.lastStateZipPath.match(/\/(\d+)\.zip$/)[1];
        const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDir}`;

        const context = helpers.extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
        const k8 = this.k8Factory.getK8(context);

        await k8
          .containers()
          .readByRef(containerRef)
          .execContainer(['bash', '-c', `mkdir -p ${savedStatePath}`]);
        await k8.containers().readByRef(containerRef).copyTo(config.lastStateZipPath, savedStatePath);

        await this.platformInstaller.setPathPermission(
          podRef,
          constants.HEDERA_HAPI_PATH,
          undefined,
          undefined,
          undefined,
          context,
        );

        await k8
          .containers()
          .readByRef(containerRef)
          .execContainer([
            'bash',
            '-c',
            `cd ${savedStatePath} && jar xf ${path.basename(config.lastStateZipPath)} && rm -f ${path.basename(config.lastStateZipPath)}`,
          ]);
      },
    };
  }

  public sendNodeDeleteTransaction(): SoloListrTask<NodeDeleteContext> {
    return {
      title: 'Send node delete transaction',
      task: async ctx => {
        const config: NodeDeleteConfigClass = ctx.config;

        try {
          const accountMap = getNodeAccountMap(config.existingNodeAliases);
          const deleteAccountId = accountMap.get(config.nodeAlias);
          this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`);
          const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
          const nodeDeleteTx = new NodeDeleteTransaction().setNodeId(new Long(nodeId)).freezeWith(config.nodeClient);

          const signedTx = await nodeDeleteTx.sign(config.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient);

          this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);
        } catch (e) {
          throw new SoloError(`Error deleting node from network: ${e.message}`, e);
        }
      },
    };
  }

  public sendNodeCreateTransaction(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Send node create transaction',
      task: async ctx => {
        const config: NodeAddConfigClass = ctx.config;

        try {
          const nodeCreateTx = new NodeCreateTransaction()
            .setAccountId(ctx.newNode.accountId)
            .setGossipEndpoints(ctx.gossipEndpoints)
            .setServiceEndpoints(ctx.grpcServiceEndpoints)
            .setGossipCaCertificate(ctx.signingCertDer)
            .setCertificateHash(ctx.tlsCertHash)
            .setAdminKey(ctx.adminKey.publicKey)
            .freezeWith(config.nodeClient);
          const signedTx = await nodeCreateTx.sign(ctx.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeCreateReceipt = await txResp.getReceipt(config.nodeClient);
          this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`);
        } catch (e) {
          throw new SoloError(`Error adding node to network: ${e.message}`, e);
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
    const {requiredFlags, requiredFlagsWithDisabledPrompt, optionalFlags} = argv;
    const allRequiredFlags = [...requiredFlags, ...requiredFlagsWithDisabledPrompt];

    argv.flags = [...requiredFlags, ...requiredFlagsWithDisabledPrompt, ...optionalFlags];

    return {
      title: 'Initialize',
      task: async (ctx, task): Promise<SoloListr<AnyListrContext> | void> => {
        if (argv[flags.devMode.name]) {
          this.logger.setDevMode(true);
        }

        this.configManager.update(argv);

        // disable the prompts that we don't want to prompt the user for
        flags.disablePrompts([...requiredFlagsWithDisabledPrompt, ...optionalFlags]);

        const flagsToPrompt = [];
        for (const pFlag of requiredFlags) {
          if (typeof argv[pFlag.name] === 'undefined') {
            flagsToPrompt.push(pFlag);
          }
        }

        await this.configManager.executePrompt(task, flagsToPrompt);

        const config = await configInit(argv, ctx, task, shouldLoadNodeClient);
        ctx.config = config;
        config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
        config.contexts = this.remoteConfigManager.getContexts();

        for (const flag of allRequiredFlags) {
          if (typeof config[flag.constName] === 'undefined') {
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
      task: async (ctx, task) => {
        const nodeAlias = ctx.config.nodeAlias;
        // TODO: Discuss how the user should provide the clusterRef
        const clusterRef = this.k8Factory.default().clusters().readCurrent();
        const namespace: NamespaceNameAsString = ctx.config.namespace.name;

        task.title += `: ${nodeAlias}`;

        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.add(
            new ConsensusNodeComponent(
              nodeAlias,
              clusterRef,
              namespace,
              ConsensusNodeStates.STARTED,
              Templates.nodeIdFromNodeAlias(nodeAlias),
            ),
          );

          remoteConfig.components.add(new EnvoyProxyComponent(`envoy-proxy-${nodeAlias}`, clusterRef, namespace));

          remoteConfig.components.add(new HaProxyComponent(`haproxy-${nodeAlias}`, clusterRef, namespace));
        });

        ctx.config.consensusNodes = this.remoteConfigManager.getConsensusNodes();

        // if the consensusNodes does not contain the nodeAlias then add it
        if (!ctx.config.consensusNodes.find((node: ConsensusNode) => node.name === ctx.config.nodeAlias)) {
          ctx.config.consensusNodes.push(
            new ConsensusNode(
              ctx.config.nodeAlias,
              Templates.nodeIdFromNodeAlias(ctx.config.nodeAlias),
              namespace,
              ctx.config.consensusNodes[0].cluster,
              ctx.config.consensusNodes[0].context,
              'cluster.local',
              'network-{nodeAlias}-svc.{namespace}.svc',
              Templates.renderConsensusNodeFullyQualifiedDomainName(
                ctx.config.nodeAlias as NodeAlias,
                Templates.nodeIdFromNodeAlias(ctx.config.nodeAlias),
                namespace,
                ctx.config.consensusNodes[0].cluster,
                'cluster.local',
                'network-{nodeAlias}-svc.{namespace}.svc',
              ),
            ),
          );
        }
      },
    };
  }
}
