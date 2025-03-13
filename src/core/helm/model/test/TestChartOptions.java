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

package com.hedera.fullstack.helm.client.model.test;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.Options;

/**
 * Represents the options to use when testing a chart.
 *
 * @param filter  specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
 *                exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
 * @param timeout Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
 */
public record TestChartOptions(String filter, String timeout) implements Options {
    /**
     * Returns an instance of the TestChartOptionsBuilder.
     *
     * @return the TestChartOptionsBuilder.
     */
    public static TestChartOptionsBuilder builder() {
        return TestChartOptionsBuilder.builder();
    }

    /**
     * Returns an instance of the default TestChartOptions.
     *
     * @return the default TestChartOptions.
     */
    public static TestChartOptions defaults() {
        return builder().build();
    }

    @Override
    public void apply(final HelmExecutionBuilder builder) {
        if (filter() != null) {
            builder.argument("filter", filter());
        }

        if (timeout() != null) {
            builder.argument("timeout", timeout());
        }
    }
}
