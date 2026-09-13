// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {SoloError} from '../core/errors/solo-error.js';
import {ShellRunner} from '../core/shell-runner.js';
import {type LockManager} from '../core/lock/lock-manager.js';
import {type ChartManager} from '../core/chart-manager.js';
import {type ConfigManager} from '../core/config-manager.js';
import {type DependencyManager} from '../core/dependency-managers/index.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type HelmClient} from '../integration/helm/helm-client.js';
import {type LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type SoloLogger} from '../core/logging/solo-logger.js';
import * as constants from '../core/constants.js';
import fs from 'node:fs';
import os from 'node:os';
import * as tar from 'tar';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentId,
  type Context,
  NamespaceNameAsString,
  Optional,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Flags as flags, Flags} from './flags.js';
import {inject} from 'tsyringe-neo';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type TaskList} from '../core/task-list/task-list.js';
import {ListrContext, ListrRendererValue} from 'listr2';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {type OneShotState} from '../core/one-shot-state.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {AnyListrContext} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {Templates} from '../core/templates.js';
import {BaseStateSchema} from '../data/schema/model/remote/state/base-state-schema.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {NodeCommandTasks} from './node/tasks.js';
import {SoloConfig} from '../business/runtime-state/config/solo/solo-config.js';
import {type ConfigProvider} from '../data/configuration/api/config-provider.js';
import {type DefaultKindClientBuilder} from '../integration/kind/impl/default-kind-client-builder.js';
import {type KindClient} from '../integration/kind/kind-client.js';
import {LoadDockerImageOptionsBuilder} from '../integration/kind/model/load-docker-image/load-docker-image-options-builder.js';
import {LoadImageArchiveOptionsBuilder} from '../integration/kind/model/load-image-archive/load-image-archive-options-builder.js';
import {checkDockerImageExists, Helpers} from '../core/helpers.js';
import {PathEx} from '../business/utils/path-ex.js';
import {OperatingSystem} from '../business/utils/operating-system.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
import {getEnvironmentVariable} from '../core/constants.js';

interface DockerDesktopContainerdCheckResult {
  readonly containerdSnapshotterEnabled: boolean;
  readonly settingsFilePath?: string;
  readonly warningMessage?: string;
}

export abstract class BaseCommand extends ShellRunner {
  public readonly soloConfig: SoloConfig;

