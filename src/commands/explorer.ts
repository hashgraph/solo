// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {showVersionBanner, sleep} from '../core/helpers.js';
import {SharedClusterResourceReport} from '../core/shared-cluster-resource-report.js';
import {ClusterCrdProbe} from '../core/cluster-crd-probe.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  NamespaceNameAsString,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {KeyManager} from '../core/key-manager.js';
import {EXPLORER_VERSION, INGRESS_CONTROLLER_VERSION, MINIMUM_SOLO_CHART_VERSION} from '../../version.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Lock} from '../core/lock/lock.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {CommandFlag, CommandFlags} from '../types/flag-types.js';
import {Templates} from '../core/templates.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {assertUpgradeVersionNotOlder} from '../core/upgrade-version-guard.js';
import {UpgradeVersionResolver} from '../core/upgrade-version-resolver.js';
import {Duration} from '../core/time/duration.js';
import {ExplorerStateSchema} from '../data/schema/model/remote/state/explorer-state-schema.js';
import {K8} from '../integration/kube/k8.js';
import {createHash} from 'node:crypto';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {optionFromFlag} from './command-helpers.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {HelmSchedulingValues} from '../core/util/helm-scheduling-values.js';

interface ExplorerDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  explorerChartDirectory: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  enableExplorerTls: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  componentImage: Optional<string>;
  componentImageArchive: Optional<string>;
  loadBalancerEnabled: boolean;
  namespace: NamespaceName;
  tlsClusterIssuerType: string;
  valuesFile: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  soloChartVersion: string;
  domainName: Optional<string>;
  releaseName: string;
  ingressReleaseName: string;
  newExplorerComponent: ExplorerStateSchema;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  isChartInstalled: boolean;
  isLegacyChartInstalled: false;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface ExplorerDeployContext {
  config: ExplorerDeployConfigClass;
  addressBook: string;
}

interface ExplorerUpgradeConfigClass {
  cacheDir: string;
  chartDirectory: string;
  explorerChartDirectory: string;
  clusterRef: ClusterReferenceName;
  clusterContext: string;
  enableIngress: boolean;
  enableExplorerTls: boolean;
  ingressControllerValueFile: string;
  explorerTlsHostName: string;
  explorerStaticIp: string | '';
  explorerVersion: string;
  componentImage: Optional<string>;
  componentImageArchive: Optional<string>;
  loadBalancerEnabled: boolean;
  namespace: NamespaceName;
  tlsClusterIssuerType: string;
  valuesFile: string;
  clusterSetupNamespace: NamespaceName;
  getUnusedConfigs: () => string[];
  soloChartVersion: string;
  domainName: Optional<string>;
  releaseName: string;
  ingressReleaseName: string;
  forcePortForward: Optional<boolean>;
  id: ComponentId;
  isChartInstalled: boolean;
  isLegacyChartInstalled: boolean;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface ExplorerUpgradeContext {
  config: ExplorerUpgradeConfigClass;
  addressBook: string;
}

interface ExplorerDestroyContext {
  config: {
    clusterContext: string;
    clusterReference: ClusterReferenceName;
    namespace: NamespaceName;
    isChartInstalled: boolean;
    id: ComponentId;
    releaseName: string;
    ingressReleaseName: string;
    isLegacyChartInstalled: boolean;
  };
}

interface InferredData {
  id: ComponentId;
  releaseName: string;
  ingressReleaseName: string;
  isChartInstalled: boolean;
  isLegacyChartInstalled: boolean;
}

enum ExplorerCommandType {
  ADD = 'add',
  UPGRADE = 'upgrade',
  DESTROY = 'destroy',
}

@injectable()
export class ExplorerCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ClusterChecks) private readonly clusterChecks: ClusterChecks) {
    super();

