/*
 * Copyright (C) 2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.hedera.fullstack.helm.client.test;

import static com.hedera.fullstack.base.api.util.ExceptionUtils.suppressExceptions;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Named.named;

import com.hedera.fullstack.base.api.version.SemanticVersion;
import com.hedera.fullstack.helm.client.HelmClient;
import com.hedera.fullstack.helm.client.HelmExecutionException;
import com.hedera.fullstack.helm.client.model.Chart;
import com.hedera.fullstack.helm.client.model.Repository;
import com.hedera.fullstack.helm.client.model.chart.Release;
import com.hedera.fullstack.helm.client.model.install.InstallChartOptions;
import com.hedera.fullstack.helm.client.model.release.ReleaseItem;
import com.hedera.fullstack.helm.client.model.test.TestChartOptions;
import com.jcovalent.junit.logging.JCovalentLoggingSupport;
import com.jcovalent.junit.logging.LogEntry;
import com.jcovalent.junit.logging.LogEntryBuilder;
import com.jcovalent.junit.logging.LoggingOutput;
import com.jcovalent.junit.logging.assertj.LoggingOutputAssert;
import java.io.File;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.event.Level;

@DisplayName("Helm Client Tests")
@JCovalentLoggingSupport
class HelmClientTest {
    private static final String CHARTS_DIR = "../../charts";

    /**
     * The repository for the ingress-nginx helm chart.
     */
    private static final Repository INGRESS_REPOSITORY =
            new Repository("ingress-nginx", "https://kubernetes.github.io/ingress-nginx");

    private static final Repository HAPROXYTECH_REPOSITORY =
            new Repository("haproxytech", "https://haproxytech.github.io/helm-charts");
    private static final Chart HAPROXY_CHART = new Chart("haproxy", "haproxytech");

    private static final String HAPROXY_RELEASE_NAME = "haproxy-release";

    private static final Repository INCUBATOR_REPOSITORY =
            new Repository("incubator", "https://charts.helm.sh/incubator");

    private static final Repository JETSTACK_REPOSITORY = new Repository("jetstack", "https://charts.jetstack.io");

    private static final String NAMESPACE = "helm-client-test-ns";
    private static HelmClient helmClient;
    private static final int INSTALL_TIMEOUT = 30;

    private static final List<LogEntry> EXPECTED_LOG_ENTRIES = List.of(
            LogEntryBuilder.builder()
                    .level(Level.DEBUG)
                    .message("Call exiting with exitCode: 0")
                    .build(),
            LogEntryBuilder.builder()
                    .level(Level.DEBUG)
                    .message("ResponseAsList exiting with exitCode: 0")
                    .build(),
            LogEntryBuilder.builder()
                    .level(Level.DEBUG)
                    .message("Install complete")
                    .build(),
            LogEntryBuilder.builder()
                    .level(Level.DEBUG)
                    .message("ResponseAs exiting with exitCode: 0")
                    .build(),
            LogEntryBuilder.builder()
                    .level(Level.DEBUG)
                    .message("Helm command: repo list")
                    .build());

    private record ChartInstallOptionsTestParameters(InstallChartOptions options, List<LogEntry> expectedLogEntries) {}

    @BeforeAll
    static void beforeAll() {
        helmClient = HelmClient.builder()
                .defaultNamespace(NAMESPACE)
                .workingDirectory(new File(".").toPath())
                .build();
        assertThat(helmClient).isNotNull();
    }

    void removeRepoIfPresent(HelmClient client, Repository repo) {
        final List<Repository> repositories = client.listRepositories();
        if (repositories.contains(repo)) {
            client.removeRepository(repo);
        }
    }

    void addRepoIfMissing(HelmClient client, Repository repo) {
        final List<Repository> repositories = client.listRepositories();
        if (!repositories.contains(repo)) {
            client.addRepository(repo);
        }
    }

    @Test
    @DisplayName("Version Command Executes Successfully")
    void testVersionCommand() {
        final SemanticVersion helmVersion = helmClient.version();
        assertThat(helmVersion).isNotNull().isNotEqualTo(SemanticVersion.ZERO);

        assertThat(helmVersion.major()).isGreaterThanOrEqualTo(3);
        assertThat(helmVersion.minor()).isGreaterThanOrEqualTo(12);
        assertThat(helmVersion.patch()).isNotNegative();
    }

    @Test
    @DisplayName("Repository List Executes Successfully")
    void testRepositoryListCommand() {
        final List<Repository> repositories = helmClient.listRepositories();
        assertThat(repositories).isNotNull();
    }

    @Test
    @DisplayName("Repository Add Executes Successfully")
    void testRepositoryAddCommand() {
        final int originalRepoListSize = helmClient.listRepositories().size();
        removeRepoIfPresent(helmClient, INCUBATOR_REPOSITORY);

        try {
            assertThatNoException().isThrownBy(() -> helmClient.addRepository(INCUBATOR_REPOSITORY));
            final List<Repository> repositories = helmClient.listRepositories();
            assertThat(repositories)
                    .isNotNull()
                    .isNotEmpty()
                    .contains(INCUBATOR_REPOSITORY)
                    .hasSize(originalRepoListSize + 1);
        } finally {
            assertThatNoException().isThrownBy(() -> helmClient.removeRepository(INCUBATOR_REPOSITORY));
            final List<Repository> repositories = helmClient.listRepositories();
            assertThat(repositories).isNotNull().hasSize(originalRepoListSize);
        }
    }

    @Test
    @DisplayName("Repository Remove Executes With Error")
    void testRepositoryRemoveCommand_WithError(final LoggingOutput loggingOutput) {
        removeRepoIfPresent(helmClient, JETSTACK_REPOSITORY);

        int existingRepoCount = helmClient.listRepositories().size();
        final String expectedMessage;

        if (existingRepoCount == 0) {
            expectedMessage = "Error: no repositories configured";
        } else {
            expectedMessage = String.format("Error: no repo named \"%s\" found", JETSTACK_REPOSITORY.name());
        }

        assertThatException()
                .isThrownBy(() -> helmClient.removeRepository(JETSTACK_REPOSITORY))
                .withStackTraceContaining(expectedMessage);
        LoggingOutputAssert.assertThat(loggingOutput)
                .hasAtLeastOneEntry(List.of(
                        LogEntryBuilder.builder()
                                .level(Level.WARN)
                                .message("Call failed with exitCode: 1")
                                .build(),
                        LogEntryBuilder.builder()
                                .level(Level.WARN)
                                .message(expectedMessage)
                                .build()));
    }

    @Test
    @DisplayName("Install Chart Executes Successfully")
    @Timeout(INSTALL_TIMEOUT)
    void testInstallChartCommand(final LoggingOutput loggingOutput) {
        addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

        try {
            suppressExceptions(() -> helmClient.uninstallChart(HAPROXY_RELEASE_NAME));
            final Release release = helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART);

            // verify the returned release object
            assertThat(release).isNotNull();
            assertThat(release.name()).isEqualTo(HAPROXY_RELEASE_NAME);
            assertThat(release.info().description()).isEqualTo("Install complete");
            assertThat(release.info().status()).isEqualTo("deployed");

            // verify the release through the helm list command using the namespace of the helm client
            final List<ReleaseItem> specificNamespaceReleaseItems = helmClient.listReleases(false);
            assertThat(specificNamespaceReleaseItems).isNotNull().isNotEmpty();
            final ReleaseItem specificNamespaceReleaseItem = specificNamespaceReleaseItems.stream()
                    .filter(item -> item.name().equals(HAPROXY_RELEASE_NAME))
                    .findFirst()
                    .orElse(null);
            assertThat(specificNamespaceReleaseItem).isNotNull();
            assertThat(specificNamespaceReleaseItem.name()).isEqualTo(HAPROXY_RELEASE_NAME);
            assertThat(specificNamespaceReleaseItem.namespace()).isEqualTo(NAMESPACE);
            assertThat(specificNamespaceReleaseItem.status()).isEqualTo("deployed");
            HelmClient defaultHelmClient = HelmClient.defaultClient();

            // verify the release through the helm list command using the default namespace specifying --all-namespaces
            final List<ReleaseItem> releaseItems = defaultHelmClient.listReleases(true);
            assertThat(releaseItems).isNotNull().isNotEmpty();
            final ReleaseItem releaseItem = releaseItems.stream()
                    .filter(item -> item.name().equals(HAPROXY_RELEASE_NAME))
                    .findFirst()
                    .orElse(null);
            assertThat(releaseItem).isNotNull();
            assertThat(releaseItem.name()).isEqualTo(HAPROXY_RELEASE_NAME);
            assertThat(releaseItem.namespace()).isEqualTo(NAMESPACE);
            assertThat(releaseItem.status()).isEqualTo("deployed");
        } finally {
            suppressExceptions(() -> helmClient.uninstallChart(HAPROXY_RELEASE_NAME));
        }
        LoggingOutputAssert.assertThat(loggingOutput).hasAtLeastOneEntry(EXPECTED_LOG_ENTRIES);
    }

    private static void testChartInstallWithCleanup(
            InstallChartOptions options, List<LogEntry> expectedLogEntries, final LoggingOutput loggingOutput) {
        try {
            suppressExceptions(() -> helmClient.uninstallChart(HAPROXY_RELEASE_NAME));
            Release release = helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART, options);
            assertThat(release).isNotNull();
            assertThat(release.name()).isEqualTo(HAPROXY_RELEASE_NAME);
            assertThat(release.info().description()).isEqualTo("Install complete");
            assertThat(release.info().status()).isEqualTo("deployed");
        } finally {
            suppressExceptions(() -> helmClient.uninstallChart(HAPROXY_RELEASE_NAME));
        }
        LoggingOutputAssert.assertThat(loggingOutput).hasAtLeastOneEntry(expectedLogEntries);
    }

    @ParameterizedTest
    @Timeout(INSTALL_TIMEOUT)
    @MethodSource
    @DisplayName("Parameterized Chart Installation with Options Executes Successfully")
    void testChartInstallOptions(ChartInstallOptionsTestParameters parameters, final LoggingOutput loggingOutput) {
        addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
        testChartInstallWithCleanup(parameters.options(), parameters.expectedLogEntries(), loggingOutput);
    }

    static Stream<Named<ChartInstallOptionsTestParameters>> testChartInstallOptions() {
        return Stream.of(
                named(
                        "Atomic Chart Installation Executes Successfully",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .atomic(true)
                                        .createNamespace(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Combination of Options Executes Successfully",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .dependencyUpdate(true)
                                        .description("Test install chart with options")
                                        .enableDNS(true)
                                        .force(true)
                                        .skipCrds(true)
                                        .timeout("3m0s")
                                        .username("username")
                                        .password("password")
                                        .version("1.18.0")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Dependency Updates",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .dependencyUpdate(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Description",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .description("Test install chart with options")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with DNS Enabled",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .enableDNS(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Forced Chart Installation",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .force(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Password",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .password("password")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart From Repository",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .repo(HAPROXYTECH_REPOSITORY.url())
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart Skipping CRDs",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .skipCrds(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Timeout",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .timeout("60s")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Username",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .username("username")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Specific Version",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .version("1.18.0")
                                        .build(),
                                EXPECTED_LOG_ENTRIES)),
                named(
                        "Install Chart with Wait",
                        new ChartInstallOptionsTestParameters(
                                InstallChartOptions.builder()
                                        .createNamespace(true)
                                        .waitFor(true)
                                        .build(),
                                EXPECTED_LOG_ENTRIES)));
    }

    @Test
    @DisplayName("Install Chart with Provenance Validation")
    @Disabled("Provenance validation is not supported in our unit tests due to lack of signed charts.")
    void testInstallChartWithProvenanceValidation(final LoggingOutput loggingOutput) {
        addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);

        final InstallChartOptions options =
                InstallChartOptions.builder().createNamespace(true).verify(true).build();

        testChartInstallWithCleanup(options, EXPECTED_LOG_ENTRIES, loggingOutput);
    }

    @Test
    @DisplayName("Helm Test subcommand with options")
    void testTestChartWithOptions() {
        addRepoIfMissing(helmClient, HAPROXYTECH_REPOSITORY);
        final TestChartOptions options =
                TestChartOptions.builder().timeout("60s").filter("haproxy").build();
        suppressExceptions(() -> helmClient.installChart(HAPROXY_RELEASE_NAME, HAPROXY_CHART));
        try {
            helmClient.testChart(HAPROXY_RELEASE_NAME, options);
        } finally {
            suppressExceptions(() -> helmClient.uninstallChart(HAPROXY_RELEASE_NAME));
        }
    }

    @Test
    @DisplayName("Test Helm dependency update subcommand")
    void testHelmDependencyUpdate() {
        helmClient.dependencyUpdate(CHARTS_DIR + "/fullstack-deployment");
    }

    @Test
    @DisplayName("Test Helm dependency build subcommand failure")
    void testHelmDependencyBuildFailure() {
        HelmExecutionException exception = assertThrows(
                HelmExecutionException.class, () -> helmClient.dependencyUpdate(CHARTS_DIR + "/not-a-chart"));
        assertThat(exception.getMessage()).contains("Execution of the Helm command failed with exit code: 1");
        assertThat(exception.getStdOut())
                .contains("Error: could not find " + CHARTS_DIR + "/not-a-chart: stat " + CHARTS_DIR
                        + "/not-a-chart: no such file or directory");
    }
}
