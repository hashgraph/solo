// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {SemanticVersion} from '../../../../../src/integration/helm/base/api/version/semantic-version.js';
import {type HelmClient} from '../../../../../src/integration/helm/helm-client.js';
import {HelmExecutionException} from '../../../../../src/integration/helm/helm-execution-exception.js';
import {Chart} from '../../../../../src/integration/helm/model/chart.js';
import {Repository} from '../../../../../src/integration/helm/model/repository.js';
import {DefaultHelmClientBuilder} from '../../../../../src/integration/helm/impl/default-helm-client-builder.js';
import {type InstallChartOptions} from '../../../../../src/integration/helm/model/install/install-chart-options.js';
import {UpgradeChartOptionsBuilder} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options-builder.js';
import {exec as execCallback} from 'child_process';
import {promisify} from 'util';
import {InstallChartOptionsBuilder} from '../../../../../src/integration/helm/model/install/install-chart-options-builder.js';
import {UnInstallChartOptionsBuilder} from '../../../../../src/integration/helm/model/install/un-install-chart-options-builder.js';
import {TestChartOptionsBuilder} from '../../../../../src/integration/helm/model/test/test-chart-options-builder.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../../src/integration/kube/k8-factory.js';
import {container} from 'tsyringe-neo';
import {type K8} from '../../../../../src/integration/kube/k8.js';

const exec = promisify(execCallback);

