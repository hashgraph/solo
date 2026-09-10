// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {type HelmClient} from '../../../../../src/integration/helm/helm-client.js';
import {HelmExecutionException} from '../../../../../src/integration/helm/helm-execution-exception.js';
import {Chart} from '../../../../../src/integration/helm/model/chart.js';
import {Repository} from '../../../../../src/integration/helm/model/repository.js';
import {DefaultHelmClientBuilder} from '../../../../../src/integration/helm/impl/default-helm-client-builder.js';
import {type InstallChartOptions} from '../../../../../src/integration/helm/model/install/install-chart-options.js';
import {UpgradeChartOptionsBuilder} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options-builder.js';
import {exec as execCallback, type ExecException} from 'node:child_process';
import {promisify} from 'node:util';
import {InstallChartOptionsBuilder} from '../../../../../src/integration/helm/model/install/install-chart-options-builder.js';
import {UnInstallChartOptionsBuilder} from '../../../../../src/integration/helm/model/install/un-install-chart-options-builder.js';
import {TestChartOptionsBuilder} from '../../../../../src/integration/helm/model/test/test-chart-options-builder.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../../src/integration/kube/k8-factory.js';
import {container} from 'tsyringe-neo';
import {type K8} from '../../../../../src/integration/kube/k8.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {AddRepoOptionsBuilder} from '../../../../../src/integration/helm/model/add/add-repo-options-builder.js';
import {type AddRepoOptions} from '../../../../../src/integration/helm/model/add/add-repo-options.js';
import {type Release} from '../../../../../src/integration/helm/model/chart/release.js';
import {type ReleaseItem} from '../../../../../src/integration/helm/model/release/release-item.js';
import {type TestChartOptions} from '../../../../../src/integration/helm/model/test/test-chart-options.js';
import * as constants from '../../../../../src/core/constants.js';
import path from 'node:path';
import {
  type HelmDependencyManager,
  type KubectlDependencyManager,
} from '../../../../../src/core/dependency-managers/index.js';
import {resetForTest} from '../../../../test-container.js';
import {getTemporaryDirectory} from '../../../../test-utility.js';
import {SemanticVersion} from '../../../../../src/business/utils/semantic-version.js';

const exec: (command: string, options: unknown) => Promise<{stdout: string; stderr: string} | ExecException> =
  promisify(execCallback);

