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

package com.hedera.fullstack.helm.client.test.proxy.request.chart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.Chart;
import com.hedera.fullstack.helm.client.model.install.InstallChartOptions;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartInstallRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ChartInstallRequestTest {
    @Mock
    InstallChartOptions installChartOptionsMock;

    @Mock
    Chart chartMock;

    @Mock
    HelmExecutionBuilder helmExecutionBuilderMock;

    @Test
    @DisplayName("Test ChartInstallRequest Chart constructor")
    void testChartInstallRequestChartConstructor() {
        final Chart chart = new Chart("apache", "bitnami/apache");
        final ChartInstallRequest chartInstallRequest = new ChartInstallRequest("apache", chart);
        assertThat(chart).isEqualTo(chartInstallRequest.chart()).isSameAs(chartInstallRequest.chart());
        assertThat(chartInstallRequest.options()).isNotNull().isEqualTo(InstallChartOptions.defaults());
        assertThat(chartInstallRequest.releaseName()).isEqualTo("apache");

        final InstallChartOptions opts =
                InstallChartOptions.builder().timeout("9m0s").atomic(true).build();
        final ChartInstallRequest nonDefaultOptRequest = new ChartInstallRequest("apache", chart, opts);

        assertThat(nonDefaultOptRequest.options())
                .isNotNull()
                .isEqualTo(opts)
                .isNotEqualTo(InstallChartOptions.defaults());
    }

    @Test
    @DisplayName("Test ChartInstallRequest apply with unqualified chart")
    void testChartInstallRequestApplyUnqualifiedChart() {
        final ChartInstallRequest chartInstallRequest =
                new ChartInstallRequest("mocked", chartMock, installChartOptionsMock);
        assertThat(chartInstallRequest).isNotNull();
        assertThat(chartInstallRequest.chart()).isNotNull().isEqualTo(chartMock);
        assertThat(chartInstallRequest.releaseName()).isEqualTo("mocked");
        assertThat(chartInstallRequest.options()).isNotNull().isEqualTo(installChartOptionsMock);

        when(installChartOptionsMock.repo()).thenReturn("mockedRepo");
        when(chartMock.unqualified()).thenReturn("mockedUnqualified");
        when(helmExecutionBuilderMock.positional("mocked")).thenReturn(helmExecutionBuilderMock);
        when(helmExecutionBuilderMock.positional("mockedUnqualified")).thenReturn(helmExecutionBuilderMock);
        chartInstallRequest.apply(helmExecutionBuilderMock);
        verify(helmExecutionBuilderMock, times(1)).subcommands("install");
        verify(installChartOptionsMock, times(1)).apply(helmExecutionBuilderMock);
        verify(installChartOptionsMock, times(2)).repo();
        verify(chartMock, times(1)).unqualified();
        verify(helmExecutionBuilderMock, times(2)).positional(anyString());
    }

    @Test
    @DisplayName("Test ChartInstallRequest apply with qualified chart")
    void testChartInstallRequestApplyQualifiedChart() {
        final ChartInstallRequest chartInstallRequest =
                new ChartInstallRequest("mocked", chartMock, installChartOptionsMock);
        assertThat(chartInstallRequest).isNotNull();
        assertThat(chartInstallRequest.chart()).isNotNull().isEqualTo(chartMock);
        assertThat(chartInstallRequest.releaseName()).isEqualTo("mocked");
        assertThat(chartInstallRequest.options()).isNotNull().isEqualTo(installChartOptionsMock);

        when(installChartOptionsMock.repo()).thenReturn(null);
        when(chartMock.qualified()).thenReturn("mockedQualified");
        when(helmExecutionBuilderMock.positional("mocked")).thenReturn(helmExecutionBuilderMock);
        when(helmExecutionBuilderMock.positional("mockedQualified")).thenReturn(helmExecutionBuilderMock);
        chartInstallRequest.apply(helmExecutionBuilderMock);
        verify(helmExecutionBuilderMock, times(1)).subcommands("install");
        verify(installChartOptionsMock, times(1)).apply(helmExecutionBuilderMock);
        verify(installChartOptionsMock, times(1)).repo();
        verify(chartMock, times(1)).qualified();
        verify(helmExecutionBuilderMock, times(2)).positional(anyString());
    }
}
