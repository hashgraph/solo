// SPDX-License-Identifier: Apache-2.0

import {container, Lifecycle} from 'tsyringe-neo';
import {SoloLogger} from '../logging.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {DependencyManager, HelmDependencyManager} from '../dependency-managers/index.js';
import * as constants from '../constants.js';
import {Helm} from '../helm.js';
import {ChartManager} from '../chart-manager.js';
import {ConfigManager} from '../config-manager.js';
import {AccountManager} from '../account-manager.js';
import {PlatformInstaller} from '../platform-installer.js';
import {KeyManager} from '../key-manager.js';
import {ProfileManager} from '../profile-manager.js';
import {IntervalLockRenewalService} from '../lock/interval-lock-renewal.js';
import {LockManager} from '../lock/lock-manager.js';
import {CertificateManager} from '../certificate-manager.js';
import {LocalConfig} from '../config/local/local-config.js';
import {RemoteConfigManager} from '../config/remote/remote-config-manager.js';
import os from 'os';
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
import {CTObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {AccountCommand} from '../../commands/account.js';
import {DeploymentCommand} from '../../commands/deployment.js';
import {ExplorerCommand} from '../../commands/explorer.js';
import {InitCommand} from '../../commands/init.js';
import {MirrorNodeCommand} from '../../commands/mirror-node.js';
import {RelayCommand} from '../../commands/relay.js';
import {NetworkCommand} from '../../commands/network.js';
import {NodeCommand} from '../../commands/node/index.js';
import {ClusterCommand} from '../../commands/cluster/index.js';
import {Middlewares} from '../middlewares.js';

/**
 * Container class to manage the dependency injection container
 */
export class Container {
  private static instance: Container = null;
  private static isInitialized = false;

  private constructor() {}

  /**
   * Get the singleton instance of the container
   */
  static getInstance() {
    if (!Container.instance) {
      Container.instance = new Container();
    }

    return Container.instance;
  }

  /**
   * Initialize the container with the default dependencies
   * @param homeDir - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  init(
    homeDir: string = constants.SOLO_HOME_DIR,
    cacheDir: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    devMode: boolean = false,
    testLogger?: SoloLogger,
    overrides = {},
  ) {
    if (Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container already initialized');
      return;
    }

    const defaults = {
      LogLevel: [{useValue: logLevel}],
      DevMode: [{useValue: devMode}],
      OsPlatform: [{useValue: os.platform()}],
      OsArch: [{useValue: os.arch()}],
      HelmInstallationDir: [{useValue: PathEx.join(constants.SOLO_HOME_DIR, 'bin')}],
      HelmVersion: [{useValue: version.HELM_VERSION}],
      SystemAccounts: [{useValue: constants.SYSTEM_ACCOUNTS}],
      CacheDir: [{useValue: cacheDir}],
      LocalConfigFilePath: [{useValue: PathEx.join(homeDir, constants.DEFAULT_LOCAL_CONFIG_FILE)}],
      LockRenewalService: [{useClass: IntervalLockRenewalService}, {lifecycle: Lifecycle.Singleton}],
      LockManager: [{useClass: LockManager}, {lifecycle: Lifecycle.Singleton}],
      K8Factory: [{useClass: K8ClientFactory}, {lifecycle: Lifecycle.Singleton}],
      SoloLogger: [{useClass: SoloLogger}, {lifecycle: Lifecycle.Singleton}],
      PackageDownloader: [{useClass: PackageDownloader}, {lifecycle: Lifecycle.Singleton}],
      Zippy: [{useClass: Zippy}, {lifecycle: Lifecycle.Singleton}],
      DependencyManager: [{useClass: DependencyManager}, {lifecycle: Lifecycle.Singleton}],
      Helm: [{useClass: Helm}, {lifecycle: Lifecycle.Singleton}],
      HelmDependencyManager: [{useClass: HelmDependencyManager}, {lifecycle: Lifecycle.Singleton}],
      ChartManager: [{useClass: ChartManager}, {lifecycle: Lifecycle.Singleton}],
      ConfigManager: [{useClass: ConfigManager}, {lifecycle: Lifecycle.Singleton}],
      AccountManager: [{useClass: AccountManager}, {lifecycle: Lifecycle.Singleton}],
      PlatformInstaller: [{useClass: PlatformInstaller}, {lifecycle: Lifecycle.Singleton}],
      KeyManager: [{useClass: KeyManager}, {lifecycle: Lifecycle.Singleton}],
      ProfileManager: [{useClass: ProfileManager}, {lifecycle: Lifecycle.Singleton}],
      CertificateManager: [{useClass: CertificateManager}, {lifecycle: Lifecycle.Singleton}],
      LocalConfig: [{useClass: LocalConfig}, {lifecycle: Lifecycle.Singleton}],
      RemoteConfigManager: [{useClass: RemoteConfigManager}, {lifecycle: Lifecycle.Singleton}],
      ClusterChecks: [{useClass: ClusterChecks}, {lifecycle: Lifecycle.Singleton}],
      NetworkNodes: [{useClass: NetworkNodes}, {lifecycle: Lifecycle.Singleton}],
      AccountCommand: [{useClass: AccountCommand}, {lifecycle: Lifecycle.Singleton}],
      ClusterCommand: [{useClass: ClusterCommand}, {lifecycle: Lifecycle.Singleton}],
      NodeCommand: [{useClass: NodeCommand}, {lifecycle: Lifecycle.Singleton}],
      DeploymentCommand: [{useClass: DeploymentCommand}, {lifecycle: Lifecycle.Singleton}],
      ExplorerCommand: [{useClass: ExplorerCommand}, {lifecycle: Lifecycle.Singleton}],
      InitCommand: [{useClass: InitCommand}, {lifecycle: Lifecycle.Singleton}],
      MirrorNodeCommand: [{useClass: MirrorNodeCommand}, {lifecycle: Lifecycle.Singleton}],
      NetworkCommand: [{useClass: NetworkCommand}, {lifecycle: Lifecycle.Singleton}],
      RelayCommand: [{useClass: RelayCommand}, {lifecycle: Lifecycle.Singleton}],
      ClusterCommandTasks: [{useClass: ClusterCommandTasks}, {lifecycle: Lifecycle.Singleton}],
      ClusterCommandHandlers: [{useClass: ClusterCommandHandlers}, {lifecycle: Lifecycle.Singleton}],
      NodeCommandTasks: [{useClass: NodeCommandTasks}, {lifecycle: Lifecycle.Singleton}],
      NodeCommandHandlers: [{useClass: NodeCommandHandlers}, {lifecycle: Lifecycle.Singleton}],
      ClusterCommandConfigs: [{useClass: ClusterCommandConfigs}, {lifecycle: Lifecycle.Singleton}],
      NodeCommandConfigs: [{useClass: NodeCommandConfigs}, {lifecycle: Lifecycle.Singleton}],
      ErrorHandler: [{useClass: ErrorHandler}, {lifecycle: Lifecycle.Singleton}],
      ObjectMapper: [{useClass: CTObjectMapper}, {lifecycle: Lifecycle.Singleton}],
      KeyFormatter: [{useValue: ConfigKeyFormatter.instance()}],
      Middlewares: [{useClass: Middlewares}, {lifecycle: Lifecycle.Singleton}],
    };

    const dependencies = {...defaults, ...overrides};

    const orderedKeys: string[] = Object.keys(InjectTokens).sort((a: string, b: string) => {
      // SoloLogger should be first
      if (a === 'SoloLogger') {
        return -1;
      }
      return 0;
    });

    for (const tokenName of orderedKeys) {
      if (dependencies[tokenName]) {
        // @ts-ignore
        container.register(InjectTokens[tokenName], ...dependencies[tokenName]);

        if (overrides[tokenName]) {
          container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Using overridden dependency for %s', tokenName);
        }
      }
    }

    // // if (testLogger) {
    // //   container.registerInstance(InjectTokens.SoloLogger, testLogger);
    // //   container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Using test logger');
    // // } else {
    // //   container.register(InjectTokens.SoloLogger, {useClass: SoloLogger}, {lifecycle: Lifecycle.Singleton});
    // //   container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Using default logger');
    // // }
    //
    // // // Data Layer ObjectMapper
    // // container.register(InjectTokens.ObjectMapper, {useClass: CTObjectMapper}, {lifecycle: Lifecycle.Singleton});
    // // container.register(InjectTokens.KeyFormatter, {useValue: ConfigKeyFormatter.instance()});
    //
    // container.register(InjectTokens.PackageDownloader, {useClass: PackageDownloader}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.Zippy, {useClass: Zippy}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.DependencyManager, {useClass: DependencyManager}, {lifecycle: Lifecycle.Singleton});
    //
    // // Helm & HelmDependencyManager
    // // container.register(InjectTokens.OsPlatform, {useValue: os.platform()});
    // container.register(InjectTokens.Helm, {useClass: Helm}, {lifecycle: Lifecycle.Singleton});
    //
    // // HelmDependencyManager
    // // container.register(InjectTokens.HelmInstallationDir, {
    // //   useValue: PathEx.join(constants.SOLO_HOME_DIR, 'bin'),
    // // });
    // // container.register(InjectTokens.OsArch, {useValue: os.arch()});
    // // container.register(InjectTokens.HelmVersion, {useValue: version.HELM_VERSION});
    // container.register(
    //   InjectTokens.HelmDependencyManager,
    //   {useClass: HelmDependencyManager},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    //
    // container.register(InjectTokens.ChartManager, {useClass: ChartManager}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.ConfigManager, {useClass: ConfigManager}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.K8Factory, {useClass: K8ClientFactory}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.AccountManager, {useClass: AccountManager}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.PlatformInstaller, {useClass: PlatformInstaller}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.KeyManager, {useClass: KeyManager}, {lifecycle: Lifecycle.Singleton});
    //
    // // ProfileManager
    // // container.register(InjectTokens.CacheDir, {useValue: cacheDir});
    // container.register(InjectTokens.ProfileManager, {useClass: ProfileManager}, {lifecycle: Lifecycle.Singleton});
    // // LeaseRenewalService
    // container.register(
    //   InjectTokens.LockRenewalService,
    //   {useClass: IntervalLockRenewalService},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    //
    // container.register(InjectTokens.LockManager, {useClass: LockManager}, {lifecycle: Lifecycle.Singleton});
    // container.register(
    //   InjectTokens.CertificateManager,
    //   {useClass: CertificateManager},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    //
    // // LocalConfig
    // // const localConfigPath = PathEx.join(homeDir, constants.DEFAULT_LOCAL_CONFIG_FILE);
    // // container.register(InjectTokens.LocalConfigFilePath, {useValue: localConfigPath});
    // container.register(InjectTokens.LocalConfig, {useClass: LocalConfig}, {lifecycle: Lifecycle.Singleton});
    //
    // container.register(
    //   InjectTokens.RemoteConfigManager,
    //   {useClass: RemoteConfigManager},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    //
    // container.register(InjectTokens.ClusterChecks, {useClass: ClusterChecks}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.NetworkNodes, {useClass: NetworkNodes}, {lifecycle: Lifecycle.Singleton});
    //
    // // Commands
    // container.register(
    //   InjectTokens.ClusterCommandHandlers,
    //   {useClass: ClusterCommandHandlers},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    // container.register(
    //   InjectTokens.ClusterCommandTasks,
    //   {useClass: ClusterCommandTasks},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    // container.register(
    //   InjectTokens.NodeCommandHandlers,
    //   {useClass: NodeCommandHandlers},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    // container.register(InjectTokens.NodeCommandTasks, {useClass: NodeCommandTasks}, {lifecycle: Lifecycle.Singleton});
    // container.register(
    //   InjectTokens.ClusterCommandConfigs,
    //   {useClass: ClusterCommandConfigs},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    // container.register(
    //   InjectTokens.NodeCommandConfigs,
    //   {useClass: NodeCommandConfigs},
    //   {lifecycle: Lifecycle.Singleton},
    // );
    // container.register(InjectTokens.AccountCommand, {useClass: AccountCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.DeploymentCommand, {useClass: DeploymentCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.ExplorerCommand, {useClass: ExplorerCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.InitCommand, {useClass: InitCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.MirrorNodeCommand, {useClass: MirrorNodeCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.RelayCommand, {useClass: RelayCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.NetworkCommand, {useClass: NetworkCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.NodeCommand, {useClass: NodeCommand}, {lifecycle: Lifecycle.Singleton});
    // container.register(InjectTokens.ClusterCommand, {useClass: ClusterCommand}, {lifecycle: Lifecycle.Singleton});
    //
    // container.register(InjectTokens.ErrorHandler, {useClass: ErrorHandler}, {lifecycle: Lifecycle.Singleton});

    container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container initialized');
    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDir - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  reset(
    homeDir?: string,
    cacheDir?: string,
    logLevel?: string,
    devMode?: boolean,
    testLogger?: SoloLogger,
    overrides = {},
  ) {
    if (Container.instance && Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Resetting container');
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDir, cacheDir, logLevel, devMode, testLogger, overrides);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDir - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  clearInstances(
    homeDir?: string,
    cacheDir?: string,
    logLevel?: string,
    devMode?: boolean,
    testLogger?: SoloLogger,
    overrides = {},
  ) {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDir, cacheDir, logLevel, devMode, testLogger, overrides);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  async dispose() {
    await container.dispose();
  }
}