describe('HelmClient Tests', (): void => {
  const TEST_CHARTS_DIR: string = '/Users/jeffrey/solo-charts/charts/solo-deployment';
  const NONEXISTENT_CHARTS_DIR: string = 'test/unit/core/helm/nonexistent-charts';
  const HAPROXYTECH_REPOSITORY: Repository = new Repository('haproxytech', 'https://haproxytech.github.io/helm-charts');
  const HAPROXY_CHART: Chart = new Chart('haproxy', 'haproxytech');
  const HAPROXY_RELEASE_NAME: string = 'haproxy-release';
  const INCUBATOR_REPOSITORY: Repository = new Repository('incubator', 'https://charts.helm.sh/incubator');
  const JETSTACK_REPOSITORY: Repository = new Repository('jetstack', 'https://charts.jetstack.io');
  const NAMESPACE: string = 'helm-client-test-ns';
  const INSTALL_TIMEOUT: number = 30;

  let helmClient: HelmClient;

  before(async (): Promise<void> => {
    resetForTest();
    const helmDependencyManager: HelmDependencyManager = container.resolve(InjectTokens.HelmDependencyManager);
    const kubectlDependencyManager: KubectlDependencyManager = container.resolve(InjectTokens.KubectlDependencyManager);

    try {
      await helmDependencyManager.install(getTemporaryDirectory());
      await kubectlDependencyManager.install(getTemporaryDirectory());
      console.log(`Creating namespace ${NAMESPACE}...`);
      await exec(`kubectl create namespace ${NAMESPACE}`, {
        env: {...process.env, PATH: `${constants.SOLO_HOME_DIR}/bin${path.delimiter}${process.env.PATH}`},
      });
      console.log(`Namespace ${NAMESPACE} created successfully`);

      // Initialize helm client
      helmClient = await new DefaultHelmClientBuilder()
        .defaultNamespace(NAMESPACE)
        .workingDirectory(process.cwd())
        .build();

      expect(helmClient).to.not.be.null;
    } catch (error) {
      console.error('Error during setup:', error);
      throw error;
    }
  }).timeout(Duration.ofMinutes(3).toMillis());

  after(async (): Promise<void> => {
    try {
      console.log(`Deleting namespace ${NAMESPACE}...`);
      await exec(`kubectl delete namespace ${NAMESPACE}`, {
        env: {...process.env, PATH: `${constants.SOLO_HOME_DIR}/bin${path.delimiter}${process.env.PATH}`},
      });
      console.log(`Namespace ${NAMESPACE} deleted successfully`);
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw the error during cleanup to not mask test failures
    }
  }).timeout(Duration.ofMinutes(2).toMillis());

  const removeRepoIfPresent: (client: HelmClient, repo: Repository) => Promise<void> = async (
    client: HelmClient,
    repo: Repository,
  ): Promise<void> => {
    const repositories: Repository[] = await client.listRepositories();
    if (repositories.some((r): boolean => r.name === repo.name)) {
      await client.removeRepository(repo);
    }
  };

  const addRepoIfMissing: (client: HelmClient, repo: Repository) => Promise<void> = async (
    client: HelmClient,
    repo: Repository,
  ): Promise<void> => {
    const repositories: Repository[] = await client.listRepositories();
    if (!repositories.some((r): boolean => r.name === repo.name)) {
      await client.addRepository(repo);
    }
  };

  it('Version Command Executes Successfully', async (): Promise<void> => {
    const helmVersion: SemanticVersion<string> = await helmClient.version();
    expect(helmVersion).to.not.be.null;
    expect(helmVersion).to.not.equal(SemanticVersion.ZERO);

    expect(helmVersion.major).to.be.greaterThanOrEqual(3);
    expect(helmVersion.minor).to.be.greaterThanOrEqual(12);
    expect(helmVersion.patch).to.not.be.lessThan(0);
  });

  it('Repository List Executes Successfully', async (): Promise<void> => {
    const repositories: Repository[] = await helmClient.listRepositories();
    expect(repositories).to.not.be.null;
  });

  it('Repository Add Executes Successfully', async (): Promise<void> => {
    const originalRepoList: Repository[] = await helmClient.listRepositories();
    const originalRepoListSize: number = originalRepoList.length;
    await removeRepoIfPresent(helmClient, INCUBATOR_REPOSITORY);

    try {
      // Basic add
      await expect(helmClient.addRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;
      let repositories: Repository[] = await helmClient.listRepositories();
      expect(repositories).to.not.be.null.and.to.not.be.empty;
      expect(repositories).to.deep.include(INCUBATOR_REPOSITORY);
      expect(repositories).to.have.lengthOf(originalRepoListSize + 1);

      // Remove again for clean test
      await expect(helmClient.removeRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;

      // Add with forceUpdate = true
      const optionsTrue: AddRepoOptions = new AddRepoOptionsBuilder().forceUpdate(true).build();
      await expect(helmClient.addRepository(INCUBATOR_REPOSITORY, optionsTrue)).to.not.be.rejected;
      repositories = await helmClient.listRepositories();
      expect(repositories).to.deep.include(INCUBATOR_REPOSITORY);

      // Remove again
      await expect(helmClient.removeRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;

      // Add with forceUpdate = false (should be same as default)
      const optionsFalse: AddRepoOptions = new AddRepoOptionsBuilder().forceUpdate(false).build();
      await expect(helmClient.addRepository(INCUBATOR_REPOSITORY, optionsFalse)).to.not.be.rejected;
      repositories = await helmClient.listRepositories();
      expect(repositories).to.deep.include(INCUBATOR_REPOSITORY);
    } finally {
      await expect(helmClient.removeRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;
      const repositories: Repository[] = await helmClient.listRepositories();
      expect(repositories).to.not.be.null;
      expect(repositories).to.have.lengthOf(originalRepoListSize);
    }
  });

  it('Repository Remove Executes With Error', async (): Promise<void> => {
    await removeRepoIfPresent(helmClient, JETSTACK_REPOSITORY);

    const repositories: Repository[] = await helmClient.listRepositories();
    const existingRepoCount: number = repositories.length;
    const expectedMessage: string =
      existingRepoCount === 0
        ? 'Error: no repositories configured'
        : `Error: no repo named "${JETSTACK_REPOSITORY.name}" found`;

    await expect(helmClient.removeRepository(JETSTACK_REPOSITORY))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain(expectedMessage);
  });

  it('Install Chart Executes Successfully', async (): Promise<void> => {
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

    try {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }

      const options: InstallChartOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      const release: Release = await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // Verify the returned release object
      expect(release).to.not.be.null;
      expect(release.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(release.info.description).to.equal('Install complete');
      expect(release.info.status).to.equal('deployed');

      // Verify the release through helm list command using namespace
      const specificNamespaceReleaseItems: ReleaseItem[] = await helmClient.listReleases(false, NAMESPACE);
      expect(specificNamespaceReleaseItems).to.not.be.null.and.to.not.be.empty;
      const specificNamespaceReleaseItem: ReleaseItem = specificNamespaceReleaseItems.find(
        (item): boolean => item.name === HAPROXY_RELEASE_NAME,
      );
      expect(specificNamespaceReleaseItem).to.not.be.null;
      expect(specificNamespaceReleaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(specificNamespaceReleaseItem?.namespace).to.equal(NAMESPACE);
      expect(specificNamespaceReleaseItem?.status).to.equal('deployed');

      // Verify with default client and all namespaces
      const defaultHelmClient: HelmClient = await new DefaultHelmClientBuilder().build();
      const releaseItems: ReleaseItem[] = await defaultHelmClient.listReleases(true);
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem: ReleaseItem = releaseItems.find((item): boolean => item.name === HAPROXY_RELEASE_NAME);
      expect(releaseItem).to.not.be.null;
      expect(releaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(releaseItem?.namespace).to.equal(NAMESPACE);
      expect(releaseItem?.status).to.equal('deployed');
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }
    }
  }).timeout(INSTALL_TIMEOUT * 1000);

  it('List Releases with Kube Context', async (): Promise<void> => {
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

    try {
      // Install a test chart first
      const options: InstallChartOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // List releases with specific kube context
      const k8: K8 = container.resolve<K8Factory>(InjectTokens.K8Factory).default();
      const releaseItems: ReleaseItem[] = await helmClient.listReleases(false, NAMESPACE, k8.contexts().readCurrent());
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem: ReleaseItem = releaseItems.find((item): boolean => item.name === HAPROXY_RELEASE_NAME);
      expect(releaseItem).to.not.be.null;
      expect(releaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(releaseItem?.namespace).to.equal(NAMESPACE);
      expect(releaseItem?.status).to.equal('deployed');
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }
    }
  });

  it('Helm Test subcommand with options', async (): Promise<void> => {
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
    const options: TestChartOptions = TestChartOptionsBuilder.builder()
      .timeout('60s')
      .filter('haproxy')
      .namespace(NAMESPACE)
      .build();

    try {
      const helmOptions: InstallChartOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, helmOptions);
      await helmClient.testChart(HAPROXY_RELEASE_NAME, options);
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }
    }
  });

  const testChartInstallWithCleanup: (options: InstallChartOptions) => Promise<void> = async (
    options: InstallChartOptions,
  ): Promise<void> => {
    try {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }

      const release: Release = await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // Verify the returned release object
      expect(release).to.not.be.null;
      expect(release.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(release.info.description).to.equal('Install complete');
      expect(release.info.status).to.equal('deployed');

      // Verify the release through helm list command using namespace
      const specificNamespaceReleaseItems: ReleaseItem[] = await helmClient.listReleases(false, NAMESPACE);
      expect(specificNamespaceReleaseItems).to.not.be.null.and.to.not.be.empty;
      const specificNamespaceReleaseItem: ReleaseItem = specificNamespaceReleaseItems.find(
        (item): boolean => item.name === HAPROXY_RELEASE_NAME,
      );
      expect(specificNamespaceReleaseItem).to.not.be.null;
      expect(specificNamespaceReleaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(specificNamespaceReleaseItem?.namespace).to.equal(NAMESPACE);
      expect(specificNamespaceReleaseItem?.status).to.equal('deployed');

      // Verify with default client and all namespaces
      const defaultHelmClient: HelmClient = await new DefaultHelmClientBuilder().build();
      const releaseItems: ReleaseItem[] = await defaultHelmClient.listReleases(true);
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem: ReleaseItem = releaseItems.find((item): boolean => item.name === HAPROXY_RELEASE_NAME);
      expect(releaseItem).to.not.be.null;
      expect(releaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(releaseItem?.namespace).to.equal(NAMESPACE);
      expect(releaseItem?.status).to.equal('deployed');
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }
    }
  };

  it('Test Helm upgrade subcommand', async (): Promise<void> => {
    try {
      await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

      // First install the chart
      const helmOptions: InstallChartOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, helmOptions);

      // Then try to upgrade it
      await expect(
        helmClient.upgradeChart(
          HAPROXY_RELEASE_NAME,
          HAPROXY_CHART,
          UpgradeChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        ),
      ).to.not.be.rejected;
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch {
        // Suppress uninstall errors
      }
    }
  });

  // Skipped d in our unit tests due to lack of signed charts in the repo
  it.skip('Test Helm dependency update subcommand', async (): Promise<void> => {
    await expect(helmClient.dependencyUpdate(TEST_CHARTS_DIR)).to.not.be.rejected;
  });

  // Skipped d in our unit tests due to lack of signed charts in the repo
  it.skip('Test Helm dependency build subcommand failure', async (): Promise<void> => {
    await expect(helmClient.dependencyUpdate(NONEXISTENT_CHARTS_DIR))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain('Error: could not find Chart.yaml');
  });

  interface ChartInstallOptionsTestParameters {
    name: string;
    options: InstallChartOptions;
  }

  const getChartInstallOptionsTestParameters: () => ChartInstallOptionsTestParameters[] =
    (): ChartInstallOptionsTestParameters[] => {
      return [
        {
          name: 'Atomic Chart Installation Executes Successfully',
          options: InstallChartOptionsBuilder.builder().atomic(true).createNamespace(true).namespace(NAMESPACE).build(),
        },
        {
          name: 'Install Chart with Combination of Options Executes Successfully',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .dependencyUpdate(true)
            .description('Test install chart with options')
            .enableDNS(true)
            .force(true)
            .skipCrds(true)
            .timeout('3m0s')
            .username('username')
            .password('password')
            .version('1.18.0')
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Dependency Updates',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .dependencyUpdate(true)
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Description',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .namespace(NAMESPACE)
            .description('Test install chart with options')
            .build(),
        },
        {
          name: 'Install Chart with DNS Enabled',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .enableDNS(true)
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Forced Chart Installation',
          options: InstallChartOptionsBuilder.builder().createNamespace(true).force(true).namespace(NAMESPACE).build(),
        },
        {
          name: 'Install Chart with Password',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .password('password')
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart From Repository',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .repo(HAPROXYTECH_REPOSITORY.url)
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart Skipping CRDs',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .skipCrds(true)
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Timeout',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .timeout('60s')
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Username',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .username('username')
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Specific Version',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .version('1.18.0')
            .namespace(NAMESPACE)
            .build(),
        },
        {
          name: 'Install Chart with Wait',
          options: InstallChartOptionsBuilder.builder()
            .createNamespace(true)
            .waitFor(true)
            .namespace(NAMESPACE)
            .build(),
        },
      ];
    };

  describe('Parameterized Chart Installation with Options Executes Successfully', (): void => {
    for (const parameters of getChartInstallOptionsTestParameters()) {
      it(parameters.name, async (): Promise<void> => {
        await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
        await testChartInstallWithCleanup(parameters.options);
      });
    }
  }).timeout(INSTALL_TIMEOUT * 1000);
});
