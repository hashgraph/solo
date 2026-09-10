// SPDX-License-Identifier: Apache-2.0

/**
 * Dependency injection tokens
 */
export class InjectTokens {
  public static ComponentFactory: symbol = Symbol.for('ComponentFactory');
  public static RemoteConfigValidator: symbol = Symbol.for('RemoteConfigValidator');
  public static LogLevel: symbol = Symbol.for('LogLevel');
  public static DevelopmentMode: symbol = Symbol.for('DevelopmentMode');
  public static OsPlatform: symbol = Symbol.for('OsPlatform');
  public static OsArch: symbol = Symbol.for('OsArch');
  public static SystemAccounts: symbol = Symbol.for('SystemAccounts');
  public static CacheDir: symbol = Symbol.for('CacheDir');
  public static LockRenewalService: symbol = Symbol.for('LockRenewalService');
  public static LockManager: symbol = Symbol.for('LockManager');
  public static SoloEventBus: symbol = Symbol.for('SoloEventBus');
  public static DeprecationRegistry: symbol = Symbol.for('DeprecationRegistry');
  public static K8Factory: symbol = Symbol.for('K8Factory');
  public static SoloLogger: symbol = Symbol.for('SoloLogger');
  public static PackageDownloader: symbol = Symbol.for('PackageDownloader');
  public static Zippy: symbol = Symbol.for('Zippy');
  public static Helm: symbol = Symbol.for('Helm');
  public static KindBuilder: symbol = Symbol.for('KindBuilder');
  public static ChartManager: symbol = Symbol.for('ChartManager');
  public static ConfigManager: symbol = Symbol.for('ConfigManager');
  public static AccountManager: symbol = Symbol.for('AccountManager');
  public static PlatformInstaller: symbol = Symbol.for('PlatformInstaller');
  public static KeyManager: symbol = Symbol.for('KeyManager');
  public static ProfileManager: symbol = Symbol.for('ProfileManager');
  public static CertificateManager: symbol = Symbol.for('CertificateManager');
  public static RemoteConfigRuntimeState: symbol = Symbol.for('RemoteConfigRuntimeState');
  public static ClusterChecks: symbol = Symbol.for('ClusterChecks');
  public static NetworkNodes: symbol = Symbol.for('NetworkNodes');
  public static AccountCommand: symbol = Symbol.for('AccountCommand');
  public static FileCommand: symbol = Symbol.for('FileCommand');
  public static ClusterCommand: symbol = Symbol.for('ClusterCommand');
  public static NodeCommand: symbol = Symbol.for('NodeCommand');
  public static DeploymentCommand: symbol = Symbol.for('DeploymentCommand');
  public static ExplorerCommand: symbol = Symbol.for('ExplorerCommand');
  public static MirrorNodeCommand: symbol = Symbol.for('MirrorNodeCommand');
  public static NetworkCommand: symbol = Symbol.for('NetworkCommand');
  public static RelayCommand: symbol = Symbol.for('RelayCommand');
  public static CacheCommand: symbol = Symbol.for('CacheCommand');
  public static ClusterCommandTasks: symbol = Symbol.for('ClusterCommandTasks');
  public static ClusterCommandHandlers: symbol = Symbol.for('ClusterCommandHandlers');
  public static NodeCommandTasks: symbol = Symbol.for('NodeCommandTasks');
  public static NodeCommandHandlers: symbol = Symbol.for('NodeCommandHandlers');
  public static ClusterCommandConfigs: symbol = Symbol.for('ClusterCommandConfigs');
  public static NodeCommandConfigs: symbol = Symbol.for('NodeCommandConfigs');
  public static ErrorHandler: symbol = Symbol.for('ErrorHandler');
  public static ObjectMapper: symbol = Symbol.for('ObjectMapper');
  public static HelpRenderer: symbol = Symbol.for('HelpRenderer');
  public static Middlewares: symbol = Symbol.for('Middlewares');
  public static NpmClient: symbol = Symbol.for('NpmClient');
  public static KeyFormatter: symbol = Symbol.for('KeyFormatter');
  public static CommandInvoker: symbol = Symbol.for('CommandInvoker');
  public static ConfigProvider: symbol = Symbol.for('ConfigProvider');
  public static BlockNodeCommand: symbol = Symbol.for('BlockNodeCommand');
  public static RapidFireCommand: symbol = Symbol.for('RapidFireCommand');
  public static LocalConfigFileName: symbol = Symbol.for('LocalConfigFileName');
  public static LocalConfigSource: symbol = Symbol.for('LocalConfigSource');
  public static LocalConfigRuntimeState: symbol = Symbol.for('LocalConfigRuntimeState');
  public static HomeDirectory: symbol = Symbol.for('HomeDirectory');
  public static OneShotCommand: symbol = Symbol.for('OneShotCommand');
  public static OneShotState: symbol = Symbol.for('OneShotState');
  public static OneShotDeployOrchestrator: symbol = Symbol.for('OneShotDeployOrchestrator');
  public static OneShotDestroyOrchestrator: symbol = Symbol.for('OneShotDestroyOrchestrator');
  public static TaskList: symbol = Symbol.for('TaskList');
  public static Commands: symbol = Symbol.for('Commands');
  public static MetricsServer: symbol = Symbol.for('MetricsServer');
  public static BackupRestoreCommand: symbol = Symbol.for('BackupRestoreCommand');
  public static OsPackageManager: symbol = Symbol.for('OsPackageManager');
  public static ClusterTaskManager: symbol = Symbol.for('ClusterTaskManager');
  public static GitClient: symbol = Symbol.for('GitClient');
  public static IgnorePodMetrics: symbol = Symbol.for('IgnorePodMetrics');
  public static PostgresSharedResource: symbol = Symbol.for('PostgresSharedResource');
  public static SharedResourceManager: symbol = Symbol.for('SharedResourceManager');

