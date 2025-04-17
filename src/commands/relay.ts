// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import * as helpers from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import {showVersionBanner} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type AnyYargs, type ArgvStruct, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {RelayComponent} from '../core/config/remote/components/relay-component.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import * as Base64 from 'js-base64';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterReference, type DeploymentName} from '../core/config/remote/types.js';
import {type Optional, type SoloListrTask} from '../types/index.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';
import {JSON_RPC_RELAY_CHART} from '../core/constants.js';

interface RelayDestroyConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  clusterRef: Optional<ClusterReference>;
  context: Optional<string>;
}

interface RelayDestroyContext {
  config: RelayDestroyConfigClass;
}

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
  isChartInstalled: boolean;
  nodeAliases: NodeAliases;
  releaseName: string;
  valuesArg: string;
  clusterRef: Optional<ClusterReference>;
  domainName: Optional<string>;
  context: Optional<string>;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
}

export class RelayCommand extends BaseCommand {
  private readonly profileManager: ProfileManager;
  private readonly accountManager: AccountManager;

  public constructor(options: Options) {
    super(options);

    if (!options || !options.profileManager) {
      throw new MissingArgumentError('An instance of core/ProfileManager is required', options.downloader);
    }

    this.profileManager = options.profileManager;
    this.accountManager = options.accountManager;
  }

  public static readonly COMMAND_NAME = 'relay';

  private static readonly DEPLOY_CONFIGS_NAME = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST = {
    required: [],
    optional: [
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
      flags.domainName,
    ],
  };

  private static readonly DESTROY_FLAGS_LIST = {
    required: [],
    optional: [flags.chartDirectory, flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef, flags.quiet],
  };

