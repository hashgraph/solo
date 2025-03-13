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

package com.hedera.fullstack.helm.client.impl;

import com.hedera.fullstack.base.api.version.SemanticVersion;
import com.hedera.fullstack.helm.client.HelmClient;
import com.hedera.fullstack.helm.client.execution.HelmExecution;
import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.Chart;
import com.hedera.fullstack.helm.client.model.Repository;
import com.hedera.fullstack.helm.client.model.Version;
import com.hedera.fullstack.helm.client.model.chart.Release;
import com.hedera.fullstack.helm.client.model.install.InstallChartOptions;
import com.hedera.fullstack.helm.client.model.release.ReleaseItem;
import com.hedera.fullstack.helm.client.model.test.TestChartOptions;
import com.hedera.fullstack.helm.client.proxy.request.HelmRequest;
import com.hedera.fullstack.helm.client.proxy.request.authentication.KubeAuthentication;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartDependencyUpdateRequest;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartInstallRequest;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartTestRequest;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartUninstallRequest;
import com.hedera.fullstack.helm.client.proxy.request.common.VersionRequest;
import com.hedera.fullstack.helm.client.proxy.request.release.ReleaseListRequest;
import com.hedera.fullstack.helm.client.proxy.request.repository.RepositoryAddRequest;
import com.hedera.fullstack.helm.client.proxy.request.repository.RepositoryListRequest;
import com.hedera.fullstack.helm.client.proxy.request.repository.RepositoryRemoveRequest;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.function.BiFunction;

/**
 * The default implementation of the {@link HelmClient} interface.
 */
public final class DefaultHelmClient implements HelmClient {
    /**
     * The message to use when the namespace is null.
     */
    private static final String MSG_NAMESPACE_NOT_NULL = "namespace must not be null";

    /**
     * The name of the namespace argument.
     */
    private static final String NAMESPACE_ARG_NAME = "namespace";

    /**
     * The path to the Helm executable.
     */
    private final Path helmExecutable;

    /**
     * The authentication configuration to use when executing Helm commands.
     */
    private final KubeAuthentication authentication;

    /**
     * The default namespace to use when executing Helm commands.
     */
    private final String defaultNamespace;

    /**
     * The working directory to use when executing Helm commands.
     */
    private final Path workingDirectory;

    /**
     * Creates a new instance of the {@link DefaultHelmClient} class.
     *
     * @param helmExecutable   the path to the Helm executable.
     * @param authentication   the authentication configuration to use when executing Helm commands.
     * @param defaultNamespace the default namespace to use when executing Helm commands.
     */
    public DefaultHelmClient(
            final Path helmExecutable, final KubeAuthentication authentication, final String defaultNamespace) {
        this(helmExecutable, authentication, defaultNamespace, null);
    }

    /**
     * Creates a new instance of the {@link DefaultHelmClient} class.
     *
     * @param helmExecutable   the path to the Helm executable.
     * @param authentication   the authentication configuration to use when executing Helm commands.
     * @param defaultNamespace the default namespace to use when executing Helm commands.
     * @param workingDirectory the working directory to use when executing Helm commands.
     */
    public DefaultHelmClient(
            final Path helmExecutable,
            final KubeAuthentication authentication,
            final String defaultNamespace,
            final Path workingDirectory) {
        this.helmExecutable = Objects.requireNonNull(helmExecutable, "helmExecutable must not be null");
        this.authentication = Objects.requireNonNull(authentication, "authentication must not be null");
        this.defaultNamespace = defaultNamespace;
        this.workingDirectory = workingDirectory;
    }

    @Override
    public SemanticVersion version() {
        return execute(new VersionRequest(), Version.class).asSemanticVersion();
    }

    @Override
    public List<Repository> listRepositories() {
        return executeAsList(new RepositoryListRequest(), Repository.class);
    }

    @Override
    public void addRepository(final Repository repository) {
        executeInternal(new RepositoryAddRequest(repository), Void.class, (b, c) -> {
            b.call();
            return null;
        });
    }

    @Override
    public void removeRepository(final Repository repository) {
        executeInternal(new RepositoryRemoveRequest(repository), Void.class, (b, c) -> {
            b.call();
            return null;
        });
    }

    @Override
    public Release installChart(final String releaseName, final Chart chart, final InstallChartOptions options) {
        return execute(new ChartInstallRequest(releaseName, chart, options), Release.class);
    }

