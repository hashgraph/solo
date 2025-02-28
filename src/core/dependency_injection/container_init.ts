/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {container, Lifecycle} from 'tsyringe-neo';
import {SoloLogger} from '../logging.js';
import {PackageDownloader} from '../package_downloader.js';
import {Zippy} from '../zippy.js';
import {DependencyManager, HelmDependencyManager} from '../dependency_managers/index.js';
import * as constants from '../constants.js';
import {Helm} from '../helm.js';
import {ChartManager} from '../chart_manager.js';
import {ConfigManager} from '../config_manager.js';
import {AccountManager} from '../account_manager.js';
import {PlatformInstaller} from '../platform_installer.js';
import {KeyManager} from '../key_manager.js';
import {ProfileManager} from '../profile_manager.js';
import {IntervalLeaseRenewalService} from '../lease/interval_lease_renewal.js';
import {LeaseManager} from '../lease/lease_manager.js';
import {CertificateManager} from '../certificate_manager.js';
import path, {normalize} from 'path';
import {LocalConfig} from '../config/local_config.js';
import {RemoteConfigManager} from '../config/remote/remote_config_manager.js';
import os from 'os';
import * as version from '../../../version.js';
import {NetworkNodes} from '../network_nodes.js';
import {ClusterChecks} from '../cluster_checks.js';
import {InjectTokens} from './inject_tokens.js';
import {K8ClientFactory} from '../kube/k8_client/k8_client_factory.js';

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
   */
  init(
    homeDir: string = constants.SOLO_HOME_DIR,
    cacheDir: string = constants.SOLO_CACHE_DIR,
    logLevel: string = 'debug',
    devMode: boolean = false,
  ) {
    if (Container.isInitialized) return;

    // SoloLogger
    container.register(InjectTokens.LogLevel, {useValue: logLevel});
    container.register(InjectTokens.DevMode, {useValue: devMode});
    container.register(InjectTokens.SoloLogger, {useClass: SoloLogger}, {lifecycle: Lifecycle.Singleton});

    container.register(InjectTokens.PackageDownloader, {useClass: PackageDownloader}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.Zippy, {useClass: Zippy}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.DependencyManager, {useClass: DependencyManager}, {lifecycle: Lifecycle.Singleton});

    // Helm & HelmDependencyManager
    container.register(InjectTokens.OsPlatform, {useValue: os.platform()});
    container.register(InjectTokens.Helm, {useClass: Helm}, {lifecycle: Lifecycle.Singleton});

    // HelmDependencyManager
    container.register(InjectTokens.HelmInstallationDir, {useValue: path.join(constants.SOLO_HOME_DIR, 'bin')});
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
    container.register(InjectTokens.CacheDir, {useValue: cacheDir});
    container.register(InjectTokens.ProfileManager, {useClass: ProfileManager}, {lifecycle: Lifecycle.Singleton});
    // LeaseRenewalService
    container.register(
      InjectTokens.LeaseRenewalService,
      {useClass: IntervalLeaseRenewalService},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.LeaseManager, {useClass: LeaseManager}, {lifecycle: Lifecycle.Singleton});
    container.register(
      InjectTokens.CertificateManager,
      {useClass: CertificateManager},
      {lifecycle: Lifecycle.Singleton},
    );

    // LocalConfig
    const localConfigPath = normalize(path.join(homeDir, constants.DEFAULT_LOCAL_CONFIG_FILE));
    container.register(InjectTokens.LocalConfigFilePath, {useValue: localConfigPath});
    container.register(InjectTokens.LocalConfig, {useClass: LocalConfig}, {lifecycle: Lifecycle.Singleton});

    container.register(
      InjectTokens.RemoteConfigManager,
      {useClass: RemoteConfigManager},
      {lifecycle: Lifecycle.Singleton},
    );

    container.register(InjectTokens.ClusterChecks, {useClass: ClusterChecks}, {lifecycle: Lifecycle.Singleton});
    container.register(InjectTokens.NetworkNodes, {useClass: NetworkNodes}, {lifecycle: Lifecycle.Singleton});

    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param homeDir - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   */
  reset(homeDir?: string, cacheDir?: string, logLevel?: string, devMode?: boolean) {
    if (Container.instance && Container.isInitialized) {
      container.reset();
      Container.isInitialized = false;
    }
    Container.getInstance().init(homeDir, cacheDir, logLevel, devMode);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param homeDir - the home directory to use, defaults to constants.SOLO_HOME_DIR
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   */
  clearInstances(homeDir?: string, cacheDir?: string, logLevel?: string, devMode?: boolean) {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
      Container.isInitialized = false;
    } else {
      Container.getInstance().init(homeDir, cacheDir, logLevel, devMode);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  async dispose() {
    await container.dispose();
  }
}
