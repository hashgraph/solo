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
import {ClassToObjectMapper} from '../../data/mapper/impl/class-to-object-mapper.js';
import {HelmExecutionBuilder} from '../../integration/helm/execution/helm-execution-builder.js';
import {DefaultHelmClient} from '../../integration/helm/impl/default-helm-client.js';
import {HelpRenderer} from '../help-renderer.js';
import {Middlewares} from '../middlewares.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
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
   */
  public init(
    homeDirectory: string = constants.SOLO_HOME_DIR,
    cacheDirectory: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    developmentMode: boolean = false,
    testLogger?: SoloLogger,
  ) {
    if (Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container already initialized');
      return;
    }

    // SoloLogger
    container.register(InjectTokens.LogLevel, {useValue: logLevel});
    container.register(InjectTokens.DevelopmentMode, {useValue: developmentMode});
    if (testLogger) {
      container.registerInstance(InjectTokens.SoloLogger, testLogger);
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Using test logger');
    } else {
      container.register(InjectTokens.SoloLogger, {useClass: SoloWinstonLogger}, {lifecycle: Lifecycle.Singleton});
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Using default logger');
    }

    // Data Layer ObjectMapper
    container.register(InjectTokens.ObjectMapper, {useClass: ClassToObjectMapper}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.KeyFormatter, {useValue: ConfigKeyFormatter.instance()});

    // Data Layer Config
    container.register(
      InjectTokens.ConfigProvider,
      {useClass: LayeredConfigProvider},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.PackageDownloader, {useClass: PackageDownloader}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.Zippy, {useClass: Zippy}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.DependencyManager, {useClass: DependencyManager}, {lifecycle: Lifecycle.Singleton});

    // Helm & HelmDependencyManager
    container.register(InjectTokens.OsPlatform, {useValue: os.platform()});
    container.register(InjectTokens.Helm, {useClass: DefaultHelmClient}, {lifecycle: Lifecycle.Singleton});
    container.register(
      InjectTokens.HelmExecutionBuilder,
      {useClass: HelmExecutionBuilder},
      {lifecycle: Lifecycle.Singleton},
    );

    // HelmDependencyManager
    container.register(InjectTokens.HelmInstallationDir, {
      useValue: PathEx.join(constants.SOLO_HOME_DIR, 'bin'),
    });
    container.register(InjectTokens.OsArch, {useValue: os.arch()});
    container.register(InjectTokens.HelmVersion, {useValue: version.HELM_VERSION});
    container.register(
      InjectTokens.HelmDependencyManager,
      {useClass: HelmDependencyManager},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.ChartManager, {useClass: ChartManager}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.ConfigManager, {useClass: ConfigManager}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.K8Factory, {useClass: K8ClientFactory}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.AccountManager, {useClass: AccountManager}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.PlatformInstaller, {useClass: PlatformInstaller}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.KeyManager, {useClass: KeyManager}, {lifecycle: Lifecycle.Singleton});

    // ProfileManager
    container.register(InjectTokens.CacheDir, {useValue: cacheDirectory});
    container.register(InjectTokens.ProfileManager, {useClass: ProfileManager}, {lifecycle: Lifecycle.Singleton});
    // LeaseRenewalService
    container.register(
      InjectTokens.LockRenewalService,
      {useClass: IntervalLockRenewalService},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.LockManager, {useClass: LockManager}, {lifecycle: Lifecycle.Singleton});
    container.register(
      InjectTokens.CertificateManager,
      {useClass: CertificateManager},
      {lifecycle: Lifecycle.Singleton},
    );

    // LocalConfig
    const localConfigPath = PathEx.join(homeDirectory, constants.DEFAULT_LOCAL_CONFIG_FILE);
    container.register(InjectTokens.LocalConfigFilePath, {useValue: localConfigPath});
    container.register(InjectTokens.LocalConfig, {useClass: LocalConfig}, {lifecycle: Lifecycle.Singleton});

    container.register(
      InjectTokens.RemoteConfigManager,
      {useClass: RemoteConfigManager},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.ClusterChecks, {useClass: ClusterChecks}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.NetworkNodes, {useClass: NetworkNodes}, {lifecycle: Lifecycle.Singleton});

    container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Container initialized');
    Container.isInitialized = true;

    // Commands
    container.register(
      InjectTokens.ClusterCommandHandlers,
      {useClass: ClusterCommandHandlers},
      {lifecycle: Lifecycle.Singleton},
    );
    container.register(
      InjectTokens.ClusterCommandTasks,
      {useClass: ClusterCommandTasks},
      {lifecycle: Lifecycle.Singleton},
    );
    container.register(
      InjectTokens.NodeCommandHandlers,
      {useClass: NodeCommandHandlers},
      {lifecycle: Lifecycle.Singleton},
    );
    container.register(InjectTokens.NodeCommandTasks, {useClass: NodeCommandTasks}, {lifecycle: Lifecycle.Singleton});
    container.register(
      InjectTokens.ClusterCommandConfigs,
      {useClass: ClusterCommandConfigs},
      {lifecycle: Lifecycle.Singleton},
    );
    container.register(
      InjectTokens.NodeCommandConfigs,
      {useClass: NodeCommandConfigs},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.ErrorHandler, {useClass: ErrorHandler}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.HelpRenderer, {useClass: HelpRenderer}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.Middlewares, {useClass: Middlewares}, {lifecycle: Lifecycle.Singleton});
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   */
  public reset(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    testLogger?: SoloLogger,
  ) {
    if (Container.instance && Container.isInitialized) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).debug('Resetting container');
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, testLogger);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDirectory - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDirectory - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param developmentMode - if true, show full stack traces in error messages
   * @param testLogger - a test logger to use, if provided
   */
  public clearInstances(
    homeDirectory?: string,
    cacheDirectory?: string,
    logLevel?: string,
    developmentMode?: boolean,
    testLogger?: SoloLogger,
  ) {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDirectory, cacheDirectory, logLevel, developmentMode, testLogger);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  public async dispose() {
    await container.dispose();
  }
}