  // Dependencies
  public static DependencyManager: symbol = Symbol.for('DependencyManager');
  public static HelmExecutionBuilder: symbol = Symbol.for('HelmExecutionBuilder');
  public static HelmDependencyManager: symbol = Symbol.for('HelmDependencyManager');
  public static KindDependencyManager: symbol = Symbol.for('KindDependencyManager');
  public static KubectlDependencyManager: symbol = Symbol.for('KubectlDependencyManager');
  public static PodmanDependencyManager: symbol = Symbol.for('PodmanDependencyManager');
  public static VfkitDependencyManager: symbol = Symbol.for('VfkitDependencyManager');
  public static GvproxyDependencyManager: symbol = Symbol.for('GvproxyDependencyManager');
  public static NetavarkDependencyManager: symbol = Symbol.for('NetavarkDependencyManager');
  public static AardvarkDnsDependencyManager: symbol = Symbol.for('AardvarkDnsDependencyManager');
  public static CraneDependencyManager: symbol = Symbol.for('CraneDependencyManager');

  // Dependency Directories
  public static HelmInstallationDirectory: symbol = Symbol.for('HelmInstallationDirectory');
  public static KindInstallationDirectory: symbol = Symbol.for('KindInstallationDirectory');
  public static KubectlInstallationDirectory: symbol = Symbol.for('KubectlInstallationDirectory');
  public static PodmanInstallationDirectory: symbol = Symbol.for('PodmanInstallationDirectory');
  public static PodmanDependenciesInstallationDirectory: symbol = Symbol.for('PodmanDependenciesInstallationDirectory');
  public static CraneInstallationDirectory: symbol = Symbol.for('CraneInstallationDirectory');

  // Dependency Versions
  public static HelmVersion: symbol = Symbol.for('HelmVersion');
  public static KindVersion: symbol = Symbol.for('KindVersion');
  public static KubectlVersion: symbol = Symbol.for('KubectlVersion');
  public static PodmanVersion: symbol = Symbol.for('PodmanVersion');
  public static VfkitVersion: symbol = Symbol.for('VfkitVersion');
  public static GvproxyVersion: symbol = Symbol.for('GvproxyVersion');
  public static NetavarkVersion: symbol = Symbol.for('NetavarkVersion');
  public static AardvarkDnsVersion: symbol = Symbol.for('AardvarkDnsVersion');
  public static CraneVersion: symbol = Symbol.for('CraneVersion');

  // Cache
  public static CacheHandlerRegistry: symbol = Symbol.for('CacheHandlerRegistry');
  public static CacheCatalogStore: symbol = Symbol.for('CacheCatalogStore');
  public static CacheHealthInspector: symbol = Symbol.for('CacheHealthInspector');
  public static ImageCacheHandlerBuilder: symbol = Symbol.for('ImageCacheHandlerBuilder');
  public static ContainerEngineClient: symbol = Symbol.for('ContainerEngineClient');
  public static ContainerEngineResourceInspector: symbol = Symbol.for('ContainerEngineResourceInspector');

  // Command Definitions
  public static BackupRestoreCommandDefinition: symbol = Symbol.for('BackupRestoreCommandDefinition');
  public static BlockCommandDefinition: symbol = Symbol.for('BlockCommandDefinition');
  public static InitCommandDefinition: symbol = Symbol.for('InitCommandDefinition');
  public static ClusterReferenceCommandDefinition: symbol = Symbol.for('ClusterReferenceCommandDefinition');
  public static ConsensusCommandDefinition: symbol = Symbol.for('ConsensusCommandDefinition');
  public static DeploymentCommandDefinition: symbol = Symbol.for('DeploymentCommandDefinition');
  public static ExplorerCommandDefinition: symbol = Symbol.for('ExplorerCommandDefinition');
  public static KeysCommandDefinition: symbol = Symbol.for('KeysCommandDefinition');
  public static LedgerCommandDefinition: symbol = Symbol.for('LedgerCommandDefinition');
  public static MirrorCommandDefinition: symbol = Symbol.for('MirrorCommandDefinition');
  public static RelayCommandDefinition: symbol = Symbol.for('RelayCommandDefinition');
  public static CacheCommandDefinition: symbol = Symbol.for('CacheCommandDefinition');
  public static OneShotCommandDefinition: symbol = Symbol.for('OneShotCommandDefinition');
  public static RapidFireCommandDefinition: symbol = Symbol.for('RapidFireCommandDefinition');
}
