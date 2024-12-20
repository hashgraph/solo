import {container} from "tsyringe-neo";
import {SoloLogger} from "../src/core/logging.js";
import {PackageDownloader} from "../src/core/package_downloader.js";
import {Zippy} from "../src/core/zippy.js";
import {DependencyManager, HelmDependencyManager} from "../src/core/dependency_managers/index.js";
import {Helm} from "../src/core/helm.js";
import {ChartManager} from "../src/core/chart_manager.js";
import {ConfigManager} from "../src/core/config_manager.js";
import {K8} from "../src/core/k8.js";
import {AccountManager} from "../src/core/account_manager.js";
import {PlatformInstaller} from "../src/core/platform_installer.js";
import {KeyManager} from "../src/core/key_manager.js";
import {ProfileManager} from "../src/core/profile_manager.js";
import {IntervalLeaseRenewalService} from "../src/core/lease/interval_lease_renewal.js";
import {LeaseManager} from "../src/core/lease/lease_manager.js";
import {CertificateManager} from "../src/core/certificate_manager.js";
import path from "path";
import * as constants from "../src/core/constants.js";
import {LocalConfig} from "../src/core/config/local_config.js";
import {RemoteConfigManager} from "../src/core/config/remote/remote_config_manager.js";


let cacheDir = path.join('test', 'data', 'tmp');
// if (!cacheDir) cacheDir = path.join('test', 'data', 'tmp');
// container.reset();
container.register<SoloLogger>(SoloLogger, {useValue: new SoloLogger('debug', true)});
container.register<PackageDownloader>(PackageDownloader, {useValue: new PackageDownloader()});
container.register<Zippy>(Zippy, {useValue: new Zippy()});
container.register<HelmDependencyManager>(HelmDependencyManager, {useValue: new HelmDependencyManager()});
container.register<DependencyManager>(DependencyManager, {useValue: new DependencyManager()});
container.register<Helm>(Helm, {useValue: new Helm()});
container.register<ChartManager>(ChartManager, {useValue: new ChartManager()});
container.register<ConfigManager>(ConfigManager, {useValue: new ConfigManager()});
container.register<K8>(K8, {useValue: new K8()});
container.register<AccountManager>(AccountManager, {useValue: new AccountManager()});
container.register<PlatformInstaller>(PlatformInstaller, {useValue: new PlatformInstaller()});
container.register<KeyManager>(KeyManager, {useValue: new KeyManager()});
container.register<ProfileManager>(ProfileManager, {useValue: new ProfileManager()});
container.register<IntervalLeaseRenewalService>(IntervalLeaseRenewalService, {
    useValue: new IntervalLeaseRenewalService(),
});
container.register<LeaseManager>(LeaseManager, {
    useValue: new LeaseManager(container.resolve(IntervalLeaseRenewalService)),
});
container.register<CertificateManager>(CertificateManager, {useValue: new CertificateManager()});
const localConfigPath = path.join(cacheDir, constants.DEFAULT_LOCAL_CONFIG_FILE);
container.register<LocalConfig>(LocalConfig, {useValue: new LocalConfig(localConfigPath)});
container.register<RemoteConfigManager>(RemoteConfigManager, {useValue: new RemoteConfigManager()});

export function resetTestContainer(cacheDir?: string) {

}