describe('HelmClient Tests', () => {
  const TEST_CHARTS_DIR = '/Users/jeffrey/solo-charts/charts/solo-deployment';
  const NONEXISTENT_CHARTS_DIR = 'test/unit/core/helm/nonexistent-charts';
  const HAPROXYTECH_REPOSITORY = new Repository('haproxytech', 'https://haproxytech.github.io/helm-charts');
  const HAPROXY_CHART = new Chart('haproxy', 'haproxytech');
  const HAPROXY_RELEASE_NAME = 'haproxy-release';
  const INCUBATOR_REPOSITORY = new Repository('incubator', 'https://charts.helm.sh/incubator');
  const JETSTACK_REPOSITORY = new Repository('jetstack', 'https://charts.jetstack.io');
  const NAMESPACE = 'helm-client-test-ns';
  const INSTALL_TIMEOUT = 30;

  let helmClient: HelmClient;

  before(async function () {
    this.timeout(120000); // 2 minutes timeout for cluster creation

    try {
      console.log(`Creating namespace ${NAMESPACE}...`);
      await exec(`kubectl create namespace ${NAMESPACE}`);
      console.log(`Namespace ${NAMESPACE} created successfully`);

      // Initialize helm client
      helmClient = new DefaultHelmClientBuilder().defaultNamespace(NAMESPACE).workingDirectory(process.cwd()).build();

      expect(helmClient).to.not.be.null;
    } catch (error) {
      console.error('Error during setup:', error);
      throw error;
    }
  });

  after(async function () {
    this.timeout(60000); // 1 minute timeout for cleanup

    try {
      console.log(`Deleting namespace ${NAMESPACE}...`);
      await exec(`kubectl delete namespace ${NAMESPACE}`);
      console.log(`Namespace ${NAMESPACE} deleted successfully`);
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw the error during cleanup to not mask test failures
    }
  });

  const removeRepoIfPresent = async (client: HelmClient, repo: Repository): Promise<void> => {
    const repositories = await client.listRepositories();
    if (repositories.some(r => r.name === repo.name)) {
      await client.removeRepository(repo);
    }
  };

  const addRepoIfMissing = async (client: HelmClient, repo: Repository): Promise<void> => {
    const repositories = await client.listRepositories();
    if (!repositories.some(r => r.name === repo.name)) {
      await client.addRepository(repo);
    }
  };

  it('Version Command Executes Successfully', async () => {
    const helmVersion = await helmClient.version();
    expect(helmVersion).to.not.be.null;
    expect(helmVersion).to.not.equal(SemanticVersion.ZERO);

    expect(helmVersion.major).to.be.greaterThanOrEqual(3);
    expect(helmVersion.minor).to.be.greaterThanOrEqual(12);
    expect(helmVersion.patch).to.not.be.lessThan(0);
  });

  it('Repository List Executes Successfully', async () => {
    const repositories = await helmClient.listRepositories();
    expect(repositories).to.not.be.null;
  });

  it('Repository Add Executes Successfully', async () => {
    const originalRepoList = await helmClient.listRepositories();
    const originalRepoListSize = originalRepoList.length;
    await removeRepoIfPresent(helmClient, INCUBATOR_REPOSITORY);

    try {
      await expect(helmClient.addRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;
      const repositories = await helmClient.listRepositories();
      expect(repositories).to.not.be.null.and.to.not.be.empty;
      expect(repositories).to.deep.include(INCUBATOR_REPOSITORY);
      expect(repositories).to.have.lengthOf(originalRepoListSize + 1);
    } finally {
      await expect(helmClient.removeRepository(INCUBATOR_REPOSITORY)).to.not.be.rejected;
      const repositories = await helmClient.listRepositories();
      expect(repositories).to.not.be.null;
      expect(repositories).to.have.lengthOf(originalRepoListSize);
    }
  });

  it('Repository Remove Executes With Error', async () => {
    await removeRepoIfPresent(helmClient, JETSTACK_REPOSITORY);

    const existingRepoCount = (await helmClient.listRepositories()).length;
    const expectedMessage =
      existingRepoCount === 0
        ? 'Error: no repositories configured'
        : `Error: no repo named "${JETSTACK_REPOSITORY.name}" found`;

    await expect(helmClient.removeRepository(JETSTACK_REPOSITORY))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain(expectedMessage);
  });

  it('Install Chart Executes Successfully', async function () {
    this.timeout(INSTALL_TIMEOUT * 1000);
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

    try {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch (error) {
        // Suppress uninstall errors
      }

      const options = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      const release = await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // Verify the returned release object
      expect(release).to.not.be.null;
      expect(release.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(release.info.description).to.equal('Install complete');
      expect(release.info.status).to.equal('deployed');

      // Verify the release through helm list command using namespace
      const specificNamespaceReleaseItems = await helmClient.listReleases(false, NAMESPACE);
      expect(specificNamespaceReleaseItems).to.not.be.null.and.to.not.be.empty;
      const specificNamespaceReleaseItem = specificNamespaceReleaseItems.find(
        item => item.name === HAPROXY_RELEASE_NAME,
      );
      expect(specificNamespaceReleaseItem).to.not.be.null;
      expect(specificNamespaceReleaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(specificNamespaceReleaseItem?.namespace).to.equal(NAMESPACE);
      expect(specificNamespaceReleaseItem?.status).to.equal('deployed');

      // Verify with default client and all namespaces
      const defaultHelmClient = new DefaultHelmClientBuilder().build();
      const releaseItems = await defaultHelmClient.listReleases(true);
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem = releaseItems.find(item => item.name === HAPROXY_RELEASE_NAME);
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
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  });

  it('List Releases with Kube Context', async () => {
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

    try {
      // Install a test chart first
      const options = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // List releases with specific kube context
      const k8: K8 = container.resolve<K8Factory>(InjectTokens.K8Factory).default();
      const releaseItems = await helmClient.listReleases(false, NAMESPACE, k8.contexts().readCurrent());
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem = releaseItems.find(item => item.name === HAPROXY_RELEASE_NAME);
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
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  });

  it('Helm Test subcommand with options', async () => {
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
    const options = TestChartOptionsBuilder.builder().timeout('60s').filter('haproxy').namespace(NAMESPACE).build();

    try {
      const helmOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
      await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, helmOptions);
      await helmClient.testChart(HAPROXY_RELEASE_NAME, options);
    } finally {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  });

  const testChartInstallWithCleanup = async (options: InstallChartOptions): Promise<void> => {
    try {
      try {
        await helmClient.uninstallChart(
          HAPROXY_RELEASE_NAME,
          UnInstallChartOptionsBuilder.builder().namespace(NAMESPACE).build(),
        );
      } catch (error) {
        // Suppress uninstall errors
      }

      const release = await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);

      // Verify the returned release object
      expect(release).to.not.be.null;
      expect(release.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(release.info.description).to.equal('Install complete');
      expect(release.info.status).to.equal('deployed');

      // Verify the release through helm list command using namespace
      const specificNamespaceReleaseItems = await helmClient.listReleases(false, NAMESPACE);
      expect(specificNamespaceReleaseItems).to.not.be.null.and.to.not.be.empty;
      const specificNamespaceReleaseItem = specificNamespaceReleaseItems.find(
        item => item.name === HAPROXY_RELEASE_NAME,
      );
      expect(specificNamespaceReleaseItem).to.not.be.null;
      expect(specificNamespaceReleaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(specificNamespaceReleaseItem?.namespace).to.equal(NAMESPACE);
      expect(specificNamespaceReleaseItem?.status).to.equal('deployed');

      // Verify with default client and all namespaces
      const defaultHelmClient = new DefaultHelmClientBuilder().build();
      const releaseItems = await defaultHelmClient.listReleases(true);
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem = releaseItems.find(item => item.name === HAPROXY_RELEASE_NAME);
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
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  };

  it('Test Helm upgrade subcommand', async () => {
    try {
      await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

      // First install the chart
      const helmOptions = InstallChartOptionsBuilder.builder().namespace(NAMESPACE).build();
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
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  });

  // Skipped d in our unit tests due to lack of signed charts in the repo
  it.skip('Test Helm dependency update subcommand', async () => {
    await expect(helmClient.dependencyUpdate(TEST_CHARTS_DIR)).to.not.be.rejected;
  });

  // Skipped d in our unit tests due to lack of signed charts in the repo
  it.skip('Test Helm dependency build subcommand failure', async () => {
    await expect(helmClient.dependencyUpdate(NONEXISTENT_CHARTS_DIR))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain('Error: could not find Chart.yaml');
  });

  interface ChartInstallOptionsTestParameters {
    name: string;
    options: InstallChartOptions;
  }

  const getChartInstallOptionsTestParameters = (): ChartInstallOptionsTestParameters[] => {
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
        options: InstallChartOptionsBuilder.builder().createNamespace(true).skipCrds(true).namespace(NAMESPACE).build(),
      },
      {
        name: 'Install Chart with Timeout',
        options: InstallChartOptionsBuilder.builder().createNamespace(true).timeout('60s').namespace(NAMESPACE).build(),
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
        options: InstallChartOptionsBuilder.builder().createNamespace(true).waitFor(true).namespace(NAMESPACE).build(),
      },
    ];
  };

  describe('Parameterized Chart Installation with Options Executes Successfully', function () {
    this.timeout(INSTALL_TIMEOUT * 1000);

    for (const parameters of getChartInstallOptionsTestParameters()) {
      it(parameters.name, async () => {
        await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
        await testChartInstallWithCleanup(parameters.options);
      });
    }
  });
});
