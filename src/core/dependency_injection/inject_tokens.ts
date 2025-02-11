/**
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Dependency injection tokens
 */
export const InjectTokens = {
  LogLevel: Symbol.for('LogLevel'),
  DevMode: Symbol.for('DevMode'),
  OsPlatform: Symbol.for('OsPlatform'),
  OsArch: Symbol.for('OsArch'),
  HelmInstallationDir: Symbol.for('HelmInstallationDir'),
  HelmVersion: Symbol.for('HelmVersion'),
  CacheDir: Symbol.for('CacheDir'),
  LocalConfigFilePath: Symbol.for('LocalConfigFilePath'),
  LeaseRenewalService: Symbol.for('LeaseRenewalService'),
  K8Factory: Symbol.for('K8Factory'),
  SoloLogger: Symbol.for('SoloLogger'),
  PackageDownloader: Symbol.for('PackageDownloader'),
  Zippy: Symbol.for('Zippy'),
  DependencyManager: Symbol.for('DependencyManager'),
  Helm: Symbol.for('Helm'),
  HelmDependencyManager: Symbol.for('HelmDependencyManager'),
  ChartManager: Symbol.for('ChartManager'),
  ConfigManager: Symbol.for('ConfigManager'),
  AccountManager: Symbol.for('AccountManager'),
  PlatformInstaller: Symbol.for('PlatformInstaller'),
  KeyManager: Symbol.for('KeyManager'),
  ProfileManager: Symbol.for('ProfileManager'),
  LeaseManager: Symbol.for('LeaseManager'),
  CertificateManager: Symbol.for('CertificateManager'),
  LocalConfig: Symbol.for('LocalConfig'),
  RemoteConfigManager: Symbol.for('RemoteConfigManager'),
  ClusterChecks: Symbol.for('ClusterChecks'),
  NetworkNodes: Symbol.for('NetworkNodes'),
};
