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

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.Options;
import java.util.List;

/**
 * The options to be supplied to the helm install command.
 *
 * @param atomic           - if set, the installation process deletes the installation on failure. The --wait flag will
 *                         be set automatically if --atomic is used.
 * @param createNamespace  - create the release namespace if not present.
 * @param dependencyUpdate - update dependencies if they are missing before installing the chart.
 * @param description      - add a custom description.
 * @param enableDNS        - enable DNS lookups when rendering templates.
 * @param force            - force resource updates through a replacement strategy.
 * @param passCredentials  - pass credentials to all domains.
 * @param password         - chart repository password where to locate the requested chart.
 * @param repo             - chart repository url where to locate the requested chart.
 * @param set              - set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)
 * @param skipCrds         - if set, no CRDs will be installed. By default, CRDs are installed if not already present.
 * @param timeout          - time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
 * @param username         - chart repository username where to locate the requested chart.
 * @param values           - specify values in a YAML file or a URL (can specify multiple).
 * @param verify           - verify the package before installing it.
 * @param version          - specify a version constraint for the chart version to use. This constraint can be a
 *                         specific tag (e.g. 1.1.1) or it may reference a valid range (e.g. ^2.0.0). If this is not
 *                         specified, the latest version is used.
 * @param waitFor          - if set, will wait until all Pods, PVCs, Services, and minimum number of Pods of a
 *                         Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as
 *                         successful. It will wait for as long as --timeout.
 */
public record InstallChartOptions(
        boolean atomic,
        boolean createNamespace,
        boolean dependencyUpdate,
        String description,
        boolean enableDNS,
        boolean force,
        boolean passCredentials,
        String password,
        String repo,
        List<String> set,
        boolean skipCrds,
        String timeout,
        String username,
        List<String> values,
        boolean verify,
        String version,
        boolean waitFor)
        implements Options {
    /**
     * Returns an instance of the InstallChartOptionsBuilder.
     *
     * @return the InstallChartOptionsBuilder.
     */
    public static InstallChartOptionsBuilder builder() {
        return InstallChartOptionsBuilder.builder();
    }

    /**
     * Returns an instance of the default InstallChartOptions.
     *
     * @return the default InstallChartOptions.
     */
    public static InstallChartOptions defaults() {
        return builder().build();
    }

    @Override
    public void apply(final HelmExecutionBuilder builder) {
        applyFlags(builder);

        builder.argument("output", "json");

        if (password() != null) {
            builder.argument("password", password());
        }

        if (repo() != null) {
            builder.argument("repo", repo());
        }

        if (set() != null) {
            builder.optionsWithMultipleValues("set", set());
        }

        if (timeout() != null) {
            builder.argument("timeout", timeout());
        }

        if (username() != null) {
            builder.argument("username", username());
        }

        if (values() != null) {
            builder.optionsWithMultipleValues("values", values());
        }

        if (version() != null) {
            builder.argument("version", version());
        }
    }

    private void applyFlags(final HelmExecutionBuilder builder) {
        if (atomic()) {
            builder.flag("--atomic");
        }

        if (createNamespace()) {
            builder.flag("--create-namespace");
        }

        if (dependencyUpdate()) {
            builder.flag("--dependency-update");
        }

        if (enableDNS()) {
            builder.flag("--enable-dns");
        }

        if (force()) {
            builder.flag("--force");
        }

        if (passCredentials()) {
            builder.flag("--pass-credentials");
        }

        if (skipCrds()) {
            builder.flag("--skip-crds");
        }

        if (verify()) {
            builder.flag("--verify");
        }

        if (waitFor()) {
            builder.flag("--wait");
        }
    }
}