  public constructor(
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.K8Factory) protected readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
    @inject(InjectTokens.ConfigManager) public readonly configManager?: ConfigManager,
    @inject(InjectTokens.DependencyManager) protected readonly depManager?: DependencyManager,
    @inject(InjectTokens.LockManager) protected readonly leaseManager?: LockManager,
    @inject(InjectTokens.LocalConfigRuntimeState) public readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) protected readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.TaskList)
    protected readonly taskList?: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.ComponentFactory) protected readonly componentFactory?: ComponentFactoryApi,
    @inject(InjectTokens.OneShotState) protected readonly oneShotState?: OneShotState,
    @inject(InjectTokens.NodeCommandTasks) protected readonly nodeCommandTasks?: NodeCommandTasks,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider?: ConfigProvider,
    @inject(InjectTokens.KindBuilder) protected readonly kindBuilder?: DefaultKindClientBuilder,
  ) {
    super();

    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.componentFactory = patchInject(componentFactory, InjectTokens.ComponentFactory, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.nodeCommandTasks = patchInject(nodeCommandTasks, InjectTokens.NodeCommandTasks, this.constructor.name);
    this.configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, this.constructor.name);
    this.soloConfig = SoloConfig.getConfig(this.configProvider);
  }

  protected async loadRemoteConfigOrWarn(
    argv: {_: string[]} & Record<string, unknown>,
    validate: boolean = true,
    skipConsensusNodesValidation: boolean = true,
  ): Promise<boolean> {
    try {
      await this.remoteConfig.loadAndValidate(argv, validate, skipConsensusNodesValidation);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to load remote config; continuing destroy: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  public abstract close(): Promise<void>;

  private static getDockerDesktopSettingsPaths(): string[] {
    const home: string = os.homedir();
    const paths: string[] = [
      PathEx.join(home, '.docker', 'settings-store.json'),
      PathEx.join(home, '.docker', 'settings.json'),
    ];

    if (OperatingSystem.isWin32()) {
      const appData: string = getEnvironmentVariable('APPDATA') ?? PathEx.join(home, 'AppData', 'Roaming');
      paths.unshift(
        PathEx.join(appData, 'Docker', 'settings-store.json'),
        PathEx.join(appData, 'Docker', 'settings.json'),
      );
    } else if (OperatingSystem.isDarwin()) {
      paths.push(PathEx.join(home, 'Library', 'Group Containers', 'group.com.docker', 'settings.json'));
    }

    return paths;
  }

  public static checkDockerDesktopContainerdSetting(): DockerDesktopContainerdCheckResult {
    if (OperatingSystem.isLinux()) {
      return {containerdSnapshotterEnabled: false};
    }

    for (const candidatePath of BaseCommand.getDockerDesktopSettingsPaths()) {
      if (!fs.existsSync(candidatePath)) {
        continue;
      }

      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (settings['useContainerdSnapshotter'] === true) {
        return {
          containerdSnapshotterEnabled: true,
          settingsFilePath: candidatePath,
          warningMessage:
            'Docker Desktop "Use containerd for pulling and storing images" is enabled. ' +
            'This setting can cause Kubernetes pods to fail with an ImageInspectError pointing ' +
            'at /run/containerd/containerd.sock. ' +
            'To avoid relay and other component deployment failures: ' +
            'open Docker Desktop > Settings > General > uncheck ' +
            '"Use containerd for pulling and storing images" > Apply & Restart.',
        };
      }

      return {containerdSnapshotterEnabled: false, settingsFilePath: candidatePath};
    }

    return {containerdSnapshotterEnabled: false};
  }

  /**
   * Returns a Listr task that checks whether Docker Desktop's
   * "Use containerd for pulling and storing images" setting is enabled and emits a
   * warning when it is. This check is relevant for any Solo command that deploys pods,
   * since the containerd snapshotter setting can cause ImageInspectError failures.
   * The task is non-blocking - it warns only and does not halt the command.
   *
   * The static overload accepts an explicit logger so it can be called from classes
   * that are not `BaseCommand` subclasses (e.g. `Subcommand`).
   */
  public static dockerDesktopPreflightTask(logger: SoloLogger): SoloListrTask<AnyListrContext> {
    return {
      title: 'Pre-flight: check Docker Desktop containerd setting',
      task: async (): Promise<void> => {
        const result: DockerDesktopContainerdCheckResult = BaseCommand.checkDockerDesktopContainerdSetting();
        if (result.containerdSnapshotterEnabled && result.warningMessage) {
          logger.warn(result.warningMessage);
        }
      },
    };
  }

  /** Instance convenience wrapper — delegates to the static implementation. */
  protected dockerDesktopPreflightTask(): SoloListrTask<AnyListrContext> {
    return BaseCommand.dockerDesktopPreflightTask(this.logger);
  }

  /**
   * Setup home directories
   * @param directories
   */
  public setupHomeDirectory(directories: string[] = []): string[] {
    if (!directories || directories?.length === 0) {
      directories = [
        constants.SOLO_HOME_DIR,
        constants.SOLO_LOGS_DIR,
        this.configManager.getFlag(Flags.cacheDir) || constants.SOLO_CACHE_DIR,
        constants.SOLO_VALUES_DIR,
      ];
    }
    try {
      for (const directoryPath of directories) {
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath, {recursive: true});
        }
        this.logger.debug(`OK: setup directory: ${directoryPath}`);
      }
    } catch (error) {
      throw new SoloErrors.system.directoryCreationFailed(error);
    }

    return directories;
  }

  protected getClusterReference(): ClusterReferenceName {
    const flagValue: ClusterReferenceName = this.configManager.getFlag(flags.clusterRef);

    // If flag is provided, use it
    if (flagValue) {
      return flagValue;
    }

    // Try to auto-select if only one cluster exists in the deployment
    try {
      if (this.remoteConfig?.isLoaded()) {
        const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

        if (clusterReferences.size === 1) {
          // Auto-select the only available cluster
          const clusterReference: ClusterReferenceName = [...clusterReferences.keys()][0];
          this.logger.debug(`Auto-selected cluster reference: ${clusterReference} (only cluster in deployment)`);
          return clusterReference;
        } else if (clusterReferences.size > 1) {
          // Multiple clusters exist - list them in error message
          const clusterList: string = [...clusterReferences.keys()].join(', ');
          throw new SoloErrors.validation.multipleClustersFound(clusterList);
        }
      }
    } catch (error) {
      // If it's our SoloError about multiple clusters, re-throw it
      if (error instanceof SoloError && error.message.includes('Multiple clusters found')) {
        throw error;
      }
      // Otherwise, fall through to default behavior
      this.logger.debug(`Could not auto-select cluster: ${error.message}`);
    }

    // Fall back to current cluster from kubeconfig
    return this.k8Factory.default().clusters().readCurrent();
  }

  protected getClusterContext(clusterReference: ClusterReferenceName): Context {
    return clusterReference
      ? this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString()
      : this.k8Factory.default().contexts().readCurrent();
  }

  protected getNamespace(task: SoloListrTaskWrapper<AnyListrContext>): Promise<NamespaceName> {
    return resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
  }

  /** Resolves the Kind cluster name the given kubeconfig context targets, or undefined for a non-Kind context. */
  protected kindClusterNameFromContext(clusterContext: string): string | undefined {
    return Helpers.kindClusterNameForContext(clusterContext, this.k8Factory);
  }

  protected isLocalImageReference(imageReference: string): boolean {
    if (this.isLocalRegistryImageReference(imageReference)) {
      return true;
    }

    const withoutTag: string = imageReference.includes(':')
      ? imageReference.slice(0, imageReference.lastIndexOf(':'))
      : imageReference;
    const firstSegment: string = withoutTag.split('/', 1)[0];
    return !firstSegment.includes('.') && !firstSegment.includes(':') && firstSegment !== 'localhost';
  }

  protected isLocalRegistryImageReference(imageReference: string): boolean {
    return /^localhost:\d+\//.test(imageReference);
  }

  protected splitImageNameTag(imageReference: string): {name: string; tag: string} {
    if (this.isLocalRegistryImageReference(imageReference)) {
      const parsedReference: ParsedImageReference = ImageReference.parseImageReference(imageReference);
      return {
        name: `${parsedReference.registry}/${parsedReference.repository}`,
        tag: parsedReference.tag,
      };
    }

    const colonIndex: number = imageReference.lastIndexOf(':');
    if (colonIndex === -1) {
      throw new SoloErrors.validation.illegalArgument(
        `Image reference must include a tag (e.g. name:tag): '${imageReference}'`,
      );
    }
    return {name: imageReference.slice(0, colonIndex), tag: imageReference.slice(colonIndex + 1)};
  }

  protected isLocalImageAvailableInDocker(componentImage: string): boolean {
    if (!this.isLocalImageReference(componentImage)) {
      return false;
    }
    const {name, tag} = this.splitImageNameTag(componentImage);
    return checkDockerImageExists(name, tag);
  }

  protected hasComponentImageArchiveValue(componentImageArchive: Optional<string>): boolean {
    return Boolean(componentImageArchive?.trim());
  }

  protected validateComponentImageArchive(
    componentImage: Optional<string>,
    componentImageArchive: Optional<string>,
  ): void {
    if (!this.hasComponentImageArchiveValue(componentImageArchive)) {
      return;
    }

    if (!componentImage?.trim()) {
      throw new SoloErrors.validation.illegalArgument(
        `--${flags.componentImageArchive.name} requires --${flags.componentImage.name} to identify the image in the archive.`,
        componentImageArchive,
      );
    }

    if (!fs.existsSync(componentImageArchive)) {
      throw new SoloErrors.system.fileNotFound(componentImageArchive);
    }

    const repoTags: Optional<string[]> = this.readComponentImageArchiveRepoTags(componentImageArchive);
    if (repoTags !== undefined && !repoTags.includes(componentImage)) {
      throw new SoloErrors.validation.componentImageArchiveTagMismatch(componentImage, componentImageArchive, repoTags);
    }
  }

  /**
   * Reads the `RepoTags` recorded for every image in a `docker save` archive's `manifest.json`, or
   * `undefined` if the manifest is absent or unparsable (e.g. a non-Docker tar), in which case the
   * tag-mismatch check is skipped rather than blocking an otherwise-valid deployment.
   */
  private readComponentImageArchiveRepoTags(componentImageArchive: string): Optional<string[]> {
    const temporaryDirectory: string = fs.mkdtempSync(
      PathEx.join(os.tmpdir(), 'solo-component-image-archive-manifest-'),
    );
    try {
      tar.x({file: componentImageArchive, C: temporaryDirectory, sync: true}, ['manifest.json']);
      const manifestPath: string = PathEx.join(temporaryDirectory, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return undefined;
      }

      const manifest: {RepoTags?: string[]}[] = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return manifest.flatMap((entry: {RepoTags?: string[]}): string[] => entry.RepoTags ?? []);
    } catch {
      // best-effort: an archive whose manifest.json is missing, non-standard, or unparsable skips this check
      return undefined;
    } finally {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  }

  protected async loadComponentImage(
    componentImage: Optional<string>,
    componentImageArchive: Optional<string>,
    clusterContext: Context,
  ): Promise<void> {
    const additionalContexts: Context[] = this.remoteConfig.getContexts();

    if (this.hasComponentImageArchiveValue(componentImageArchive)) {
      this.validateComponentImageArchive(componentImage, componentImageArchive);
      await this.kindLoadComponentImageArchive(componentImageArchive, clusterContext, additionalContexts);
      return;
    }

    if (componentImage && this.isLocalImageAvailableInDocker(componentImage)) {
      await this.kindLoadComponentImage(componentImage, clusterContext, additionalContexts);
    }
  }

  protected isComponentImageAvailableForKind(
    componentImage: Optional<string>,
    componentImageArchive: Optional<string>,
  ): boolean {
    if (this.hasComponentImageArchiveValue(componentImageArchive)) {
      this.validateComponentImageArchive(componentImage, componentImageArchive);
      return true;
    }

    return Boolean(componentImage && this.isLocalImageAvailableInDocker(componentImage));
  }

  /** Loads a local component image into the required cluster context's Kind cluster, then best-effort into any additional Kind contexts. */
  protected async kindLoadComponentImage(
    componentImage: string,
    clusterContext: string,
    additionalContexts: Context[] = [],
  ): Promise<void> {
    await this.preloadIntoKindClusters(
      componentImage,
      flags.componentImage.name,
      clusterContext,
      additionalContexts,
      (kindClient: KindClient, kindClusterName: string): Promise<void> =>
        this.loadImageIntoKindCluster(kindClient, componentImage, kindClusterName),
    );
  }

  /** Loads a component image archive into the required cluster context's Kind cluster, then best-effort into any additional Kind contexts. */
  protected async kindLoadComponentImageArchive(
    componentImageArchive: string,
    clusterContext: Context,
    additionalContexts: Context[] = [],
  ): Promise<void> {
    await this.preloadIntoKindClusters(
      componentImageArchive,
      flags.componentImageArchive.name,
      clusterContext,
      additionalContexts,
      (kindClient: KindClient, kindClusterName: string): Promise<void> =>
        this.loadImageArchiveIntoKindCluster(kindClient, componentImageArchive, kindClusterName),
    );
  }

  /**
   * Loads a component image (or archive) into the required cluster context's Kind cluster, then
   * best-effort into any additional Kind contexts. Hard-fails only when the required cluster context
   * is not a Kind cluster, since the image is only ever loaded through Kind and has no registry
   * fallback there; additional contexts that are stale, unreachable, or not Kind are skipped with a
   * warning so they never fail the deploy to the required cluster.
   */
  private async preloadIntoKindClusters(
    componentImageSource: string,
    sourceFlagName: string,
    clusterContext: string,
    additionalContexts: Context[],
    loadIntoKindCluster: (kindClient: KindClient, kindClusterName: string) => Promise<void>,
  ): Promise<void> {
    const primaryKindCluster: string | undefined = this.kindClusterNameFromContext(clusterContext);
    if (primaryKindCluster === undefined) {
      throw this.nonKindTargetContextsError(componentImageSource, sourceFlagName, [clusterContext]);
    }

    const kindExecutable: string = await this.depManager.getExecutable(constants.KIND);
    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();

    await loadIntoKindCluster(kindClient, primaryKindCluster);

    const loadedKindClusters: Set<string> = new Set<string>([primaryKindCluster]);
    const extraContexts: Context[] = [...new Set<Context>(additionalContexts)].filter(
      (context: Context): boolean => context !== clusterContext,
    );
    for (const targetContext of extraContexts) {
      const kindClusterName: string | undefined = this.kindClusterNameFromContext(targetContext);
      if (kindClusterName === undefined) {
        this.logger.warn(
          `Skipping preload of component image '${componentImageSource}' into non-Kind cluster context ` +
            `'${targetContext}'; components deployed there must pull the image from a registry.`,
        );
        continue;
      }
      if (loadedKindClusters.has(kindClusterName)) {
        continue;
      }
      loadedKindClusters.add(kindClusterName);
      try {
        await loadIntoKindCluster(kindClient, kindClusterName);
      } catch (error) {
        // best-effort: a stale or unreachable additional Kind context must not fail the deploy to the required cluster
        this.logger.warn(
          `Failed to preload component image '${componentImageSource}' into Kind cluster context '${targetContext}'; continuing`,
          error,
        );
      }
    }
  }

  private nonKindTargetContextsError(
    componentImageSource: string,
    sourceFlagName: string,
    nonKindContexts: Context[],
  ): InstanceType<typeof SoloErrors.validation.illegalArgument> {
    return new SoloErrors.validation.illegalArgument(
      `Component image source '${componentImageSource}' from --${sourceFlagName} requires Kind image loading, but target ` +
        `cluster context(s) '${nonKindContexts.join("', '")}' are not Kind clusters. Push the image to a registry ` +
        'reachable from every target cluster and pass that registry image reference to --component-image.',
      componentImageSource,
    );
  }

  private async loadImageIntoKindCluster(
    kindClient: KindClient,
    componentImage: string,
    kindClusterName: string,
  ): Promise<void> {
    this.logger.debug(`Loading '${componentImage}' into Kind cluster '${kindClusterName}'`);
    await kindClient.loadDockerImage(
      componentImage,
      LoadDockerImageOptionsBuilder.builder().name(kindClusterName).build(),
    );
  }

  private async loadImageArchiveIntoKindCluster(
    kindClient: KindClient,
    componentImageArchive: string,
    kindClusterName: string,
  ): Promise<void> {
    this.logger.debug(`Loading image archive '${componentImageArchive}' into Kind cluster '${kindClusterName}'`);
    await kindClient.loadImageArchive(
      componentImageArchive,
      LoadImageArchiveOptionsBuilder.builder().name(kindClusterName).build(),
    );
  }

  protected async throwIfNamespaceIsMissing(context: Context, namespace: NamespaceName): Promise<void> {
    if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
      throw new SoloErrors.system.namespaceNotFound(namespace.name);
    }
  }

  private inferMirrorNodeDataFromRemoteConfig(namespace: NamespaceName): {
    mirrorNodeId: ComponentId;
    mirrorNamespace: NamespaceNameAsString;
  } {
    let mirrorNodeId: ComponentId = this.configManager.getFlag(flags.mirrorNodeId);
    let mirrorNamespace: NamespaceNameAsString = this.configManager.getFlag(flags.mirrorNamespace);

    const mirrorNodeComponent: Optional<BaseStateSchema> =
      this.remoteConfig.configuration.components.state.mirrorNodes[0];

    if (!mirrorNodeId) {
      mirrorNodeId = mirrorNodeComponent?.metadata.id ?? 1;
    }

    if (!mirrorNamespace) {
      mirrorNamespace = mirrorNodeComponent?.metadata.namespace ?? namespace.name;
    }

    return {mirrorNodeId, mirrorNamespace};
  }

  protected async inferMirrorNodeData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    mirrorNodeId: ComponentId;
    mirrorNamespace: NamespaceNameAsString;
    mirrorNodeReleaseName: string;
  }> {
    const {mirrorNodeId, mirrorNamespace} = this.inferMirrorNodeDataFromRemoteConfig(namespace);

    const mirrorNodeReleaseName: string = await this.inferMirrorNodeReleaseName(mirrorNodeId, mirrorNamespace, context);

    return {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName};
  }

  private async inferMirrorNodeReleaseName(
    mirrorNodeId: ComponentId,
    mirrorNodeNamespace: string,
    context: Context,
  ): Promise<string> {
    if (mirrorNodeId !== 1) {
      return Templates.renderMirrorNodeName(mirrorNodeId);
    }

    // Try to get the component and use the precise cluster context
    try {
      const mirrorNodeComponent: BaseStateSchema = this.remoteConfig.configuration.components.getComponentById(
        ComponentTypes.MirrorNode,
        mirrorNodeId,
      );

      if (mirrorNodeComponent) {
        context = this.getClusterContext(mirrorNodeComponent.metadata.cluster);
      }
    } catch {
      // Guard
    }

    const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
      NamespaceName.of(mirrorNodeNamespace),
      constants.MIRROR_NODE_RELEASE_NAME,
      context,
    );

    return isLegacyChartInstalled ? constants.MIRROR_NODE_RELEASE_NAME : Templates.renderMirrorNodeName(mirrorNodeId);
  }

  protected async resolveNamespaceFromDeployment(task?: SoloListrTaskWrapper<AnyListrContext>): Promise<NamespaceName> {
    return await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
  }
}
