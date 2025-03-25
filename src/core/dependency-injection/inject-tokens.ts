// SPDX-License-Identifier: Apache-2.0

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
  SystemAccounts: Symbol.for('SystemAccounts'),
  CacheDir: Symbol.for('CacheDir'),
  LocalConfigFilePath: Symbol.for('LocalConfigFilePath'),
  LockRenewalService: Symbol.for('LockRenewalService'),
  LockManager: Symbol.for('LockManager'),
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
  CertificateManager: Symbol.for('CertificateManager'),
  LocalConfig: Symbol.for('LocalConfig'),
  RemoteConfigManager: Symbol.for('RemoteConfigManager'),
  ClusterChecks: Symbol.for('ClusterChecks'),
  NetworkNodes: Symbol.for('NetworkNodes'),
  AccountCommand: Symbol.for('AccountCommand'),
  ClusterCommand: Symbol.for('ClusterCommand'),
  NodeCommand: Symbol.for('NodeCommand'),
  DeploymentCommand: Symbol.for('DeploymentCommand'),
  ExplorerCommand: Symbol.for('ExplorerCommand'),
  InitCommand: Symbol.for('InitCommand'),
  MirrorNodeCommand: Symbol.for('MirrorNodeCommand'),
  NetworkCommand: Symbol.for('NetworkCommand'),
  RelayCommand: Symbol.for('RelayCommand'),
  ClusterCommandTasks: Symbol.for('ClusterCommandTasks'),
  ClusterCommandHandlers: Symbol.for('ClusterCommandHandlers'),
  NodeCommandTasks: Symbol.for('NodeCommandTasks'),
  NodeCommandHandlers: Symbol.for('NodeCommandHandlers'),
  ClusterCommandConfigs: Symbol.for('ClusterCommandConfigs'),
  NodeCommandConfigs: Symbol.for('NodeCommandConfigs'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  ObjectMapper: Symbol.for('ObjectMapper'),
  KeyFormatter: Symbol.for('KeyFormatter'),
  Middlewares: Symbol.for('Middlewares'),
  CommandInvoker: Symbol.for('CommandInvoker'),
};
