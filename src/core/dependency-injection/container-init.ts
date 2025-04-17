// SPDX-License-Identifier: Apache-2.0

import {container, Lifecycle} from 'tsyringe-neo';
import {type SoloLogger} from '../logging/solo-logger.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {DependencyManager, HelmDependencyManager} from '../dependency-managers/index.js';
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
import {CertificateManager} from '../certificate-manager.js';
import {LocalConfig} from '../config/local/local-config.js';
import {RemoteConfigManager} from '../config/remote/remote-config-manager.js';
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
import {CTObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {HelmExecutionBuilder} from '../../integration/helm/execution/helm-execution-builder.js';
import {DefaultHelmClient} from '../../integration/helm/impl/default-helm-client.js';
import {HelpRenderer} from '../help-renderer.js';
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
import {SoloWinstonLogger} from '../logging/solo-winston-logger.js';

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
  public static getInstance() {
    if (!Container.instance) {
      Container.instance = new Container();
    }

    return Container.instance;
  }

  /**
   * Initialize the container with the default dependencies
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  public init(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
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
      SoloLogger: [{useClass: SoloWinstonLogger}, {lifecycle: Lifecycle.Singleton}],
      PackageDownloader: [{useClass: PackageDownloader}, {lifecycle: Lifecycle.Singleton}],
      Zippy: [{useClass: Zippy}, {lifecycle: Lifecycle.Singleton}],
      DependencyManager: [{useClass: DependencyManager}, {lifecycle: Lifecycle.Singleton}],
      Helm: [{useClass: DefaultHelmClient}, {lifecycle: Lifecycle.Singleton}],
      HelmExecutionBuilder: [{useClass: HelmExecutionBuilder}, {lifecycle: Lifecycle.Singleton}],
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
      HelpRenderer: [{useClass: HelpRenderer}, {lifecycle: Lifecycle.Singleton}],
      ConfigProvider: [{useClass: LayeredConfigProvider}, {lifecycle: Lifecycle.Singleton}],
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

    container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container initialized');
    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  public reset(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    testLogger?: SoloLogger,
    overrides = {},
  ) {
    if (Container.instance && Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Resetting container');
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, testLogger, overrides);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   * @param overrides - mocked instances to use instead of the default implementations
   */
  public clearInstances(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    testLogger?: SoloLogger,
    overrides = {},
  ) {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, testLogger, overrides);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  public async dispose() {
    await container.dispose();
  }
}
