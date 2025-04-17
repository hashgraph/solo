// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import {ListrRemoteConfig} from '../core/config/remote/listr-config-tasks.js';
import {type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeExplorerComponent} from '../core/config/remote/components/mirror-node-explorer-component.js';
import {prepareValuesFiles, showVersionBanner} from '../core/helpers.js';
import {type Optional, type SoloListrTask} from '../types/index.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {KeyManager} from '../core/key-manager.js';
import {
  EXPLORER_INGRESS_CONTROLLER,
  EXPLORER_INGRESS_TLS_SECRET_NAME,
  HEDERA_EXPLORER_CHART_URL,
  INGRESS_CONTROLLER_PREFIX,
} from '../core/constants.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import * as helpers from '../core/helpers.js';

interface ExplorerDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  clusterRef: string;
  clusterContext: string;
  enableIngress: boolean;
  enableHederaExplorerTls: boolean;
  ingressControllerValueFile: string;
  hederaExplorerTlsHostName: string;
  hederaExplorerStaticIp: string | '';
  hederaExplorerVersion: string;
  mirrorNamespace: NamespaceName;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  valuesArg: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  soloChartVersion: string;
  domainName: Optional<string>;
}

interface ExplorerDeployContext {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

interface ExplorerDestroyContext {
  config: {
    clusterContext: string;
    namespace: NamespaceName;
    isChartInstalled: boolean;
  };
}

export class ExplorerCommand extends BaseCommand {
  private readonly profileManager: ProfileManager;

  public constructor(options: Options) {
    super(options);
    if (!options || !options.profileManager) {
      throw new MissingArgumentError('An instance of core/ProfileManager is required', options.downloader);
    }

    this.profileManager = options.profileManager;
  }

  public static readonly COMMAND_NAME = 'explorer';

