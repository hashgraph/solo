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

package com.hedera.fullstack.helm.client.proxy.request.chart;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.Chart;
import com.hedera.fullstack.helm.client.model.install.InstallChartOptions;
import com.hedera.fullstack.helm.client.proxy.request.HelmRequest;
import java.util.Objects;

/**
 * Represents a helm install request.
 *
 * @param chart   The chart to install.
 * @param options The options to use when installing the chart.
 */
public record ChartInstallRequest(String releaseName, Chart chart, InstallChartOptions options) implements HelmRequest {

    public ChartInstallRequest {
        Objects.requireNonNull(releaseName, "releaseName must not be null");
        Objects.requireNonNull(chart, "chart must not be null");
        Objects.requireNonNull(options, "options must not be null");

        if (releaseName.isBlank()) {
            throw new IllegalArgumentException("releaseName must not be blank");
        }
    }

    /**
     * Creates a new install request with the given chart and default options.
     *
     * @param releaseName The name of the release.
     * @param chart       The chart to install.
     */
    public ChartInstallRequest(String releaseName, Chart chart) {
        this(releaseName, chart, InstallChartOptions.defaults());
    }

    @Override
    public void apply(final HelmExecutionBuilder builder) {
        builder.subcommands("install");
        if (options != null) {
            options.apply(builder);
        }

        final String chartName;

        if (options != null && options.repo() != null && !options.repo().isBlank()) {
            chartName = chart.unqualified();
        } else {
            chartName = chart.qualified();
        }

        builder.positional(releaseName).positional(chartName);
    }
}
