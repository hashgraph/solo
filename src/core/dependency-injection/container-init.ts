// SPDX-License-Identifier: Apache-2.0

import {container, type DependencyContainer} from 'tsyringe-neo';
import {type SoloLogger} from '../logging/solo-logger.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {
  DependencyManager,
  HelmDependencyManager,
  KindDependencyManager,
  KubectlDependencyManager,
  PodmanDependencyManager,
} from '../dependency-managers/index.js';
import * as constants from '../constants.js';
import {ChartManager} from '../chart-manager.js';
import {ConfigManager} from '../config-manager.js';
import {LayeredConfigProvider} from '../../data/configuration/impl/layered-config-provider.js';
import {AccountManager} from '../account-manager.js';
import {PlatformInstaller} from '../platform-installer.js';
import {KeyManager} from '../key-manager.js';
import {ProfileManager} from '../profile-manager.js';
import {IntervalLockRenewalService} from '../lock/interval-lock-renewal.js';
import {LockManager} from '../lock/lock-manager.js';
import {OneShotState} from '../one-shot-state.js';
import {CertificateManager} from '../certificate-manager.js';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import * as version from '../../../version.js';
import {NetworkNodes} from '../network-nodes.js';
import {ClusterChecks} from '../cluster-checks.js';
import {InjectTokens} from './inject-tokens.js';
import {K8ClientFactory} from '../../integration/kube/k8-client/k8-client-factory.js';
import {ClusterCommandHandlers} from '../../commands/cluster/handlers.js';
import {ClusterCommandTasks} from '../../commands/cluster/tasks.js';
import {NodeCommandHandlers} from '../../commands/node/handlers.js';
import {NodeCommandTasks} from '../../commands/node/tasks.js';
import {ClusterCommandConfigs} from '../../commands/cluster/configs.js';
import {NodeCommandConfigs} from '../../commands/node/configs.js';
import {ErrorHandler} from '../error-handler.js';
import {ClassToObjectMapper} from '../../data/mapper/impl/class-to-object-mapper.js';
import {HelmExecutionBuilder} from '../../integration/helm/execution/helm-execution-builder.js';
import {DefaultHelmClient} from '../../integration/helm/impl/default-helm-client.js';
import {HelpRenderer} from '../help-renderer.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {AccountCommand} from '../../commands/account.js';
import {FileCommand} from '../../commands/file.js';
import {DeploymentCommand} from '../../commands/deployment.js';
import {ExplorerCommand} from '../../commands/explorer.js';
import {MirrorNodeCommand} from '../../commands/mirror-node.js';
import {RelayCommand} from '../../commands/relay.js';
import {NetworkCommand} from '../../commands/network.js';
import {NodeCommand} from '../../commands/node/index.js';
import {ClusterCommand} from '../../commands/cluster/index.js';
import {Middlewares} from '../middlewares.js';
import {NpmClient} from '../../integration/npm/npm-client.js';
import {SoloPinoLogger} from '../logging/solo-pino-logger.js';
import {DefaultSoloEventBus} from '../events/default-solo-event-bus.js';
import {DeprecationRegistry} from '../deprecation-registry.js';
import {SingletonContainer} from './singleton-container.js';
import {ValueContainer} from './value-container.js';
import {BlockNodeCommand} from '../../commands/block-node.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {LocalConfigSource} from '../../data/configuration/impl/local-config-source.js';
import {RemoteConfigRuntimeState} from '../../business/runtime-state/config/remote/remote-config-runtime-state.js';
import {ComponentFactory} from '../config/remote/component-factory.js';
import {RemoteConfigValidator} from '../config/remote/remote-config-validator.js';
import {type ConfigProvider} from '../../data/configuration/api/config-provider.js';
import {OptionalDefaultConfigSource} from '../../data/configuration/impl/optional-default-config-source.js';
import {DefaultConfigSource} from '../../data/configuration/impl/default-config-source.js';
import {SoloConfigSchema} from '../../data/schema/model/solo/solo-config-schema.js';
import {EnvironmentAliasRegistry} from '../../data/schema/decorators/environment-alias-registry.js';
import {SoloConfigSchemaDefinition} from '../../data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {BeanFactorySupplier} from './bean-factory-supplier.js';
import {DefaultOneShotCommand} from '../../commands/one-shot/default-one-shot.js';
import {DefaultOneShotDeployOrchestrator} from '../../commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {DefaultOneShotDestroyOrchestrator} from '../../commands/one-shot/orchestrator/destroy/default-one-shot-destroy-orchestrator.js';
import {DefaultTaskList} from '../task-list/default-task-list.js';
import {Commands} from '../../commands/commands.js';
import {BlockCommandDefinition} from '../../commands/command-definitions/block-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../commands/command-definitions/cluster-reference-command-definition.js';
import {ConsensusCommandDefinition} from '../../commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../commands/command-definitions/deployment-command-definition.js';
import {ExplorerCommandDefinition} from '../../commands/command-definitions/explorer-command-definition.js';
import {KeysCommandDefinition} from '../../commands/command-definitions/keys-command-definition.js';
import {LedgerCommandDefinition} from '../../commands/command-definitions/ledger-command-definition.js';
import {MirrorCommandDefinition} from '../../commands/command-definitions/mirror-command-definition.js';
import {OneShotCommandDefinition} from '../../commands/command-definitions/one-shot-command-definition.js';
import {RelayCommandDefinition} from '../../commands/command-definitions/relay-command-definition.js';
import {DefaultKindClientBuilder} from '../../integration/kind/impl/default-kind-client-builder.js';
import {DefaultGitClient} from '../../integration/git/impl/default-git-client.js';
import {MetricsServerImpl} from '../../business/runtime-state/services/metrics-server-impl.js';
import {VfkitDependencyManager} from '../dependency-managers/vfkit-dependency-manager.js';
import {GvproxyDependencyManager} from '../dependency-managers/gvproxy-dependency-manager.js';
import {NetavarkDependencyManager} from '../dependency-managers/netavark-dependency-manager.js';
import {AardvarkDnsDependencyManager} from '../dependency-managers/aardvark-dns-dependency-manager.js';
import {RapidFireCommand} from '../../commands/rapid-fire.js';
import {RapidFireCommandDefinition} from '../../commands/command-definitions/rapid-fire-command-definition.js';
import {BackupRestoreCommand} from '../../commands/backup-restore.js';
import {BackupRestoreCommandDefinition} from '../../commands/command-definitions/backup-restore-command-definition.js';
import {OsPackageManager} from '../package-managers/os-package-manager.js';
import {ClusterTaskManager} from '../cluster-task-manager.js';
import {PostgresSharedResource} from '../shared-resources/postgres.js';
import {SharedResourceManager} from '../shared-resources/shared-resource-manager.js';
import {ROOT_DIR} from '../constants.js';
import {CacheCommandDefinition} from '../../commands/command-definitions/cache-command-definition.js';
import {InitCommandDefinition} from '../../commands/init/init-command-definition.js';
import {CacheCommand} from '../../commands/cache.js';
import {ImageCacheHandlerBuilder} from '../../integration/cache/impl/image-cache-handler-builder.js';
import {DockerClient} from '../../integration/container-engine/docker-client.js';
import {ContainerEngineResourceInspector} from '../../integration/container-engine/container-engine-resource-inspector.js';
import {DefaultCacheHandlerRegistry} from '../../integration/cache/impl/default-cache-handler-registry.js';
import {DefaultCacheHealthInspector} from '../../integration/cache/impl/default-cache-health-inspector.js';
import {FileSystemCacheCatalogStore} from '../../integration/cache/impl/file-system-cache-catalog-store.js';
import {CraneDependencyManager} from '../dependency-managers/crane-dependency-manager.js';