    @Override
    public void uninstallChart(final String releaseName) {
        executeInternal(new ChartUninstallRequest(releaseName), Void.class, (b, c) -> {
            b.call();
            return null;
        });
    }

    @Override
    public void testChart(final String releaseName, final TestChartOptions options) {
        executeInternal(new ChartTestRequest(releaseName, options), Void.class, (b, c) -> {
            b.call();
            return null;
        });
    }

    @Override
    public List<ReleaseItem> listReleases(boolean allNamespaces) {
        return executeAsList(new ReleaseListRequest(allNamespaces), ReleaseItem.class);
    }

    @Override
    public void dependencyUpdate(final String chartName) {
        executeInternal(new ChartDependencyUpdateRequest(chartName), Void.class, (b, c) -> {
            b.call();
            return null;
        });
    }

    /**
     * Applies the default namespace and authentication configuration to the given builder.
     *
     * @param builder the builder to apply to which the defaults should be applied.
     */
    private void applyBuilderDefaults(final HelmExecutionBuilder builder) {
        if (defaultNamespace != null && !defaultNamespace.isBlank()) {
            builder.argument(NAMESPACE_ARG_NAME, defaultNamespace);
        }

        if (workingDirectory != null) {
            builder.workingDirectory(workingDirectory);
        }

        authentication.apply(builder);
    }

    /**
     * Executes the given request and returns the response as the given class. The request is executed using the default
     * namespace.
     *
     * @param request       the request to execute.
     * @param responseClass the class of the response.
     * @param <T>           the type of the request.
     * @param <R>           the type of the response.
     * @return the response.
     */
    private <T extends HelmRequest, R> R execute(final T request, final Class<R> responseClass) {
        return executeInternal(request, responseClass, HelmExecution::responseAs);
    }

    /**
     * Executes the given request and returns the response as the given class with the specified namespace.
     *
     * @param namespace     the namespace to use.
     * @param request       the request to execute.
     * @param responseClass the class of the response.
     * @param <T>           the type of the request.
     * @param <R>           the type of the response.
     * @return the response.
     */
    private <T extends HelmRequest, R> R execute(
            final String namespace, final T request, final Class<R> responseClass) {
        return executeInternal(namespace, request, responseClass, HelmExecution::responseAs);
    }

    /**
     * Executes the given request and returns the response as a list of the given class. The request is executed using
     * the default namespace.
     *
     * @param request       the request to execute.
     * @param responseClass the class of the response.
     * @param <T>           the type of the request.
     * @param <R>           the type of the response.
     * @return a list of response objects.
     */
    private <T extends HelmRequest, R> List<R> executeAsList(final T request, final Class<R> responseClass) {
        return executeInternal(request, responseClass, HelmExecution::responseAsList);
    }

    /**
     * Executes the given request and returns the response as a list of the given class with the specified namespace.
     *
     * @param namespace     the namespace to use.
     * @param request       the request to execute.
     * @param responseClass the class of the response.
     * @param <T>           the type of the request.
     * @param <R>           the type of the response.
     * @return a list of response objects.
     */
    private <T extends HelmRequest, R> List<R> executeAsList(
            final String namespace, final T request, final Class<R> responseClass) {
        return executeInternal(namespace, request, responseClass, HelmExecution::responseAsList);
    }

    private <T extends HelmRequest, R, V> V executeInternal(
            final T request, final Class<R> responseClass, final BiFunction<HelmExecution, Class<R>, V> responseFn) {
        final HelmExecutionBuilder builder = new HelmExecutionBuilder(helmExecutable);
        applyBuilderDefaults(builder);
        request.apply(builder);
        return responseFn.apply(builder.build(), responseClass);
    }

    private <T extends HelmRequest, R, V> V executeInternal(
            final String namespace,
            final T request,
            final Class<R> responseClass,
            final BiFunction<HelmExecution, Class<R>, V> responseFn) {
        Objects.requireNonNull(namespace, MSG_NAMESPACE_NOT_NULL);

        if (namespace.isBlank()) {
            throw new IllegalArgumentException("namespace must not be blank");
        }

        final HelmExecutionBuilder builder = new HelmExecutionBuilder(helmExecutable);
        applyBuilderDefaults(builder);
        request.apply(builder);
        builder.argument(NAMESPACE_ARG_NAME, namespace);
        return responseFn.apply(builder.build(), responseClass);
    }
}