    this.clusterChecks = patchInject(clusterChecks, InjectTokens.ClusterChecks, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.cacheDir,
      flags.chartDirectory,
      flags.explorerChartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.componentImage,
      flags.componentImageArchive,
      flags.loadBalancerEnabled,
      flags.namespace,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.clusterRef,
      flags.cacheDir,
      flags.chartDirectory,
      flags.explorerChartDirectory,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.enableExplorerTls,
      flags.explorerTlsHostName,
      flags.explorerStaticIp,
      flags.explorerVersion,
      flags.componentImage,
      flags.componentImageArchive,
      flags.loadBalancerEnabled,
      flags.namespace,
      flags.quiet,
      flags.soloChartVersion,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.clusterSetupNamespace,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,
      flags.id,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.chartDirectory, flags.clusterRef, flags.force, flags.quiet, flags.debugMode],
  };

  private async prepareHederaExplorerChartValues(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<HelmChartValues> {
    const chartValues: HelmChartValues = new HelmChartValues().filesFromCommaSeparatedInput(config.valuesFile);

    if (config.enableIngress) {
      chartValues.set('ingress.enabled', true).setLiteral('ingressClassName', config.ingressReleaseName);
    }

    if (config.loadBalancerEnabled) {
      chartValues.set('service.type', 'LoadBalancer');
    }
    chartValues.setLiteral('fullnameOverride', `${config.releaseName}-${config.namespace.name}`);

    chartValues.setLiteral(
      'proxyPass./api',
      Templates.renderMirrorNodeRestServiceUrl(config.mirrorNodeReleaseName, config.mirrorNamespace),
    );

    if (config.domainName) {
      chartValues.set('ingress.enabled', true).setLiteral('ingress.hosts[0].host', config.domainName);

      if (config.tlsClusterIssuerType === 'self-signed') {
        // Create TLS secret for Explorer
        await KeyManager.createTlsSecret(
          this.k8Factory,
          config.namespace,
          config.domainName,
          config.cacheDir,
          constants.EXPLORER_INGRESS_TLS_SECRET_NAME,
        );

        if (config.enableIngress) {
          chartValues.setLiteral('ingress.tls[0].hosts[0]', config.domainName);
        }
      }
    }
    return chartValues;
  }

  private async prepareCertManagerChartValues(
    config: ExplorerDeployConfigClass | ExplorerUpgradeConfigClass,
  ): Promise<HelmChartValues> {
    const {tlsClusterIssuerType, namespace} = config;

    const chartValues: HelmChartValues = new HelmChartValues();

    if (!(await this.clusterChecks.isCertManagerInstalled())) {
      chartValues.set('cert-manager.installCRDs', true);
    }

    if (tlsClusterIssuerType === 'self-signed') {
      chartValues.set('selfSignedClusterIssuer.enabled', true);
    } else {
      chartValues
        .setLiteral('global.explorerNamespace', namespace.name)
        .set('acmeClusterIssuer.enabled', true)
        .setLiteral('certClusterIssuerType', tlsClusterIssuerType);
    }

    chartValues.filesFromCommaSeparatedInput(config.valuesFile);

    return chartValues;
  }

  private installCertManagerTask(commandType: ExplorerCommandType): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install cert manager',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableExplorerTls,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
          config.soloChartVersion,
          false,
          'Solo chart version',
          MINIMUM_SOLO_CHART_VERSION,
        );

        const {soloChartVersion} = config;

        const soloCertManagerChartValues: HelmChartValues = await this.prepareCertManagerChartValues(config);
        // check if CRDs of cert-manager are already installed — all of them, since a partial set means
        // the chart still has work to do
        const presentCrds: Map<string, Record<string, string>> = await ClusterCrdProbe.probe(
          this.k8Factory,
          config.clusterContext,
          constants.CERT_MANAGER_CRDS,
        );
        const needInstall: boolean = presentCrds.size < constants.CERT_MANAGER_CRDS.length;
        const foundCrdVersions: Set<string> = new Set<string>(
          [...presentCrds.values()].map((crdLabels: Record<string, string>): string =>
            SharedClusterResourceReport.versionFromLabels(crdLabels),
          ),
        );

        if (!needInstall) {
          SharedClusterResourceReport.show(
            this.logger,
            'cert-manager CRDs',
            config.clusterContext,
            `all ${constants.CERT_MANAGER_CRDS.length} CRDs already present (${[...foundCrdVersions].join(', ')})`,
          );
        }

        if (needInstall) {
          // if cert-manager isn't already installed we want to install it separate from the certificate issuers
          // as they will fail to be created due to the order of the installation being dependent on the cert-manager
          // being installed first
          await this.chartManager.upgrade(
            NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
            constants.SOLO_CERT_MANAGER_CHART,
            constants.SOLO_CERT_MANAGER_CHART,
            config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
            soloChartVersion,
            new HelmChartValues().set('cert-manager.installCRDs', true),
            config.clusterContext,
            commandType !== ExplorerCommandType.ADD,
            commandType === ExplorerCommandType.ADD,
            true,
          );
          showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion);
        }

        // wait cert-manager to be ready to proceed, otherwise may get error of "failed calling webhook"
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            constants.DEFAULT_CERT_MANAGER_NAMESPACE,
            ['app.kubernetes.io/component=webhook', `app.kubernetes.io/instance=${constants.SOLO_CERT_MANAGER_CHART}`],
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );

        // sleep for a few seconds to allow cert-manager to be ready
        if (commandType === ExplorerCommandType.UPGRADE) {
          await sleep(Duration.ofSeconds(10));
        }

        await this.chartManager.upgrade(
          NamespaceName.of(constants.CERT_MANAGER_NAME_SPACE),
          constants.SOLO_CERT_MANAGER_CHART,
          constants.SOLO_CERT_MANAGER_CHART,
          config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
          soloChartVersion,
          soloCertManagerChartValues,
          config.clusterContext,
          commandType !== ExplorerCommandType.ADD,
          commandType === ExplorerCommandType.ADD,
          true,
        );
        showVersionBanner(this.logger, constants.SOLO_CERT_MANAGER_CHART, soloChartVersion, 'Upgraded');
      },
    };
  }

  private installExplorerTask(commandType: ExplorerCommandType): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install explorer',
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        config.explorerVersion = SemanticVersion.getValidSemanticVersion(
          config.explorerVersion,
          false,
          'Explorer version',
        );

        const explorerChartValues: HelmChartValues = new HelmChartValues()
          .file(constants.EXPLORER_VALUES_FILE)
          .add(await this.prepareHederaExplorerChartValues(config));

        // Local chart checkouts can keep appVersion/tag at placeholder values (for example 0.0.1),
        // so pin the runtime image tag explicitly to the requested explorer version.
        if (config.explorerChartDirectory) {
          explorerChartValues.set('image.tag', config.explorerVersion);
        }

        if (config.componentImage) {
          const parsedReference: ParsedImageReference = ImageReference.parseImageReference(config.componentImage);
          const isComponentImageAvailableForKind: boolean = this.isComponentImageAvailableForKind(
            config.componentImage,
            config.componentImageArchive,
          );

          if (isComponentImageAvailableForKind) {
            explorerChartValues
              .setLiteral('image.registry', parsedReference.registry)
              .setLiteral('image.repository', parsedReference.repository)
              .set('image.tag', parsedReference.tag)
              .setLiteral('image.pullPolicy', 'Never');
          } else if (this.isLocalImageReference(config.componentImage)) {
            // Explicit local registry refs keep their registry/repository metadata even when Docker is missing.
            if (this.isLocalRegistryImageReference(config.componentImage)) {
              explorerChartValues
                .setLiteral('image.registry', parsedReference.registry)
                .setLiteral('image.repository', parsedReference.repository)
                .set('image.tag', parsedReference.tag);
            } else {
              // Local-looking ref but not in Docker — plain tag override, K8s will pull from registry.
              explorerChartValues.set('image.tag', parsedReference.tag);
            }
          } else {
            // Explicit registry reference.
            explorerChartValues
              .setLiteral('image.registry', parsedReference.registry)
              .setLiteral('image.repository', parsedReference.repository)
              .set('image.tag', parsedReference.tag);
          }
        }

        await this.loadComponentImage(config.componentImage, config.componentImageArchive, config.clusterContext);

        await this.chartManager.upgrade(
          config.namespace,
          config.releaseName,
          '',
          config.explorerChartDirectory || constants.EXPLORER_CHART_URL,
          config.explorerVersion,
          explorerChartValues,
          config.clusterContext,
          false,
          true,
          false,
          Boolean(config.explorerChartDirectory),
        );

        if (commandType === ExplorerCommandType.ADD) {
          this.remoteConfig.configuration.components.changeComponentPhase(
            (config as ExplorerDeployConfigClass).newExplorerComponent.metadata.id,
            ComponentTypes.Explorer,
            DeploymentPhase.DEPLOYED,
          );

          await this.remoteConfig.persist();
        } else if (commandType === ExplorerCommandType.UPGRADE) {
          // update explorer version in remote config after successful upgrade
          this.remoteConfig.updateComponentVersion(
            ComponentTypes.Explorer,
            new SemanticVersion<string>(config.explorerVersion),
          );

          await this.remoteConfig.persist();
        }

        showVersionBanner(this.logger, config.releaseName, config.explorerVersion);
      },
    };
  }

  private installExplorerIngressControllerTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Install explorer ingress controller',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableIngress,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        const explorerChartValues: HelmChartValues = new HelmChartValues().filesFromCommaSeparatedInput(
          config.valuesFile,
        );
        const explorerIngressControllerChartValues: HelmChartValues = new HelmChartValues()
          .file(constants.INGRESS_CONTROLLER_VALUES_FILE)
          .add(HelmSchedulingValues.buildSchedulingChartValues(explorerChartValues, 'controller'));

        if (config.explorerStaticIp !== '') {
          explorerIngressControllerChartValues.setLiteral('controller.service.loadBalancerIP', config.explorerStaticIp);
        }
        explorerIngressControllerChartValues.setLiteral('fullnameOverride', config.ingressReleaseName);
        explorerIngressControllerChartValues.setLiteral('controller.ingressClass', config.ingressReleaseName);
        explorerIngressControllerChartValues.setLiteral(
          'controller.extraArgs.controller-class',
          config.ingressReleaseName,
        );
        explorerIngressControllerChartValues.filesFromCommaSeparatedInput(config.ingressControllerValueFile);

        await this.chartManager.upgrade(
          config.namespace,
          config.ingressReleaseName,
          constants.INGRESS_CONTROLLER_RELEASE_NAME,
          constants.INGRESS_CONTROLLER_RELEASE_NAME,
          INGRESS_CONTROLLER_VERSION,
          explorerIngressControllerChartValues,
          config.clusterContext,
          false,
          true,
        );

        showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);

        const k8: K8 = this.k8Factory.getK8(config.clusterContext);

        // patch explorer ingress to use h1 protocol, haproxy ingress controller default backend protocol is h2
        // to support grpc over http/2
        await k8.ingresses().update(config.namespace, config.releaseName, {
          metadata: {
            annotations: {
              'haproxy-ingress.github.io/backend-protocol': 'h1',
            },
          },
        });

        const ingressClasses: IngressClass[] = await k8.ingressClasses().list();
        if (ingressClasses.some((ingressClass): boolean => ingressClass.name === config.ingressReleaseName)) {
          return;
        }

        await k8
          .ingressClasses()
          .create(config.ingressReleaseName, constants.INGRESS_CONTROLLER_PREFIX + config.ingressReleaseName);
      },
    };
  }

  private checkExplorerPodIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check explorer pod is ready',
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            config.namespace,
            Templates.renderExplorerLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );
      },
    };
  }

  private checkExplorerIngressControllerPodIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check haproxy ingress controller pod is ready',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.enableIngress,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .waitForReadyStatus(
            config.namespace,
            [
              `app.kubernetes.io/name=${constants.INGRESS_CONTROLLER_RELEASE_NAME}`,
              `app.kubernetes.io/instance=${config.ingressReleaseName}`,
            ],
            constants.PODS_READY_MAX_ATTEMPTS,
            constants.PODS_READY_DELAY,
          );
      },
    };
  }

  private checkLoadBalancerIsAssignedTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check load balancer is assigned',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.loadBalancerEnabled,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.clusterContext)
            .services()
            .waitForLoadBalancerAddress(
              config.namespace,
              [`app.kubernetes.io/instance=${config.releaseName}`],
              constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS,
              Duration.ofSeconds(constants.LOAD_BALANCER_CHECK_DELAY_SECS).toMillis(),
            );
        } catch (error) {
          throw new SoloErrors.system.loadBalancerNotFound(error);
        }
      },
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for explorer',
      skip: ({config}: ExplorerDeployContext | ExplorerUpgradeContext): boolean => !config.forcePortForward,
      task: async ({config}: ExplorerDeployContext | ExplorerUpgradeContext): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
        const pods: Pod[] = await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .list(
            config.namespace,
            Templates.renderExplorerLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
          );

        if (pods.length === 0) {
          throw new SoloErrors.system.explorerPodNotFound();
        }

        const podReference: PodReference = pods[0].podReference;

        await this.remoteConfig.configuration.components.stopPortForwards(
          config.clusterRef,
          podReference,
          constants.EXPLORER_PORT, // Pod port
          constants.EXPLORER_LOCAL_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.Explorer,
          'Explorer',
        );
        await this.remoteConfig.persist();

        await this.remoteConfig.configuration.components.managePortForward(
          config.clusterRef,
          podReference,
          constants.EXPLORER_PORT, // Pod port
          constants.EXPLORER_LOCAL_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.Explorer,
          'Explorer',
          config.isChartInstalled, // Reuse existing port if chart is already installed
          undefined,
          true, // persist: auto-restart on failure using persist-port-forward.js
          externalAddress,
        );
        await this.remoteConfig.persist();
      },
    };
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
    );
  }

  private getIngressReleaseName(namespaceName: NamespaceName): string {
    return this.renderIngressReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorer),
      namespaceName,
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.explorerInvalidComponentId(id);
    }
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  private renderIngressReleaseName(id: ComponentId, namespaceName: NamespaceName): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.explorerInvalidComponentId(id);
    }
    const maxHelmReleaseNameLength: number = 53;
    const baseReleaseName: string = `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}-${namespaceName.name}`;
    if (baseReleaseName.length <= maxHelmReleaseNameLength) {
      return baseReleaseName;
    }

    // Keep names deterministic and short enough for Helm while preserving readability.
    const hashSuffixLength: number = 8;
    const namespaceHash: string = createHash('sha256')
      .update(namespaceName.name)
      .digest('hex')
      .slice(0, hashSuffixLength);
    const prefix: string = `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}`;
    const availableNamespaceLength: number =
      maxHelmReleaseNameLength - prefix.length - 1 - hashSuffixLength - 1; /* - */
    if (availableNamespaceLength <= 0) {
      return `${prefix}-${namespaceHash}`;
    }

    const shortenedNamespace: string = namespaceName.name.slice(0, availableNamespaceLength);
    return `${prefix}-${shortenedNamespace}-${namespaceHash}`;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDeployContext> = this.taskList.newTaskList<ExplorerDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.optional,
              ...ExplorerCommand.DEPLOY_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: ExplorerDeployConfigClass = this.configManager.getConfig(
              ExplorerCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
              [],
            ) as ExplorerDeployConfigClass;

            // In concurrent one-shot execution, configManager may have stale data due to
            // interleaved updates from other sub-commands. Override with argv values directly.
            if (this.oneShotState.isActive() && argv[flags.explorerVersion.name]) {
              config.explorerVersion = argv[flags.explorerVersion.name] as string;
            }

            config.isLegacyChartInstalled = false;

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterRef);

            config.releaseName = this.getReleaseName();
            config.ingressReleaseName = this.getIngressReleaseName(config.namespace);

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.clusterContext,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            config.newExplorerComponent = this.componentFactory.createNewExplorerComponent(
              config.clusterRef,
              config.namespace,
            );

            config.newExplorerComponent.metadata.phase = DeploymentPhase.REQUESTED;

            config.id = config.newExplorerComponent.metadata.id;

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.loadRemoteConfigTask(argv),
        this.addExplorerComponents(),
        this.installCertManagerTask(ExplorerCommandType.ADD),
        this.installExplorerTask(ExplorerCommandType.ADD),
        this.installExplorerIngressControllerTask(),
        this.checkExplorerPodIsReadyTask(),
        this.checkExplorerIngressControllerPodIsReadyTask(),
        this.checkLoadBalancerIsAssignedTask(),
        this.enablePortForwardingTask(),
        {
          title: 'Show user messages',
          // Skip during one-shot: the one-shot Finish phase shows the consolidated summary
          // (matches relay/mirror), so showing it here too would duplicate the port-forwarding section.
          skip: (): boolean => this.oneShotState.isActive(),
          task: (): void => {
            this.logger.showAllMessageGroups();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer deployment has completed');
      } catch (error) {
        throw new SoloErrors.component.explorerDeployFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerUpgradeContext> = this.taskList.newTaskList<ExplorerUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(ExplorerCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.optional,
              ...ExplorerCommand.UPGRADE_FLAGS_LIST.required,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: ExplorerUpgradeConfigClass = this.configManager.getConfig(
              ExplorerCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
              [],
            ) as ExplorerUpgradeConfigClass;

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterRef);

            const {id, releaseName, ingressReleaseName, isChartInstalled, isLegacyChartInstalled} =
              await this.inferExplorerData(config.namespace, config.clusterContext);

            config.id = id;
            config.releaseName = releaseName;
            config.ingressReleaseName = ingressReleaseName;
            config.isChartInstalled = isChartInstalled;
            config.isLegacyChartInstalled = isLegacyChartInstalled;

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.clusterContext,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            const currentExplorerVersion: SemanticVersion<string> = this.remoteConfig.getComponentVersion(
              ComponentTypes.Explorer,
            );

            config.explorerVersion = UpgradeVersionResolver.resolveFromFlags(
              this.configManager,
              [flags.explorerVersion],
              config.explorerVersion,
              currentExplorerVersion,
              EXPLORER_VERSION,
            );

            assertUpgradeVersionNotOlder(
              'Explorer',
              config.explorerVersion,
              currentExplorerVersion,
              optionFromFlag(flags.explorerVersion),
            );

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.loadRemoteConfigTask(argv),
        this.installCertManagerTask(ExplorerCommandType.UPGRADE),
        this.installExplorerTask(ExplorerCommandType.UPGRADE),
        this.installExplorerIngressControllerTask(),
        this.checkExplorerPodIsReadyTask(),
        this.checkExplorerIngressControllerPodIsReadyTask(),
        this.checkLoadBalancerIsAssignedTask(),
        this.enablePortForwardingTask(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('explorer upgrading has completed');
      } catch (error) {
        throw new SoloErrors.component.explorerUpgradeFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<ExplorerDestroyContext> = this.taskList.newTaskList<ExplorerDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the explorer?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);

            const namespace: NamespaceName = await this.getNamespace(task);
            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const clusterContext: Context = this.getClusterContext(clusterReference);

            const {id, releaseName, ingressReleaseName, isChartInstalled, isLegacyChartInstalled} =
              await this.inferExplorerData(namespace, clusterContext);

            context_.config = {
              namespace,
              clusterContext,
              clusterReference,
              id,
              releaseName,
              ingressReleaseName,
              isChartInstalled,
              isLegacyChartInstalled,
            };

            await this.throwIfNamespaceIsMissing(clusterContext, namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.loadRemoteConfigTask(argv, true),
        this.loadRemoteConfigTask(argv),
        {
          title: 'Destroy explorer',
          task: async (context_): Promise<void> => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.clusterContext,
            );
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        {
          title: 'Uninstall explorer ingress controller',
          task: async (context_): Promise<void> => {
            await this.chartManager.uninstall(context_.config.namespace, context_.config.ingressReleaseName);
            // destroy ingress class if found one
            const existingIngressClasses: IngressClass[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            for (const ingressClass of existingIngressClasses) {
              if (ingressClass.name === context_.config.ingressReleaseName) {
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(context_.config.ingressReleaseName);
              }
            }
          },
        },
        this.disableMirrorNodeExplorerComponents(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'explorer node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.explorerDestroyFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  private loadRemoteConfigTask(argv: ArgvStruct, safe: boolean = false): SoloListrTask<AnyListrContext> {
    return {
      title: 'Load remote config',
      task: async (): Promise<void> => {
        if (safe) {
          await this.loadRemoteConfigOrWarn(argv);
          return;
        }
        await this.remoteConfig.loadAndValidate(argv);
      },
    };
  }

  /** Removes the explorer components from remote config. */
  private disableMirrorNodeExplorerComponents(): SoloListrTask<ExplorerDestroyContext> {
    return {
      title: 'Remove explorer from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.Explorer);

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the explorer components to remote config. */
  private addExplorerComponents(): SoloListrTask<ExplorerDeployContext> {
    return {
      title: 'Add explorer to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded() || this.oneShotState.isActive(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          config.newExplorerComponent,
          ComponentTypes.Explorer,
        );

        // update explorer version in remote config
        this.remoteConfig.updateComponentVersion(
          ComponentTypes.Explorer,
          new SemanticVersion<string>(config.explorerVersion),
        );

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    return id <= 1
      ? await this.chartManager.isChartInstalled(namespace, constants.EXPLORER_RELEASE_NAME, context)
      : false;
  }

  private inferExplorerId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);

    if (typeof id === 'number') {
      return id;
    }

    if (!this.remoteConfig.configuration.components.state.explorers[0]) {
      throw new SoloErrors.system.explorerNotInRemoteConfig();
    }

    return this.remoteConfig.configuration.components.state.explorers[0].metadata.id;
  }

  private async inferExplorerData(namespace: NamespaceName, context: Context): Promise<InferredData> {
    const id: ComponentId = this.inferExplorerId();

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: constants.EXPLORER_RELEASE_NAME,
        isChartInstalled: true,
        ingressReleaseName: constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      ingressReleaseName: this.renderIngressReleaseName(id, namespace),
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