export type InstanceOverrides = Map<symbol, SingletonContainer | ValueContainer>;

/**
 * Container class to manage the dependency injection container
 */
export class Container {
  private static instance: Container = undefined;
  private static isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance of the container
   */
  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }

    return Container.instance;
  }

  private static singletonContainers(): SingletonContainer[] {
    return [
      new SingletonContainer(InjectTokens.SoloEventBus, DefaultSoloEventBus),
      new SingletonContainer(InjectTokens.DeprecationRegistry, DeprecationRegistry),
      new SingletonContainer(InjectTokens.SoloLogger, SoloPinoLogger),
      new SingletonContainer(InjectTokens.LockRenewalService, IntervalLockRenewalService),
      new SingletonContainer(InjectTokens.LockManager, LockManager),
      new SingletonContainer(InjectTokens.K8Factory, K8ClientFactory),
      new SingletonContainer(InjectTokens.PackageDownloader, PackageDownloader),
      new SingletonContainer(InjectTokens.Zippy, Zippy),
      new SingletonContainer(InjectTokens.DependencyManager, DependencyManager),
      new SingletonContainer(InjectTokens.GitClient, DefaultGitClient),
      new SingletonContainer(InjectTokens.KindBuilder, DefaultKindClientBuilder),
      new SingletonContainer(InjectTokens.Helm, DefaultHelmClient),
      new SingletonContainer(InjectTokens.HelmExecutionBuilder, HelmExecutionBuilder),
      new SingletonContainer(InjectTokens.HelmDependencyManager, HelmDependencyManager),
      new SingletonContainer(InjectTokens.KindDependencyManager, KindDependencyManager),
      new SingletonContainer(InjectTokens.KubectlDependencyManager, KubectlDependencyManager),
      new SingletonContainer(InjectTokens.PodmanDependencyManager, PodmanDependencyManager),
      new SingletonContainer(InjectTokens.VfkitDependencyManager, VfkitDependencyManager),
      new SingletonContainer(InjectTokens.GvproxyDependencyManager, GvproxyDependencyManager),
      new SingletonContainer(InjectTokens.NetavarkDependencyManager, NetavarkDependencyManager),
      new SingletonContainer(InjectTokens.AardvarkDnsDependencyManager, AardvarkDnsDependencyManager),
      new SingletonContainer(InjectTokens.CraneDependencyManager, CraneDependencyManager),
      new SingletonContainer(InjectTokens.ChartManager, ChartManager),
      new SingletonContainer(InjectTokens.ConfigManager, ConfigManager),
      new SingletonContainer(InjectTokens.AccountManager, AccountManager),
      new SingletonContainer(InjectTokens.PlatformInstaller, PlatformInstaller),
      new SingletonContainer(InjectTokens.KeyManager, KeyManager),
      new SingletonContainer(InjectTokens.ProfileManager, ProfileManager),
      new SingletonContainer(InjectTokens.CertificateManager, CertificateManager),
      new SingletonContainer(InjectTokens.LocalConfigRuntimeState, LocalConfigRuntimeState),
      new SingletonContainer(InjectTokens.LocalConfigSource, LocalConfigSource),
      new SingletonContainer(InjectTokens.RemoteConfigRuntimeState, RemoteConfigRuntimeState),
      new SingletonContainer(InjectTokens.ClusterChecks, ClusterChecks),
      new SingletonContainer(InjectTokens.NetworkNodes, NetworkNodes),
      new SingletonContainer(InjectTokens.NpmClient, NpmClient),
      new SingletonContainer(InjectTokens.Middlewares, Middlewares),
      new SingletonContainer(InjectTokens.HelpRenderer, HelpRenderer),
      new SingletonContainer(InjectTokens.ConfigProvider, LayeredConfigProvider),
      new SingletonContainer(InjectTokens.AccountCommand, AccountCommand),
      new SingletonContainer(InjectTokens.FileCommand, FileCommand),
      new SingletonContainer(InjectTokens.ClusterCommand, ClusterCommand),
      new SingletonContainer(InjectTokens.NodeCommand, NodeCommand),
      new SingletonContainer(InjectTokens.DeploymentCommand, DeploymentCommand),
      new SingletonContainer(InjectTokens.ExplorerCommand, ExplorerCommand),
      new SingletonContainer(InjectTokens.MirrorNodeCommand, MirrorNodeCommand),
      new SingletonContainer(InjectTokens.NetworkCommand, NetworkCommand),
      new SingletonContainer(InjectTokens.RelayCommand, RelayCommand),
      new SingletonContainer(InjectTokens.CacheCommand, CacheCommand),
      new SingletonContainer(InjectTokens.BackupRestoreCommand, BackupRestoreCommand),
      new SingletonContainer(InjectTokens.BlockNodeCommand, BlockNodeCommand),
      new SingletonContainer(InjectTokens.RapidFireCommand, RapidFireCommand),
      new SingletonContainer(InjectTokens.ClusterCommandTasks, ClusterCommandTasks),
      new SingletonContainer(InjectTokens.ClusterCommandHandlers, ClusterCommandHandlers),
      new SingletonContainer(InjectTokens.NodeCommandTasks, NodeCommandTasks),
      new SingletonContainer(InjectTokens.NodeCommandHandlers, NodeCommandHandlers),
      new SingletonContainer(InjectTokens.ClusterCommandConfigs, ClusterCommandConfigs),
      new SingletonContainer(InjectTokens.NodeCommandConfigs, NodeCommandConfigs),
      new SingletonContainer(InjectTokens.ErrorHandler, ErrorHandler),
      new SingletonContainer(InjectTokens.ObjectMapper, ClassToObjectMapper),
      new SingletonContainer(InjectTokens.ComponentFactory, ComponentFactory),
      new SingletonContainer(InjectTokens.RemoteConfigValidator, RemoteConfigValidator),
      new SingletonContainer(InjectTokens.OneShotState, OneShotState),
      new SingletonContainer(InjectTokens.OneShotDeployOrchestrator, DefaultOneShotDeployOrchestrator),
      new SingletonContainer(InjectTokens.OneShotDestroyOrchestrator, DefaultOneShotDestroyOrchestrator),
      new SingletonContainer(InjectTokens.OneShotCommand, DefaultOneShotCommand),
      new SingletonContainer(InjectTokens.TaskList, DefaultTaskList),
      new SingletonContainer(InjectTokens.Commands, Commands),
      new SingletonContainer(InjectTokens.MetricsServer, MetricsServerImpl),
      new SingletonContainer(InjectTokens.OsPackageManager, OsPackageManager),
      new SingletonContainer(InjectTokens.ClusterTaskManager, ClusterTaskManager),
      new SingletonContainer(InjectTokens.PostgresSharedResource, PostgresSharedResource),
      new SingletonContainer(InjectTokens.SharedResourceManager, SharedResourceManager),

      // Cache
      new SingletonContainer(InjectTokens.CacheHandlerRegistry, DefaultCacheHandlerRegistry),
      new SingletonContainer(InjectTokens.CacheCatalogStore, FileSystemCacheCatalogStore),
      new SingletonContainer(InjectTokens.CacheHealthInspector, DefaultCacheHealthInspector),
      new SingletonContainer(InjectTokens.ImageCacheHandlerBuilder, ImageCacheHandlerBuilder),
      new SingletonContainer(InjectTokens.ContainerEngineClient, DockerClient),
      new SingletonContainer(InjectTokens.ContainerEngineResourceInspector, ContainerEngineResourceInspector),

      // Command Definitions
      new SingletonContainer(InjectTokens.BackupRestoreCommandDefinition, BackupRestoreCommandDefinition),
      new SingletonContainer(InjectTokens.InitCommandDefinition, InitCommandDefinition),
      new SingletonContainer(InjectTokens.BlockCommandDefinition, BlockCommandDefinition),
      new SingletonContainer(InjectTokens.ClusterReferenceCommandDefinition, ClusterReferenceCommandDefinition),
      new SingletonContainer(InjectTokens.ConsensusCommandDefinition, ConsensusCommandDefinition),
      new SingletonContainer(InjectTokens.DeploymentCommandDefinition, DeploymentCommandDefinition),
      new SingletonContainer(InjectTokens.ExplorerCommandDefinition, ExplorerCommandDefinition),
      new SingletonContainer(InjectTokens.KeysCommandDefinition, KeysCommandDefinition),
      new SingletonContainer(InjectTokens.LedgerCommandDefinition, LedgerCommandDefinition),
      new SingletonContainer(InjectTokens.MirrorCommandDefinition, MirrorCommandDefinition),
      new SingletonContainer(InjectTokens.RelayCommandDefinition, RelayCommandDefinition),
      new SingletonContainer(InjectTokens.CacheCommandDefinition, CacheCommandDefinition),
      new SingletonContainer(InjectTokens.OneShotCommandDefinition, OneShotCommandDefinition),
      new SingletonContainer(InjectTokens.RapidFireCommandDefinition, RapidFireCommandDefinition),
    ];
  }

  private static valueContainers(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
  ): ValueContainer[] {
    return [
      new ValueContainer(InjectTokens.LogLevel, logLevel),
      new ValueContainer(InjectTokens.DevelopmentMode, developmentMode),
      new ValueContainer(InjectTokens.HomeDirectory, homeDirectory),
      new ValueContainer(InjectTokens.OsPlatform, os.platform()),
      new ValueContainer(InjectTokens.OsArch, os.arch()),
      new ValueContainer(InjectTokens.HelmInstallationDirectory, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(InjectTokens.KindInstallationDirectory, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(InjectTokens.KubectlInstallationDirectory, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(InjectTokens.PodmanInstallationDirectory, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(InjectTokens.CraneInstallationDirectory, PathEx.join(constants.SOLO_HOME_DIR, 'bin')),
      new ValueContainer(
        InjectTokens.PodmanDependenciesInstallationDirectory,
        PathEx.join(constants.SOLO_HOME_DIR, 'bin/podman-helpers'),
      ),
      new ValueContainer(
        InjectTokens.PodmanDependenciesInstallationDirectory,
        PathEx.join(constants.SOLO_HOME_DIR, 'bin/podman-helpers'),
      ),
      new ValueContainer(InjectTokens.HelmVersion, version.HELM_VERSION),
      new ValueContainer(InjectTokens.KindVersion, version.KIND_VERSION),
      new ValueContainer(InjectTokens.KubectlVersion, version.KUBECTL_VERSION),
      new ValueContainer(InjectTokens.PodmanVersion, version.PODMAN_VERSION),
      new ValueContainer(InjectTokens.VfkitVersion, version.VFKIT_VERSION),
      new ValueContainer(InjectTokens.GvproxyVersion, version.GVPROXY_VERSION),
      new ValueContainer(InjectTokens.NetavarkVersion, version.NETAVARK_VERSION),
      new ValueContainer(InjectTokens.AardvarkDnsVersion, version.AARDVARK_DNS_VERSION),
      new ValueContainer(InjectTokens.CraneVersion, version.CRANE_VERSION),
      new ValueContainer(InjectTokens.SystemAccounts, constants.SYSTEM_ACCOUNTS),
      new ValueContainer(InjectTokens.CacheDir, cacheDirectory),
      new ValueContainer(InjectTokens.LocalConfigFileName, constants.DEFAULT_LOCAL_CONFIG_FILE),
      new ValueContainer(InjectTokens.KeyFormatter, ConfigKeyFormatter.instance()),
      new ValueContainer(InjectTokens.IgnorePodMetrics, constants.IGNORE_POD_METRICS),
    ];
  }

  private static factorySuppliers(): BeanFactorySupplier<unknown>[] {
    return [
      new BeanFactorySupplier<ConfigProvider>(
        InjectTokens.ConfigProvider,
        (container: DependencyContainer): ConfigProvider => {
          const objectMapper: ClassToObjectMapper = container.resolve<ClassToObjectMapper>(InjectTokens.ObjectMapper);

          // Register the root schema so environment variable aliases
          // can be resolved by the EnvironmentConfigSource.
          EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);

          const helmChartConfigSource: DefaultConfigSource<SoloConfigSchema> =
            new DefaultConfigSource<SoloConfigSchema>(
              'helm-chart-config.yaml',
              PathEx.joinWithRealPath(ROOT_DIR, 'resources', 'config'),
              new SoloConfigSchemaDefinition(objectMapper),
              objectMapper,
            );

          const tssConfigSource: DefaultConfigSource<SoloConfigSchema> = new DefaultConfigSource<SoloConfigSchema>(
            'tss-config.yaml',
            PathEx.joinWithRealPath(ROOT_DIR, 'resources', 'config'),
            new SoloConfigSchemaDefinition(objectMapper),
            objectMapper,
          );

          // Operator-editable configuration in SOLO_HOME_DIR. Included so the cascade is
          // complete for consumers that refresh the config; the subprocess allowlist is applied
          // separately at startup by SubprocessEnvironmentBootstrap, because sources load
          // asynchronously and this factory is synchronous.
          const userConfigSource: OptionalDefaultConfigSource<SoloConfigSchema> =
            new OptionalDefaultConfigSource<SoloConfigSchema>(
              constants.DEFAULT_SOLO_CONFIG_FILE,
              constants.SOLO_HOME_DIR,
              new SoloConfigSchemaDefinition(objectMapper),
              objectMapper,
            );

          const provider: ConfigProvider = new LayeredConfigProvider(objectMapper);
          provider
            .builder()
            .withDefaultSources()
            .withSources(helmChartConfigSource, tssConfigSource, userConfigSource)
            .withMergeSourceValues(true)
            .build();

          return provider;
        },
      ),
    ];
  }

  /**
   * Initialize the container with the default dependencies
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public init(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
    overrides: InstanceOverrides = new Map<symbol, SingletonContainer | ValueContainer>(),
  ): void {
    if (Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container already initialized');
      return;
    }

    // Services such as the local config storage backend require the home directory to exist at construction time.
    mkdirSync(homeDirectory, {recursive: true});

    const singletonContainers: SingletonContainer[] = Container.singletonContainers();

    const valueContainers: ValueContainer[] = Container.valueContainers(
      homeDirectory,
      cacheDirectory,
      logLevel,
      developmentMode,
    );

    for (const [token, override] of overrides) {
      if (override instanceof SingletonContainer) {
        container.register(token, {useClass: override.useClass}, {lifecycle: override.lifecycle});
      } else if (override instanceof ValueContainer) {
        container.register(override.token, {useValue: override.useValue});
      }
    }

    for (const value of valueContainers) {
      if (!overrides.get(value.token)) {
        container.register(value.token, {useValue: value.useValue});
      }
    }

    for (const singleton of singletonContainers) {
      if (!overrides.get(singleton.token)) {
        container.register(singleton.token, {useClass: singleton.useClass}, {lifecycle: singleton.lifecycle});
      }
    }

    for (const supplier of Container.factorySuppliers()) {
      supplier.register(container);
    }

    container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container initialized');
    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public reset(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    overrides?: InstanceOverrides,
  ): void {
    if (Container.instance && Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Resetting container');
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, overrides);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param overrides - instances to use instead of the default implementations
   */
  public clearInstances(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    overrides?: InstanceOverrides,
  ): void {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, overrides);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  public async dispose(): Promise<void> {
    await container.dispose();
  }
}
