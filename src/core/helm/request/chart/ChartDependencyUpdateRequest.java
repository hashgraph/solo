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
import com.hedera.fullstack.helm.client.proxy.request.HelmRequest;
import java.util.Objects;

/**
 * A request to do a dependency update on a chart.
 *
 * @param chartName the name of the chart to update.
 */
public record ChartDependencyUpdateRequest(String chartName) implements HelmRequest {
    public ChartDependencyUpdateRequest {
        Objects.requireNonNull(chartName, "chartName must not be null");
        if (chartName.isBlank()) {
            throw new IllegalArgumentException("chartName must not be blank");
        }
    }

    @Override
    public void apply(HelmExecutionBuilder builder) {
        builder.subcommands("dependency", "update");
        builder.positional(chartName);
    }
}
