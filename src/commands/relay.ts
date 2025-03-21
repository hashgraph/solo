// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import * as helpers from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand, type Opts} from './base.js';
import {Flags as flags} from './flags.js';
import {getNodeAccountMap, prepareChartPath, showVersionBanner} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type CommandBuilder, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {RelayComponent} from '../core/config/remote/components/relay-component.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import * as Base64 from 'js-base64';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterRef, type DeploymentName} from '../core/config/remote/types.js';
import {type Optional, type SoloListrTask} from '../types/index.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';

export class RelayCommand extends BaseCommand {
  private readonly profileManager: ProfileManager;
  private readonly accountManager: AccountManager;

  constructor(opts: Opts) {
    super(opts);

    if (!opts || !opts.profileManager)
      throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader);

    this.profileManager = opts.profileManager;
    this.accountManager = opts.accountManager;
  }

  public static readonly COMMAND_NAME = 'relay';

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.chainId,
      flags.chartDirectory,
      flags.clusterRef,
      flags.deployment,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.relayReleaseTag,
      flags.replicaCount,
      flags.valuesFile,
    ];
  }

  static get DESTROY_FLAGS_LIST() {
    return [flags.chartDirectory, flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef];
  }

  async prepareValuesArg(
    valuesFile: string,
    nodeAliases: NodeAliases,
    chainID: string,
    relayRelease: string,
    replicaCount: number,
    operatorID: string,
    operatorKey: string,
    namespace: NamespaceName,
    context?: Optional<string>,
  ) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArg += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArg += ` --set config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArg += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArg += ' --set config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArg += ' --set config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArg += ' --set config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    if (chainID) {
      valuesArg += ` --set config.CHAIN_ID=${chainID}`;
    }

    if (relayRelease) {
      valuesArg += ` --set image.tag=${relayRelease.replace(/^v/, '')}`;
    }

    if (replicaCount) {
      valuesArg += ` --set replicaCount=${replicaCount}`;
    }

    const operatorIdUsing = operatorID || constants.OPERATOR_ID;
    valuesArg += ` --set config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArg += ` --set config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const namespace = NamespaceName.of(this.localConfig.deployments[deploymentName].namespace);

        const k8 = this.k8Factory.getK8(context);
        const secrets = await k8.secrets().list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArg += ` --set config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8 = Base64.decode(secrets[0].data.privateKey);
          valuesArg += ` --set config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
        }
      } catch (e) {
        throw new SoloError(`Error getting operator key: ${e.message}`, e);
      }
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkJsonString = await this.prepareNetworkJsonString(nodeAliases, namespace);
    valuesArg += ` --set config.HEDERA_NETWORK='${networkJsonString}'`;

    if (valuesFile) {
      valuesArg += helpers.prepareValuesFiles(valuesFile);
    }

    return valuesArg;
  }

  /**
   * created a json string to represent the map between the node keys and their ids
   * output example '{"node-1": "0.0.3", "node-2": "0.004"}'
   */
  async prepareNetworkJsonString(nodeAliases: NodeAliases = [], namespace: NamespaceName) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkIds = {};

    const accountMap = getNodeAccountMap(nodeAliases);
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );
    nodeAliases.forEach(nodeAlias => {
      const haProxyClusterIp = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    });

    return JSON.stringify(networkIds);
  }

  prepareReleaseName(nodeAliases: NodeAliases = []) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    let releaseName = 'relay';
    nodeAliases.forEach(nodeAlias => {
      releaseName += `-${nodeAlias}`;
    });

    return releaseName;
  }

  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface RelayDeployConfigClass {
      chainId: string;
      chartDirectory: string;
      namespace: NamespaceName;
      deployment: string;
      nodeAliasesUnparsed: string;
      operatorId: string;
      operatorKey: string;
      profileFile: string;
      profileName: string;
      relayReleaseTag: string;
      replicaCount: number;
      valuesFile: string;
      chartPath: string;
      isChartInstalled: boolean;
      nodeAliases: NodeAliases;
      releaseName: string;
      valuesArg: string;
      clusterRef: Optional<ClusterRef>;
      context: Optional<string>;
    }

    interface Context {
      config: RelayDeployConfigClass;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            self.configManager.update(argv);

            flags.disablePrompts([
              flags.operatorId,
              flags.operatorKey,
              flags.clusterRef,
              flags.profileFile,
              flags.profileName,
            ]);

            await self.configManager.executePrompt(task, RelayCommand.DEPLOY_FLAGS_LIST);

            // prompt if inputs are empty and set it in the context
            ctx.config = this.configManager.getConfig(
              RelayCommand.DEPLOY_CONFIGS_NAME,
              RelayCommand.DEPLOY_FLAGS_LIST,
              ['nodeAliases'],
            ) as RelayDeployConfigClass;

            ctx.config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
            ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed);
            ctx.config.releaseName = self.prepareReleaseName(ctx.config.nodeAliases);

            if (ctx.config.clusterRef) {
              const context = self.remoteConfigManager.getClusterRefs()[ctx.config.clusterRef];
              if (context) ctx.config.context = context;
            }

            ctx.config.isChartInstalled = await self.chartManager.isChartInstalled(
              ctx.config.namespace,
              ctx.config.releaseName,
              ctx.config.context,
            );

            self.logger.debug('Initialized config', {config: ctx.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare chart values',
          task: async ctx => {
            const config = ctx.config;
            config.chartPath = await prepareChartPath(
              self.helm,
              config.chartDirectory,
              constants.JSON_RPC_RELAY_CHART,
              constants.JSON_RPC_RELAY_CHART,
            );
            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              ctx.config.context,
            );
            config.valuesArg = await self.prepareValuesArg(
              config.valuesFile,
              config.nodeAliases,
              config.chainId,
              config.relayReleaseTag,
              config.replicaCount,
              config.operatorId,
              config.operatorKey,
              config.namespace,
              config.context,
            );
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async ctx => {
            const config = ctx.config;

            const k8 = self.k8Factory.getK8(config.context);
            const kubeContext = k8.contexts().readCurrent();

            await self.chartManager.install(
              config.namespace,
              config.releaseName,
              config.chartPath,
              '',
              config.valuesArg,
              kubeContext,
            );

            showVersionBanner(self.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);

            await k8
              .pods()
              .waitForRunningPhase(
                config.namespace,
                ['app=hedera-json-rpc-relay', `app.kubernetes.io/instance=${config.releaseName}`],
                constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
                constants.RELAY_PODS_RUNNING_DELAY,
              );

            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
        },
        {
          title: 'Check relay is ready',
          task: async ctx => {
            const config = ctx.config;
            const k8 = self.k8Factory.getK8(config.context);
            try {
              await k8
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  ['app=hedera-json-rpc-relay', `app.kubernetes.io/instance=${config.releaseName}`],
                  constants.RELAY_PODS_READY_MAX_ATTEMPTS,
                  constants.RELAY_PODS_READY_DELAY,
                );
            } catch (e) {
              throw new SoloError(`Relay ${config.releaseName} is not ready: ${e.message}`, e);
            }
          },
        },
        this.addRelayComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error deploying relay: ${e.message}`, e);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface RelayDestroyConfigClass {
      chartDirectory: string;
      namespace: NamespaceName;
      deployment: string;
      nodeAliases: NodeAliases;
      releaseName: string;
      isChartInstalled: boolean;
      clusterRef: Optional<ClusterRef>;
      context: Optional<string>;
    }

    interface Context {
      config: RelayDestroyConfigClass;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            await self.configManager.executePrompt(task, RelayCommand.DESTROY_FLAGS_LIST);

            // prompt if inputs are empty and set it in the context
            ctx.config = {
              chartDirectory: self.configManager.getFlag<string>(flags.chartDirectory) as string,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                self.configManager.getFlag<string>(flags.nodeAliasesUnparsed) as string,
              ),
              clusterRef: self.configManager.getFlag<string>(flags.clusterRef) as string,
            } as RelayDestroyConfigClass;

            if (ctx.config.clusterRef) {
              const context = self.remoteConfigManager.getClusterRefs()[ctx.config.clusterRef];
              if (context) ctx.config.context = context;
            }

            ctx.config.releaseName = this.prepareReleaseName(ctx.config.nodeAliases);
            ctx.config.isChartInstalled = await this.chartManager.isChartInstalled(
              ctx.config.namespace,
              ctx.config.releaseName,
              ctx.config.context,
            );

            self.logger.debug('Initialized config', {config: ctx.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async ctx => {
            const config = ctx.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, ctx.config.context);

            this.logger.showList(
              'Destroyed Relays',
              await self.chartManager.getInstalledCharts(config.namespace, config.context),
            );

            // reset nodeAliasesUnparsed
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        this.removeRelayComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError('Error uninstalling relays', e);
    } finally {
      await lease.release();
    }

    return true;
  }

  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: RelayCommand.COMMAND_NAME,
      desc: 'Manage JSON RPC relays in solo network',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: (y: any) => {
              flags.setCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST);
            },
            handler: async (argv: any) => {
              self.logger.info("==== Running 'relay deploy' ===", {argv});
              self.logger.info(argv);

              await self.deploy(argv).then(r => {
                self.logger.info('==== Finished running `relay deploy`====');
                if (!r) throw new SoloError('Error deploying relay, expected return value to be true');
              });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy JSON RPC relay',
            builder: (y: any) =>
              flags.setCommandFlags(y, flags.chartDirectory, flags.deployment, flags.quiet, flags.nodeAliasesUnparsed),
            handler: async (argv: any) => {
              self.logger.info("==== Running 'relay destroy' ===", {argv});
              self.logger.debug(argv);

              await self.destroy(argv).then(r => {
                self.logger.info('==== Finished running `relay destroy`====');

                if (!r) throw new SoloError('Error destroying relay, expected return value to be true');
              });
            },
          })
          .demandCommand(1, 'Select a relay command');
      },
    };
  }

  /** Adds the relay component to remote config. */
  public addRelayComponent(): SoloListrTask<any> {
    return {
      title: 'Add relay component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          remoteConfig.components.add(new RelayComponent('relay', cluster, namespace.name, nodeAliases));
        });
      },
    };
  }

  /** Remove the relay component from remote config. */
  public removeRelayComponent(): SoloListrTask<any> {
    return {
      title: 'Remove relay component from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('relay', ComponentType.Relay);
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
