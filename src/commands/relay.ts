// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import * as helpers from '../core/helpers.js';
import {getNodeAccountMap, showVersionBanner} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {JSON_RPC_RELAY_CHART} from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {
  type AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type RelayComponent} from '../core/config/remote/components/relay-component.js';
import * as Base64 from 'js-base64';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterReference, type Context, type DeploymentName} from '../core/config/remote/types.js';
import {type CommandDefinition, type Optional, type SoloListr, type SoloListrTask} from '../types/index.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {ComponentFactory} from '../core/config/remote/components/component-factory.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type K8} from '../integration/kube/k8.js';
import {type NodeServiceMapping} from '../types/mappings/node-service-mapping.js';
import {type Lock} from '../core/lock/lock.js';

interface RelayDestroyConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  clusterRef: Optional<ClusterReference>;
  context: Optional<string>;
  relayId: number;
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
  newRelayComponents: RelayComponent;
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

  public static readonly COMMAND_NAME: string = 'relay';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
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

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.relayId],
    optional: [flags.chartDirectory, flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef, flags.quiet],
  };

  private async prepareValuesArgForRelay({
    valuesFile,
    nodeAliases,
    chainId,
    relayReleaseTag,
    replicaCount,
    operatorId,
    operatorKey,
    namespace,
    domainName,
    context,
    newRelayComponents,
  }: RelayDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArgument += ` --set config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArgument += ' --set config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    if (chainId) {
      valuesArgument += ` --set config.CHAIN_ID=${chainId}`;
    }

    if (relayReleaseTag) {
      valuesArgument += ` --set image.tag=${relayReleaseTag.replace(/^v/, '')}`;
    }

    if (replicaCount) {
      valuesArgument += ` --set replicaCount=${replicaCount}`;
    }

    const operatorIdUsing: string = operatorId || constants.OPERATOR_ID;
    valuesArgument += ` --set config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
        const namespace: NamespaceName = NamespaceName.of(this.localConfig.deployments[deploymentName].namespace);

        const k8: K8 = this.k8Factory.getK8(context);
        const secrets = await k8.secrets().list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
        }
      } catch (error) {
        throw new SoloError(`Error getting operator key: ${error.message}`, error);
      }
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkJsonString: string = await this.prepareNetworkJsonString(nodeAliases, namespace);
    valuesArgument += ` --set config.HEDERA_NETWORK='${networkJsonString}'`;

    if (domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: newRelayComponents.name});

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

    const networkIds: Record<string, string> = {};

    const accountMap: Map<NodeAlias, string> = getNodeAccountMap(nodeAliases);
    const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServicesMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfigManager.getClusterRefs(),
      deploymentName,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp: string = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort: string | number = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey: string = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private getReleaseName(relayIndex: number): string {
    return constants.RELAY_RELEASE_NAME + '-' + relayIndex;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<RelayDeployContext> = new Listr<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts([
              flags.operatorId,
              flags.operatorKey,
              flags.clusterRef,
              flags.profileFile,
              flags.profileName,
            ]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DEPLOY_FLAGS_LIST.required,
              ...RelayCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

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

            if (context_.config.clusterRef) {
              const context: Context = this.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare release name and relay name',
          task: (context_): void => {
            const config: RelayDeployConfigClass = context_.config;

            const newRelayIndex: number = this.remoteConfigManager.components.getNewComponentIndex(
              ComponentTypes.Relay,
            );

            config.newRelayComponents = ComponentFactory.createNewRelayComponent(
              this.remoteConfigManager,
              config.clusterRef,
              config.namespace,
              config.nodeAliases,
            );

            config.releaseName = this.getReleaseName(newRelayIndex);
          },
        },
        {
          title: 'Check chart is installed',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfigManager.getClusterRefs(),
              this.configManager.getFlag<DeploymentName>(flags.deployment),
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            config.valuesArg = await this.prepareValuesArgForRelay(config);
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              JSON_RPC_RELAY_CHART,
              JSON_RPC_RELAY_CHART,
              '',
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);
          },
        },
        {
          title: 'Check relay is running',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                ['app=hedera-json-rpc-relay', `app.kubernetes.io/instance=${config.newRelayComponents.name}`],
                constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
                constants.RELAY_PODS_RUNNING_DELAY,
              );

            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
        },
        {
          title: 'Check relay is ready',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;
            const k8: K8 = this.k8Factory.getK8(config.context);
            try {
              await k8
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  ['app=hedera-json-rpc-relay', `app.kubernetes.io/instance=${config.newRelayComponents.name}`],
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
      await this.accountManager.close();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<RelayDestroyContext> = new Listr<RelayDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DESTROY_FLAGS_LIST.required,
              ...RelayCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = {
              chartDirectory: this.configManager.getFlag(flags.chartDirectory),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                this.configManager.getFlag(flags.nodeAliasesUnparsed),
                this.remoteConfigManager.getConsensusNodes(),
                this.configManager,
              ),
              clusterRef: this.configManager.getFlag(flags.clusterRef),
              relayId: this.configManager.getFlag<number>(flags.relayId),
            } as RelayDestroyConfigClass;

            if (context_.config.clusterRef) {
              const context: Context = this.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            context_.config.releaseName = this.getReleaseName(context_.config.relayId);

            context_.config.isChartInstalled = await this.chartManager.isChartInstalled(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.context,
            );

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async (context_): Promise<void> => {
            const config: RelayDestroyConfigClass = context_.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);

            this.logger.showList(
              'Destroyed Relays',
              await this.chartManager.getInstalledCharts(config.namespace, config.context),
            );

            // reset nodeAliasesUnparsed
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        this.disableRelayComponent(),
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

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: RelayCommand.COMMAND_NAME,
      desc: 'Manage JSON RPC relays in solo network',
      builder: (yargs: AnyYargs): AnyYargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
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
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
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
        const config: RelayDeployConfigClass = context_.config;

        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.addNewComponent(config.newRelayComponents);
        });
      },
    };
  }

  /** Remove the relay component from remote config. */
  public disableRelayComponent(): SoloListrTask<RelayDestroyContext> {
    return {
      title: 'Remove relay component from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        const config: RelayDestroyConfigClass = context_.config;

        await this.remoteConfigManager.modify(async remoteConfig => {
          const component: RelayComponent = remoteConfig.components.getComponentById(
            ComponentTypes.Relay,
            config.relayId,
          );

          remoteConfig.components.disableComponent(component.name, ComponentTypes.Relay);
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
