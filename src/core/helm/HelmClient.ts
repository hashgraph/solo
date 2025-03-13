// SPDX-License-Identifier: Apache-2.0

import { SemanticVersion } from './base/api/version/SemanticVersion.js';
import { Chart } from './model/Chart.js';
import { Repository } from './model/Repository.js';
import { Release } from './model/chart/Release.js';
import { InstallChartOptions } from './model/install/InstallChartOptions.js';
import { ReleaseItem } from './model/release/ReleaseItem.js';
import { TestChartOptions } from './model/test/TestChartOptions.js';
import { DefaultHelmClientBuilder } from './impl/DefaultHelmClientBuilder.js';
import { HelmClientBuilder } from './HelmClientBuilder.js';

/**
 * The HelmClient is a bridge between TypeScript and the Helm CLI. The client is highly dependent on specific features
 * and versions of the Helm CLI tools; therefore, all implementations are expected to provide a packaged Helm executable
 * of the appropriate version for each supported OS and architecture.
 */
export interface HelmClient {
  /**
   * Executes the Helm CLI version sub-command and returns the reported version.
   *
   * @returns the version of the Helm CLI that is being used by this client.
   */
  version(): SemanticVersion;

  /**
   * Executes the Helm CLI repo list sub-command and returns the list of repositories.
   *
   * @returns the list of repositories.
   */
  listRepositories(): Promise<Repository[]>;

  /**
   * Executes the Helm CLI repo add sub-command and adds a new repository.
   *
   * @param repository the repository to add.
   * @throws Error if name or url is null or blank.
   * @throws HelmExecutionException if the Helm CLI command fails.
   * @throws HelmParserException if the output of the Helm CLI command cannot be parsed.
   */
  addRepository(repository: Repository): Promise<void>;

  /**
   * Executes the Helm CLI repo remove sub-command and removes a repository.
   *
   * @param repository the repository to remove.
   */
  removeRepository(repository: Repository): Promise<void>;

  /**
   * Executes the Helm CLI install sub-command and installs a Helm chart.
   *
   * @param releaseName the name of the release.
   * @param chart the Helm chart to install.
   * @returns the Release that was installed.
   */
  installChart(releaseName: string, chart: Chart): Promise<Release>;

  /**
   * Executes the Helm CLI install sub-command and installs a Helm chart passing the flags and arguments
   * provided.
   *
   * @param releaseName the name of the release.
   * @param chart the Helm chart to install.
   * @param options the options to pass to the Helm CLI command.
   * @returns the Release that was installed.
   */
  installChartWithOptions(releaseName: string, chart: Chart, options: InstallChartOptions): Promise<Release>;

  /**
   * Executes the Helm CLI uninstall sub-command and uninstalls the specified Helm chart.
   *
   * @param releaseName the name of the release to uninstall.
   */
  uninstallChart(releaseName: string): Promise<void>;

  /**
   * Executes the Helm CLI test sub-command and tests the specified Helm chart.
   *
   * @param releaseName the name of the release to test.
   * @param options the options to pass to the Helm CLI command.
   */
  testChart(releaseName: string, options: TestChartOptions): Promise<void>;

  /**
   * Executes the Helm CLI list sub-command and returns the list of releases.
   * @param allNamespaces if true, list releases across all namespaces.
   * @returns the list of releases.
   */
  listReleases(allNamespaces: boolean): Promise<ReleaseItem[]>;

  /**
   * Executes the Helm CLI dependency update sub-command and updates the dependencies of the specified Helm
   * chart.
   *
   * @param chartName the name of the chart to update.
   */
  dependencyUpdate(chartName: string): Promise<void>;
}

/**
 * Creates a new HelmClientBuilder instance with the default configuration.
 *
 * @returns a new HelmClientBuilder instance.
 */
export function builder(): HelmClientBuilder {
  return new DefaultHelmClientBuilder();
}

/**
 * Creates a new HelmClient instance with the default configuration. This is a shortcut for
 * HelmClient.builder().build().
 *
 * @returns a new HelmClient instance.
 */
export function defaultClient(): HelmClient {
  return builder().build();
} 