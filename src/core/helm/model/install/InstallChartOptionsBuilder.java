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

package com.hedera.fullstack.helm.client.model.install;

import java.util.List;

/**
 * The builder for the {@link InstallChartOptions}.
 */
public final class InstallChartOptionsBuilder {
    private boolean atomic;
    private boolean createNamespace;
    private boolean dependencyUpdate;
    private String description;
    private boolean enableDNS;
    private boolean force;
    private boolean passCredentials;
    private String password;
    private String repo;
    private List<String> set;
    private boolean skipCrds;
    private String timeout;
    private String username;
    private List<String> values;
    private boolean verify;
    private String version;
    private boolean waitFor;

    private InstallChartOptionsBuilder() {}

    /**
     * Returns an instance of the InstallChartOptionsBuilder.
     *
     * @return the InstallChartOptionsBuilder.
     */
    public static InstallChartOptionsBuilder builder() {
        return new InstallChartOptionsBuilder();
    }

    /**
     * if set, the installation process deletes the installation on failure. The --wait flag will be set automatically
     * if --atomic is used.
     *
     * @param atomic if set, the installation process deletes the installation on failure. The --wait flag will be set
     *               automatically if --atomic is used.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder atomic(boolean atomic) {
        this.atomic = atomic;
        return this;
    }

    /**
     * if set, create the release namespace if not present.
     *
     * @param createNamespace if set, create the release namespace if not present.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder createNamespace(boolean createNamespace) {
        this.createNamespace = createNamespace;
        return this;
    }

    /**
     * if set, update dependencies if they are missing before installing the chart.
     *
     * @param dependencyUpdate if set, update dependencies if they are missing before installing the chart.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder dependencyUpdate(boolean dependencyUpdate) {
        this.dependencyUpdate = dependencyUpdate;
        return this;
    }

    /**
     * add a custom description.
     *
     * @param description add a custom description.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder description(String description) {
        this.description = description;
        return this;
    }

    /**
     * enable DNS lookups when rendering templates.
     *
     * @param enableDNS enable DNS lookups when rendering templates.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder enableDNS(boolean enableDNS) {
        this.enableDNS = enableDNS;
        return this;
    }

    /**
     * if set, force resource updates through a replacement strategy.
     *
     * @param force if set, force resource updates through a replacement strategy.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder force(boolean force) {
        this.force = force;
        return this;
    }

    /**
     * pass credentials to all domains.
     *
     * @param passCredentials pass credentials to all domains.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder passCredentials(boolean passCredentials) {
        this.passCredentials = passCredentials;
        return this;
    }

    /**
     * chart repository password where to locate the requested chart.
     *
     * @param password chart repository password where to locate the requested chart.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder password(String password) {
        this.password = password;
        return this;
    }

    /**
     * chart repository url where to locate the requested chart.
     *
     * @param repo chart repository url where to locate the requested chart.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder repo(String repo) {
        this.repo = repo;
        return this;
    }

    /**
     * set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
     *
     * @param valueOverride set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder set(List<String> valueOverride) {
        this.set = valueOverride;
        return this;
    }

    /**
     * if set, no CRDs will be installed. By default, CRDs are installed if not already present.
     *
     * @param skipCrds if set, no CRDs will be installed. By default, CRDs are installed if not already present.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder skipCrds(boolean skipCrds) {
        this.skipCrds = skipCrds;
        return this;
    }

    /**
     * time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
     *
     * @param timeout time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder timeout(String timeout) {
        this.timeout = timeout;
        return this;
    }

    /**
     * chart repository username where to locate the requested chart.
     *
     * @param username chart repository username where to locate the requested chart.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder username(String username) {
        this.username = username;
        return this;
    }

    /**
     * specify values in a YAML file or a URL (can specify multiple).
     *
     * @param values specify values in a YAML file or a URL (can specify multiple).
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder values(List<String> values) {
        this.values = values;
        return this;
    }

    /**
     * verify the package before installing it.
     *
     * @param verify verify the package before installing it.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder verify(boolean verify) {
        this.verify = verify;
        return this;
    }

    /**
     * specify a version constraint for the chart version to use. This constraint can be a specific tag (e.g. 1.1.1) or
     * it may reference a valid range (e.g. ^2.0.0). If this is not specified, the latest version is used.
     *
     * @param version specify a version constraint for the chart version to use. This constraint can be a specific tag
     *                (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not specified, the latest
     *                version is used.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder version(String version) {
        this.version = version;
        return this;
    }

    /**
     * if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a Deployment, StatefulSet, or
     * ReplicaSet are in a ready state before marking the release as successful. It will wait for as long as --timeout.
     *
     * @param waitFor if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a Deployment,
     *                StatefulSet, or ReplicaSet are in a ready state before marking the release as successful. It will
     *                wait for as long as --timeout.
     * @return the current InstallChartOptionsBuilder.
     */
    public InstallChartOptionsBuilder waitFor(boolean waitFor) {
        this.waitFor = waitFor;
        return this;
    }

    /**
     * build the InstallChartOptions.
     * @return the created InstallChartOptions.
     */
    public InstallChartOptions build() {
        return new InstallChartOptions(
                atomic,
                createNamespace,
                dependencyUpdate,
                description,
                enableDNS,
                force,
                passCredentials,
                password,
                repo,
                set,
                skipCrds,
                timeout,
                username,
                values,
                verify,
                version,
                waitFor);
    }
}