  private async prepareValuesArgForRelay(
    valuesFile: string,
    nodeAliases: NodeAliases,
    chainID: string,
    relayRelease: string,
    replicaCount: number,
    operatorID: string,
    operatorKey: string,
    namespace: NamespaceName,
    domainName: Optional<string>,
    context?: Optional<string>,
  ): Promise<string> {
    let valuesArgument = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArgument += ` --set config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArgument += ' --set config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    if (chainID) {
      valuesArgument += ` --set config.CHAIN_ID=${chainID}`;
    }

    if (relayRelease) {
      valuesArgument += ` --set image.tag=${relayRelease.replace(/^v/, '')}`;
    }

    if (replicaCount) {
      valuesArgument += ` --set replicaCount=${replicaCount}`;
    }

    const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const operatorIdUsing: string = operatorID || this.accountManager.getOperatorAccountId(deploymentName).toString();
    valuesArgument += ` --set config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const namespace = NamespaceName.of(this.localConfig.deployments[deploymentName].namespace);

        const k8 = this.k8Factory.getK8(context);
        const secrets = await k8.secrets().list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8 = Base64.decode(secrets[0].data.privateKey);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
        }
      } catch (error) {
        throw new SoloError(`Error getting operator key: ${error.message}`, error);
      }
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkJsonString = await this.prepareNetworkJsonString(nodeAliases, namespace);
    valuesArgument += ` --set config.HEDERA_NETWORK='${networkJsonString}'`;

    if (domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    if (valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(valuesFile);
    }

    return valuesArgument;
  }

  /**
   * created a JSON string to represent the map between the node keys and their ids
   * output example '{"node-1": "0.0.3", "node-2": "0.004"}'
   */
  private async prepareNetworkJsonString(nodeAliases: NodeAliases = [], namespace: NamespaceName): Promise<string> {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkIds = {};

    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const accountMap = this.accountManager.getNodeAccountMap(nodeAliases, deploymentName);
    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private prepareReleaseName(nodeAliases: NodeAliases = []): string {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    let releaseName = 'relay';
    for (const nodeAlias of nodeAliases) {
      releaseName += `-${nodeAlias}`;
    }

    return releaseName;
  }

  private async deploy(argv: ArgvStruct) {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
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

            const allFlags = [...RelayCommand.DEPLOY_FLAGS_LIST.required, ...RelayCommand.DEPLOY_FLAGS_LIST.optional];
            await self.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = this.configManager.getConfig(RelayCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'nodeAliases',
            ]) as RelayDeployConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );
            context_.config.nodeAliases = helpers.parseNodeAliases(
              context_.config.nodeAliasesUnparsed,
              this.remoteConfigManager.getConsensusNodes(),
              this.configManager,
            );
            context_.config.releaseName = self.prepareReleaseName(context_.config.nodeAliases);

            if (context_.config.clusterRef) {
              const context = self.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            self.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async context_ => {
            const config = context_.config;

            config.isChartInstalled = await self.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async context_ => {
            const config = context_.config;
            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            config.valuesArg = await self.prepareValuesArgForRelay(
              config.valuesFile,
              config.nodeAliases,
              config.chainId,
              config.relayReleaseTag,
              config.replicaCount,
              config.operatorId,
              config.operatorKey,
              config.namespace,
              config.domainName,
              config.context,
            );
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async context_ => {
            const config = context_.config;

            const kubeContext = self.k8Factory.getK8(config.context).contexts().readCurrent();

            await self.chartManager.install(
              config.namespace,
              config.releaseName,
              JSON_RPC_RELAY_CHART,
              JSON_RPC_RELAY_CHART,
              '',
              config.valuesArg,
              kubeContext,
            );

            showVersionBanner(self.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);
          },
        },
        {
          title: 'Check relay is running',
          task: async context_ => {
            const config = context_.config;

            await self.k8Factory
              .getK8(config.context)
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
          task: async context_ => {
            const config = context_.config;
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
            } catch (error) {
              throw new SoloError(`Relay ${config.releaseName} is not ready: ${error.message}`, error);
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
    } catch (error) {
      throw new SoloError(`Error deploying relay: ${error.message}`, error);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct) {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<RelayDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const allFlags = [...RelayCommand.DESTROY_FLAGS_LIST.required, ...RelayCommand.DESTROY_FLAGS_LIST.optional];
            await self.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = {
              chartDirectory: self.configManager.getFlag<string>(flags.chartDirectory) as string,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                self.configManager.getFlag<string>(flags.nodeAliasesUnparsed) as string,
                this.remoteConfigManager.getConsensusNodes(),
                this.configManager,
              ),
              clusterRef: self.configManager.getFlag<string>(flags.clusterRef) as string,
            } as RelayDestroyConfigClass;

            if (context_.config.clusterRef) {
              const context = self.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            context_.config.releaseName = this.prepareReleaseName(context_.config.nodeAliases);
            context_.config.isChartInstalled = await this.chartManager.isChartInstalled(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.context,
            );

            self.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async context_ => {
            const config = context_.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, context_.config.context);

            this.logger.showList(
              'Destroyed Relays',
              await self.chartManager.getInstalledCharts(config.namespace, config.context),
            );

            // reset nodeAliasesUnparsed
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: context_ => !context_.config.isChartInstalled,
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
    } catch (error) {
      throw new SoloError('Error uninstalling relays', error);
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition() {
    const self = this;
    return {
      command: RelayCommand.COMMAND_NAME,
      desc: 'Manage JSON RPC relays in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'relay deploy' ===", {argv});
              self.logger.info(argv);

              await self.deploy(argv).then(r => {
                self.logger.info('==== Finished running `relay deploy`====');
                if (!r) {
                  throw new SoloError('Error deploying relay, expected return value to be true');
                }
              });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy JSON RPC relay',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'relay destroy' ===", {argv});
              self.logger.debug(argv);

              await self.destroy(argv).then(r => {
                self.logger.info('==== Finished running `relay destroy`====');

                if (!r) {
                  throw new SoloError('Error destroying relay, expected return value to be true');
                }
              });
            },
          })
          .demandCommand(1, 'Select a relay command');
      },
    };
  }

  /** Adds the relay component to remote config. */
  public addRelayComponent(): SoloListrTask<RelayDeployContext> {
    return {
      title: 'Add relay component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = context_;
          const cluster = this.remoteConfigManager.currentCluster;

          remoteConfig.components.add(new RelayComponent('relay', cluster, namespace.name, nodeAliases));
        });
      },
    };
  }

  /** Remove the relay component from remote config. */
  public removeRelayComponent(): SoloListrTask<RelayDestroyContext> {
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

  public async close(): Promise<void> {} // no-op
}
