/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import type {SoloLogger} from '../core/logging.js';
import type {Helm} from '../core/helm.js';
import type {K8} from '../core/k8.js';
import type {PackageDownloader} from '../core/package_downloader.js';
import type {PlatformInstaller} from '../core/platform_installer.js';
import type {ChartManager} from '../core/chart_manager.js';
import type {ConfigManager} from '../core/config_manager.js';
import type {DependencyManager} from '../core/dependency_managers/index.js';
import type {KeyManager} from '../core/key_manager.js';
import type {AccountManager} from '../core/account_manager.js';
import type {ProfileManager} from '../core/profile_manager.js';
import type {LeaseManager} from '../core/lease/lease_manager.js';
import type {CertificateManager} from '../core/certificate_manager.js';
import type {LocalConfig} from '../core/config/local_config.js';
import type {RemoteConfigManager} from '../core/config/remote/remote_config_manager.js';

export interface Opts {
  logger: SoloLogger;
  helm: Helm;
  k8: K8;
  downloader: PackageDownloader;
  platformInstaller: PlatformInstaller;
  chartManager: ChartManager;
  configManager: ConfigManager;
  depManager: DependencyManager;
  keyManager: KeyManager;
  accountManager: AccountManager;
  profileManager: ProfileManager;
  leaseManager: LeaseManager;
  certificateManager: CertificateManager;
  localConfig: LocalConfig;
  remoteConfigManager: RemoteConfigManager;
}
