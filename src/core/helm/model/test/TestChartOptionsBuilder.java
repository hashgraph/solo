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

/**
 * The builder for the {@link TestChartOptions}.
 */
public class TestChartOptionsBuilder {
    private String filter;
    private String timeout;

    /**
     * Returns an instance of the TestChartOptionsBuilder.
     *
     * @return the TestChartOptionsBuilder.
     */
    public static TestChartOptionsBuilder builder() {
        return new TestChartOptionsBuilder();
    }

    /**
     * Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to exclude a
     * test (can specify multiple or separate values with commas: name=test1,name=test2)
     *
     * @param filter Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
     *               exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
     * @return the current TestChartOptionsBuilder.
     */
    public TestChartOptionsBuilder filter(String filter) {
        this.filter = filter;
        return this;
    }

    /**
     * Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
     *
     * @param timeout Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
     *                <p>
     *                return the current TestChartOptionsBuilder.
     */
    public TestChartOptionsBuilder timeout(String timeout) {
        this.timeout = timeout;
        return this;
    }

    /**
     * builds the {@link TestChartOptions} instance.
     *
     * @return the {@link TestChartOptions} instance.
     */
    public TestChartOptions build() {
        return new TestChartOptions(filter, timeout);
    }
}
