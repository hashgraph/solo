/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {Listr} from 'listr2';
import {SoloError, MissingArgumentError} from '../core/errors.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile_manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {ListrRemoteConfig} from '../core/config/remote/listr_config_tasks.js';
import {type CommandBuilder} from '../types/aliases.js';
import {type Opts} from '../types/command_types.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeExplorerComponent} from '../core/config/remote/components/mirror_node_explorer_component.js';
import {type SoloListrTask} from '../types/index.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type NamespaceName} from '../core/kube/namespace_name.js';
import {ClusterChecks} from '../core/cluster_checks.js';
import {container} from 'tsyringe-neo';

interface ExplorerDeployConfigClass {
  chartDirectory: string;
  enableHederaExplorerTls: boolean;
  hederaExplorerTlsHostName: string;
  hederaExplorerTlsLoadBalancerIp: string | '';
  hederaExplorerVersion: string;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  valuesArg: string;
  getUnusedConfigs: () => string[];
  clusterSetupNamespace: NamespaceName;
  soloChartVersion: string;
}

interface Context {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

export class ExplorerCommand extends BaseCommand {
  private readonly profileManager: ProfileManager;

  constructor(opts: Opts) {
    super(opts);
    if (!opts || !opts.profileManager)
      throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader);

    this.profileManager = opts.profileManager;
  }

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.chartDirectory,
      flags.enableHederaExplorerTls,
      flags.hederaExplorerTlsHostName,
      flags.hederaExplorerTlsLoadBalancerIp,
      flags.hederaExplorerVersion,
      flags.deployment,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.clusterSetupNamespace,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
    ];
  }

  async prepareHederaExplorerValuesArg(config: {valuesFile: string}) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesHederaExplorerChart(profileName);
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }

    valuesArg += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest" `;
    return valuesArg;
  }

  /**
   * @param config
   * @param config.tlsClusterIssuerType - must be one of - acme-staging, acme-prod, or self-signed
   * @param config.namespace - used for classname ingress class name prefix
   * @param config.hederaExplorerTlsLoadBalancerIp - can be an empty string
   * @param config.hederaExplorerTlsHostName
   */
  private async prepareSoloChartSetupValuesArg(config: ExplorerDeployConfigClass) {
    const {tlsClusterIssuerType, namespace, hederaExplorerTlsLoadBalancerIp, hederaExplorerTlsHostName} = config;

    let valuesArg = '';

    if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
      throw new Error(
        `Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`,
      );
    }

    const clusterChecks: ClusterChecks = container.resolve(ClusterChecks);

    // Install ingress controller only if it's not already present
    if (!(await clusterChecks.isIngressControllerInstalled())) {
      valuesArg += ' --set ingress.enabled=true';
      valuesArg += ' --set haproxyIngressController.enabled=true';
      valuesArg += ` --set ingressClassName=${namespace}-hedera-explorer-ingress-class`;
      valuesArg += ` --set-json 'ingress.hosts[0]={"host":"${hederaExplorerTlsHostName}","paths":[{"path":"/","pathType":"Prefix"}]}'`;
    }

    if (!(await clusterChecks.isCertManagerInstalled())) {
      valuesArg += ' --set cloud.certManager.enabled=true';
      valuesArg += ' --set cert-manager.installCRDs=true';
    }

    if (hederaExplorerTlsLoadBalancerIp !== '') {
      valuesArg += ` --set haproxy-ingress.controller.service.loadBalancerIP=${hederaExplorerTlsLoadBalancerIp}`;
    }

    if (tlsClusterIssuerType === 'self-signed') {
      valuesArg += ' --set selfSignedClusterIssuer.enabled=true';
    } else {
      valuesArg += ' --set acmeClusterIssuer.enabled=true';
      valuesArg += ` --set certClusterIssuerType=${tlsClusterIssuerType}`;
    }

    return valuesArg;
  }

  async prepareValuesArg(config: ExplorerDeployConfigClass) {
    let valuesArg = '';
    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }
    return valuesArg;
  }

  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);

            // disable the prompts that we don't want to prompt the user for
            flags.disablePrompts([
              flags.enableHederaExplorerTls,
              flags.hederaExplorerTlsHostName,
              flags.hederaExplorerTlsLoadBalancerIp,
              flags.hederaExplorerVersion,
              flags.tlsClusterIssuerType,
              flags.valuesFile,
            ]);

            await self.configManager.executePrompt(task, ExplorerCommand.DEPLOY_FLAGS_LIST);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            ctx.config = this.getConfig(ExplorerCommand.DEPLOY_CONFIGS_NAME, ExplorerCommand.DEPLOY_FLAGS_LIST, [
              'valuesArg',
              'namespace',
            ]) as ExplorerDeployConfigClass;

            ctx.config.valuesArg += await self.prepareValuesArg(ctx.config);
            ctx.config.namespace = namespace;

            if (!(await self.k8.hasNamespace(ctx.config.namespace))) {
              throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
            }

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        ListrRemoteConfig.loadRemoteConfig(this, argv),
        {
          title: 'Upgrade solo-setup chart',
          task: async ctx => {
            const config = ctx.config;
            const {chartDirectory, clusterSetupNamespace, soloChartVersion} = config;

            const chartPath = await this.prepareChartPath(
              chartDirectory,
              constants.SOLO_TESTING_CHART_URL,
              constants.SOLO_CLUSTER_SETUP_CHART,
            );

            const soloChartSetupValuesArg = await self.prepareSoloChartSetupValuesArg(config);

            // if cert-manager isn't already installed we want to install it separate from the certificate issuers
            // as they will fail to be created due to the order of the installation being dependent on the cert-manager
            // being installed first
            if (soloChartSetupValuesArg.includes('cloud.certManager.enabled=true')) {
              await self.chartManager.upgrade(
                clusterSetupNamespace,
                constants.SOLO_CLUSTER_SETUP_CHART,
                chartPath,
                soloChartVersion,
                '  --set cloud.certManager.enabled=true --set cert-manager.installCRDs=true',
              );
            }

            // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
            await self.k8.waitForPodReady(
              [
                'app.kubernetes.io/component=webhook',
                `app.kubernetes.io/instance=${constants.SOLO_CLUSTER_SETUP_CHART}`,
              ],
              1,
              constants.PODS_READY_MAX_ATTEMPTS,
              constants.PODS_READY_DELAY,
              constants.DEFAULT_CERT_MANAGER_NAMESPACE,
            );

            await self.chartManager.upgrade(
              clusterSetupNamespace,
              constants.SOLO_CLUSTER_SETUP_CHART,
              chartPath,
              soloChartVersion,
              soloChartSetupValuesArg,
            );
          },
          skip: ctx => !ctx.config.enableHederaExplorerTls,
        },

        {
          title: 'Install explorer',
          task: async ctx => {
            const config = ctx.config;

            let exploreValuesArg = self.prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
            exploreValuesArg += await self.prepareHederaExplorerValuesArg(config);

            await self.chartManager.install(
              config.namespace,
              constants.HEDERA_EXPLORER_RELEASE_NAME,
              constants.HEDERA_EXPLORER_CHART_URL,
              config.hederaExplorerVersion,
              exploreValuesArg,
            );
          },
        },
        {
          title: 'Check explorer pod is ready',
          task: async () => {
            await self.k8.waitForPodReady(
              [constants.SOLO_HEDERA_EXPLORER_LABEL],
              1,
              constants.PODS_READY_MAX_ATTEMPTS,
              constants.PODS_READY_DELAY,
            );
          },
        },
        {
          title: 'Check haproxy ingress pod is ready',
          task: async () => {
            await self.k8.waitForPodReady(
              [
                'app.kubernetes.io/name=haproxy-ingress',
                `app.kubernetes.io/instance=${constants.SOLO_CLUSTER_SETUP_CHART}`,
              ],
              1,
              constants.PODS_READY_MAX_ATTEMPTS,
              constants.PODS_READY_DELAY,
              constants.SOLO_SETUP_NAMESPACE,
            );
          },
          skip: ctx => !ctx.config.enableHederaExplorerTls,
        },
        this.addMirrorNodeExplorerComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('explorer deployment has completed');
    } catch (e) {
      const message = `Error deploying explorer: ${e.message}`;
      self.logger.error(message, e);
      throw new SoloError(message, e);
    } finally {
      await lease.release();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        namespace: NamespaceName;
        isChartInstalled: boolean;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
                type: 'toggle',
                default: false,
                message: 'Are you sure you would like to destroy the explorer?',
              });

              if (!confirm) {
                process.exit(0);
              }
            }

            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            if (!(await self.k8.hasNamespace(namespace))) {
              throw new SoloError(`namespace ${namespace} does not exist`);
            }

            ctx.config = {
              namespace,
              isChartInstalled: await this.chartManager.isChartInstalled(
                namespace,
                constants.HEDERA_EXPLORER_CHART_URL,
              ),
            };

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        ListrRemoteConfig.loadRemoteConfig(this, argv),
        {
          title: 'Destroy explorer',
          task: async ctx => {
            await this.chartManager.uninstall(ctx.config.namespace, constants.HEDERA_EXPLORER_RELEASE_NAME);
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        this.removeMirrorNodeExplorerComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('explorer destruction has completed');
    } catch (e) {
      throw new SoloError(`Error destroy explorer: ${e.message}`, e);
    } finally {
      await lease.release();
    }

    return true;
  }

  /** Return Yargs command definition for 'explorer' command */
  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'explorer',
      desc: 'Manage Explorer in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy explorer',
            builder: y => flags.setCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              self.logger.info("==== Running explorer deploy' ===");
              self.logger.info(argv);

              self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer deploy`====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy explorer',
            builder: y => flags.setCommandFlags(y, flags.chartDirectory, flags.force, flags.quiet, flags.deployment),
            handler: argv => {
              self.logger.info('==== Running explorer destroy ===');
              self.logger.info(argv);

              self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer destroy ====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a explorer command');
      },
    };
  }

  /** Removes the explorer components from remote config. */
  private removeMirrorNodeExplorerComponents(): SoloListrTask<object> {
    return {
      title: 'Remove explorer from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('mirrorNodeExplorer', ComponentType.MirrorNodeExplorer);
        });
      },
    };
  }

  /** Adds the explorer components to remote config. */
  private addMirrorNodeExplorerComponents(): SoloListrTask<{config: {namespace: NamespaceName}}> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;
          remoteConfig.components.add(
            'mirrorNodeExplorer',
            new MirrorNodeExplorerComponent('mirrorNodeExplorer', cluster, namespace.name),
          );
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