  private static readonly DEPLOY_CONFIGS_NAME = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.chartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableHederaExplorerTls,
      flags.hederaExplorerTlsHostName,
      flags.hederaExplorerStaticIp,
      flags.hederaExplorerVersion,
      flags.mirrorNamespace,
      flags.namespace,
      flags.deployment,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
    ],
  };

  private static readonly DESTROY_FLAGS_LIST = {
    required: [],
    optional: [flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.deployment],
  };

  /**
   * @param config - the configuration object
   */
  private async prepareHederaExplorerValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile: string = await this.profileManager.prepareValuesHederaExplorerChart(profileName);
    if (profileValuesFile) {
      valuesArgument += prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }

    if (config.enableIngress) {
      valuesArgument += ' --set ingress.enabled=true';
      valuesArgument += ` --set ingressClassName=${constants.EXPLORER_INGRESS_CLASS_NAME}`;
    }
    valuesArgument += ` --set fullnameOverride=${constants.HEDERA_EXPLORER_RELEASE_NAME}`;

    if (config.mirrorNamespace) {
      // use fully qualified service name for mirror node since the explorer is in a different namespace
      valuesArgument += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest.${config.mirrorNamespace}.svc.cluster.local" `;
    } else {
      valuesArgument += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest" `;
    }

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
      });

      if (config.tlsClusterIssuerType === 'self-signed') {
        // Create TLS secret for Explorer
        await KeyManager.createTlsSecret(
          this.k8Factory,
          config.namespace,
          config.domainName,
          config.cacheDir,
          EXPLORER_INGRESS_TLS_SECRET_NAME,
        );

        if (config.enableIngress) {
          valuesArgument += ` --set ingress.tls[0].hosts[0]=${config.domainName}`;
        }
      }
    }
    return valuesArgument;
  }

  /**
   * @param config - the configuration object
   */
  private async prepareCertManagerChartValuesArg(config: ExplorerDeployConfigClass): Promise<string> {
    const {tlsClusterIssuerType, namespace} = config;

    let valuesArgument = '';

    if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
      throw new Error(
        `Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`,
      );
    }

    const clusterChecks: ClusterChecks = container.resolve(InjectTokens.ClusterChecks);

    if (!(await clusterChecks.isCertManagerInstalled())) {
      valuesArgument += ' --set cert-manager.installCRDs=true';
    }

    if (tlsClusterIssuerType === 'self-signed') {
      valuesArgument += ' --set selfSignedClusterIssuer.enabled=true';
    } else {
      valuesArgument += ` --set global.explorerNamespace=${namespace}`;
      valuesArgument += ' --set acmeClusterIssuer.enabled=true';
      valuesArgument += ` --set certClusterIssuerType=${tlsClusterIssuerType}`;
    }
    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }
    return valuesArgument;
  }

  private async prepareValuesArg(config: ExplorerDeployConfigClass) {
    let valuesArgument = '';
    if (config.valuesFile) {
      valuesArgument += prepareValuesFiles(config.valuesFile);
    }
    return valuesArgument;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            self.configManager.update(argv);

            // disable the prompts that we don't want to prompt the user for
            flags.disablePrompts([
              flags.enableHederaExplorerTls,
              flags.hederaExplorerTlsHostName,
              flags.ingressControllerValueFile,
              flags.hederaExplorerStaticIp,
              flags.hederaExplorerVersion,
              flags.mirrorNamespace,
              flags.tlsClusterIssuerType,
              flags.valuesFile,
              flags.profileFile,
            ]);

            const allFlags = [
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional,
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.required,
            ];
            await self.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(ExplorerCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'valuesArg',
            ]) as ExplorerDeployConfigClass;

            context_.config.valuesArg += await self.prepareValuesArg(context_.config);
            context_.config.clusterContext = context_.config.clusterRef
              ? this.localConfig.clusterRefs[context_.config.clusterRef]
              : this.k8Factory.default().contexts().readCurrent();

            if (
              !(await self.k8Factory.getK8(context_.config.clusterContext).namespaces().has(context_.config.namespace))
            ) {
              throw new SoloError(`namespace ${context_.config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        ListrRemoteConfig.loadRemoteConfig(this.remoteConfigManager, argv),
        {
          title: 'Install cert manager',
          task: async context_ => {
            const config = context_.config;
            const {soloChartVersion} = config;

            const soloCertManagerValuesArgument = await self.prepareCertManagerChartValuesArg(config);
            // check if CRDs of cert-manager are already installed
            let needInstall = false;
            for (const crd of constants.CERT_MANAGER_CRDS) {
              const crdExists = await self.k8Factory.getK8(context_.config.clusterContext).crds().ifExists(crd);
              if (!crdExists) {
                needInstall = true;
                break;
              }
            }

            if (needInstall) {
              // if cert-manager isn't already installed we want to install it separate from the certificate issuers
              // as they will fail to be created due to the order of the installation being dependent on the cert-manager
              // being installed first
              await self.chartManager.install(
                NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
                constants.SOLO_CERT_MANAGER_CHART,
                constants.SOLO_CERT_MANAGER_CHART,
                context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
                soloChartVersion,
                '  --set cert-manager.installCRDs=true',
                context_.config.clusterContext,
              );
              showVersionBanner(self.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion);
            }

            // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
            await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                constants.DEFAULT_CERT_MANAGER_NAMESPACE,
                [
                  'app.kubernetes.io/component=webhook',
                  `app.kubernetes.io/instance=${constants.SOLO_CERT_MANAGER_CHART}`,
                ],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );

            // sleep for a few seconds to allow cert-manager to be ready
            await new Promise(resolve => setTimeout(resolve, 10_000));

            await self.chartManager.upgrade(
              NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
              constants.SOLO_CERT_MANAGER_CHART,
              constants.SOLO_CERT_MANAGER_CHART,
              context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
              soloChartVersion,
              soloCertManagerValuesArgument,
              context_.config.clusterContext,
            );
            showVersionBanner(self.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion, 'Upgraded');
          },
          skip: context_ => !context_.config.enableHederaExplorerTls,
        },

        {
          title: 'Install explorer',
          task: async context_ => {
            const config = context_.config;

            let exploreValuesArgument = prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
            exploreValuesArgument += await self.prepareHederaExplorerValuesArg(config);

            await self.chartManager.install(
              config.namespace,
              constants.HEDERA_EXPLORER_RELEASE_NAME,
              '',
              HEDERA_EXPLORER_CHART_URL,
              config.hederaExplorerVersion,
              exploreValuesArgument,
              context_.config.clusterContext,
            );
            showVersionBanner(self.logger, constants.HEDERA_EXPLORER_RELEASE_NAME, config.hederaExplorerVersion);
          },
        },
        {
          title: 'Install explorer ingress controller',
          task: async context_ => {
            const config = context_.config;

            let explorerIngressControllerValuesArgument: string = '';

            if (config.hederaExplorerStaticIp !== '') {
              explorerIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${config.hederaExplorerStaticIp}`;
            }
            explorerIngressControllerValuesArgument += ` --set fullnameOverride=${EXPLORER_INGRESS_CONTROLLER}`;
            explorerIngressControllerValuesArgument += ` --set controller.ingressClass=${constants.EXPLORER_INGRESS_CLASS_NAME}`;
            explorerIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${constants.EXPLORER_INGRESS_CONTROLLER}`;
            if (config.tlsClusterIssuerType === 'self-signed') {
              explorerIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);
            }

            await self.chartManager.install(
              config.namespace,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
              explorerIngressControllerValuesArgument,
              context_.config.clusterContext,
            );
            showVersionBanner(
              self.logger,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
              INGRESS_CONTROLLER_VERSION,
            );

            // patch explorer ingress to use h1 protocol, haproxy ingress controller default backend protocol is h2
            // to support grpc over http/2
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingresses()
              .update(config.namespace, constants.HEDERA_EXPLORER_RELEASE_NAME, {
                metadata: {
                  annotations: {
                    'haproxy-ingress.github.io/backend-protocol': 'h1',
                  },
                },
              });
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .create(constants.EXPLORER_INGRESS_CLASS_NAME, INGRESS_CONTROLLER_PREFIX + EXPLORER_INGRESS_CONTROLLER);
          },
          skip: context_ => !context_.config.enableIngress,
        },
        {
          title: 'Check explorer pod is ready',
          task: async context_ => {
            await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                [constants.SOLO_HEDERA_EXPLORER_LABEL],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
        },
        {
          title: 'Check haproxy ingress controller pod is ready',
          task: async context_ => {
            await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                [
                  `app.kubernetes.io/name=${constants.INGRESS_CONTROLLER_RELEASE_NAME}`,
                  `app.kubernetes.io/instance=${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}`,
                ],
                constants.PODS_READY_MAX_ATTEMPTS,
                constants.PODS_READY_DELAY,
              );
          },
          skip: context_ => !context_.config.enableIngress,
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
    } catch (error) {
      throw new SoloError(`Error deploying explorer: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            if (!argv.force) {
              const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the explorer?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            const clusterReference = this.configManager.getFlag<string>(flags.clusterRef) as string;
            const clusterContext = clusterReference
              ? this.localConfig.clusterRefs[clusterReference]
              : this.k8Factory.default().contexts().readCurrent();

            context_.config = {
              namespace,
              clusterContext,
              isChartInstalled: await this.chartManager.isChartInstalled(
                namespace,
                constants.HEDERA_EXPLORER_RELEASE_NAME,
                clusterContext,
              ),
            };

            if (!(await self.k8Factory.getK8(context_.config.clusterContext).namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace.name} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        ListrRemoteConfig.loadRemoteConfig(this.remoteConfigManager, argv),
        {
          title: 'Destroy explorer',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.HEDERA_EXPLORER_RELEASE_NAME,
              context_.config.clusterContext,
            );
          },
          skip: context_ => !context_.config.isChartInstalled,
        },
        {
          title: 'Uninstall explorer ingress controller',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
            );
            // delete ingress class if found one
            const existingIngressClasses = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map(ingressClass => {
              if (ingressClass.name === constants.EXPLORER_INGRESS_CLASS_NAME) {
                this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(constants.EXPLORER_INGRESS_CLASS_NAME);
              }
            });
          },
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
    } catch (error) {
      throw new SoloError(`Error destroy explorer: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition() {
    const self = this;
    return {
      command: ExplorerCommand.COMMAND_NAME,
      desc: 'Manage Explorer in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy explorer',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running explorer deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer deploy`====');
                  if (!r) {
                    throw new Error('Explorer deployment failed, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Explorer deployment failed: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy explorer',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...ExplorerCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info('==== Running explorer destroy ===');
              self.logger.info(argv);

              await self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running explorer destroy ====');
                  if (!r) {
                    throw new SoloError('Explorer destruction failed, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Explorer destruction failed: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a explorer command');
      },
    };
  }

  /** Removes the explorer components from remote config. */
  private removeMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDestroyContext> {
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
  private addMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDeployContext> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = context_;
          const cluster = this.remoteConfigManager.currentCluster;
          remoteConfig.components.add(new MirrorNodeExplorerComponent('mirrorNodeExplorer', cluster, namespace.name));
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
