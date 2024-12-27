/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {container, instanceCachingFactory} from 'tsyringe-neo';
import {SoloLogger} from './logging.js';
import {PackageDownloader} from './package_downloader.js';
import {Zippy} from './zippy.js';
import {DependencyManager, HelmDependencyManager} from './dependency_managers/index.js';
import * as constants from './constants.js';
import {Helm} from './helm.js';
import {ChartManager} from './chart_manager.js';
import {ConfigManager} from './config_manager.js';
import {K8} from './k8.js';
import {AccountManager} from './account_manager.js';
import {PlatformInstaller} from './platform_installer.js';
import {KeyManager} from './key_manager.js';
import {ProfileManager} from './profile_manager.js';
import {IntervalLeaseRenewalService} from './lease/interval_lease_renewal.js';
import {LeaseManager} from './lease/lease_manager.js';
import {CertificateManager} from './certificate_manager.js';
import path from 'path';
import {LocalConfig} from './config/local_config.js';
import {RemoteConfigManager} from './config/remote/remote_config_manager.js';
import os from 'os';
import * as version from '../../version.js';

export class Container {
  private static instance: Container = null;
  private static isInitialized = false;

  private constructor() {}

  static getInstance() {
    if (!Container.instance) {
      Container.instance = new Container();
    }

    return Container.instance;
  }

  init(cacheDir: string = constants.SOLO_CACHE_DIR, logLevel: string = 'debug', devMode: boolean = false) {
    // SoloLogger
    container.register('logLevel', {useValue: logLevel});
    container.register('devMode', {useValue: devMode});

    // container.register<SoloLogger>(SoloLogger, {useValue: new SoloLogger()});
    // container.register<PackageDownloader>(PackageDownloader, {useValue: new PackageDownloader()});
    // container.register<Zippy>(Zippy, {useValue: new Zippy()});
    // container.register<HelmDependencyManager>(HelmDependencyManager, {useValue: new HelmDependencyManager()});
    // container.register<DependencyManager>(DependencyManager, {useValue: new DependencyManager()});

    // Helm & HelmDependencyManager
    container.register('osPlatform', {useValue: os.platform()});

    // HelmDependencyManager
    container.register('helmInstallationDir', {useValue: path.join(constants.SOLO_HOME_DIR, 'bin')});
    container.register('osArch', {useValue: os.arch()});
    container.register('helmVersion', {useValue: version.HELM_VERSION});

    // container.register<Helm>(Helm, {useValue: new Helm()});
    // container.register<ChartManager>(ChartManager, {useValue: new ChartManager()});
    // container.register<ConfigManager>(ConfigManager, {useValue: new ConfigManager()});
    // container.register<K8>(K8, {useValue: new K8()});
    // container.register<AccountManager>(AccountManager, {useValue: new AccountManager()});
    // container.register<PlatformInstaller>(PlatformInstaller, {useValue: new PlatformInstaller()});
    // container.register<KeyManager>(KeyManager, {useValue: new KeyManager()});

    // ProfileManager
    container.register('cacheDir', {useValue: cacheDir});

    // container.register<ProfileManager>(ProfileManager, {useValue: new ProfileManager()});

    // LeaseRenewalService
    container.register('LeaseRenewalService', {
      useValue: new IntervalLeaseRenewalService(),
    });

    // container.register<LeaseManager>(LeaseManager, {
    //   useValue: new LeaseManager(container.resolve(IntervalLeaseRenewalService)),
    // });
    // container.register<CertificateManager>(CertificateManager, {useValue: new CertificateManager()});

    // LocalConfig
    const localConfigPath = path.join(cacheDir, constants.DEFAULT_LOCAL_CONFIG_FILE);
    container.register('localConfigFilePath', {useValue: localConfigPath});

    // container.register<LocalConfig>(LocalConfig, {useValue: new LocalConfig()});
    // container.register<RemoteConfigManager>(RemoteConfigManager, {useValue: new RemoteConfigManager()});
    Container.isInitialized = true;
  }

  /**
   * clears the container registries and re-initializes the container
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   */
  reset(cacheDir?: string, logLevel?: string, devMode?: boolean) {
    if (Container.instance && Container.isInitialized) {
      container.reset();
    }
    Container.getInstance().init(cacheDir, logLevel, devMode);
  }

  /**
   * clears the container instances, useful for testing when you are using container.registerInstance()
   * @param cacheDir - the cache directory to use, defaults to constants.SOLO_CACHE_DIR
   * @param logLevel - the log level to use, defaults to 'debug'
   * @param devMode - if true, show full stack traces in error messages
   */
  clearInstances(cacheDir?: string, logLevel?: string, devMode?: boolean) {
    if (Container.instance && Container.isInitialized) {
      container.clearInstances();
    } else {
      Container.getInstance().init(cacheDir, logLevel, devMode);
    }
  }

  /**
   * only call dispose when you are about to system exit
   */
  async dispose() {
    await container.dispose();
  }
}
