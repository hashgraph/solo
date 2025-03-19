// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {SemanticVersion} from '../../../../src/core/helm/base/api/version/SemanticVersion.js';
import {type HelmClient} from '../../../../src/core/helm/HelmClient.js';
import {HelmExecutionException} from '../../../../src/core/helm/HelmExecutionException.js';
import {Chart} from '../../../../src/core/helm/model/Chart.js';
import {Repository} from '../../../../src/core/helm/model/Repository.js';
import {DefaultHelmClientBuilder} from '../../../../src/core/helm/impl/DefaultHelmClientBuilder.js';

describe('HelmClient Tests', () => {
  const CHARTS_DIR = '../../charts';
  const INGRESS_REPOSITORY = new Repository('ingress-nginx', 'https://kubernetes.github.io/ingress-nginx');
  const HAPROXYTECH_REPOSITORY = new Repository('haproxytech', 'https://haproxytech.github.io/helm-charts');
  const HAPROXY_CHART = new Chart('haproxy', 'haproxytech');
  const HAPROXY_RELEASE_NAME = 'haproxy-release';
  const INCUBATOR_REPOSITORY = new Repository('incubator', 'https://charts.helm.sh/incubator');
  const JETSTACK_REPOSITORY = new Repository('jetstack', 'https://charts.jetstack.io');
  const NAMESPACE = 'helm-client-test-ns';
  const INSTALL_TIMEOUT = 30;

  let helmClient: HelmClient;

  before(async () => {
    helmClient = await new DefaultHelmClientBuilder()
      .defaultNamespace(NAMESPACE)
      .workingDirectory(process.cwd())
      .build();
    expect(helmClient).to.not.be.null;
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

    expect(await helmClient.removeRepository(JETSTACK_REPOSITORY))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain(expectedMessage);
  });

  it('Install Chart Executes Successfully', async function () {
    this.timeout(INSTALL_TIMEOUT * 1000);
    await addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

    try {
      try {
        await helmClient.uninstallChart(HAPROXY_RELEASE_NAME);
      } catch (error) {
        // Suppress uninstall errors
      }

      const release = await helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART);

      // Verify the returned release object
      expect(release).to.not.be.null;
      expect(release.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(release.info.description).to.equal('Install complete');
      expect(release.info.status).to.equal('deployed');

      // Verify the release through helm list command using namespace
      const specificNamespaceReleaseItems = await helmClient.listReleases(false);
      expect(specificNamespaceReleaseItems).to.not.be.null.and.to.not.be.empty;
      const specificNamespaceReleaseItem = specificNamespaceReleaseItems.find(
        item => item.name === HAPROXY_RELEASE_NAME,
      );
      expect(specificNamespaceReleaseItem).to.not.be.null;
      expect(specificNamespaceReleaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(specificNamespaceReleaseItem?.namespace).to.equal(NAMESPACE);
      expect(specificNamespaceReleaseItem?.status).to.equal('deployed');

      // Verify with default client and all namespaces
      const defaultHelmClient = await new DefaultHelmClientBuilder().build();
      const releaseItems = await defaultHelmClient.listReleases(true);
      expect(releaseItems).to.not.be.null.and.to.not.be.empty;
      const releaseItem = releaseItems.find(item => item.name === HAPROXY_RELEASE_NAME);
      expect(releaseItem).to.not.be.null;
      expect(releaseItem?.name).to.equal(HAPROXY_RELEASE_NAME);
      expect(releaseItem?.namespace).to.equal(NAMESPACE);
      expect(releaseItem?.status).to.equal('deployed');
    } finally {
      try {
        await helmClient.uninstallChart(HAPROXY_RELEASE_NAME);
      } catch (error) {
        // Suppress uninstall errors
      }
    }
  });

  it('Test Helm dependency update subcommand', async () => {
    await expect(helmClient.dependencyUpdate(CHARTS_DIR)).to.not.be.rejected;
  });

  it('Test Helm dependency build subcommand failure', async () => {
    await expect(helmClient.dependencyUpdate(CHARTS_DIR))
      .to.be.rejectedWith(HelmExecutionException)
      .that.eventually.has.property('message')
      .that.contain('Error: could not find Chart.yaml');
  });
});
