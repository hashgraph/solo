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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.proxy.request.chart.ChartDependencyUpdateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ChartDependencyUpdateRequestTest {
    @Mock
    HelmExecutionBuilder helmExecutionBuilderMock;

    @Test
    @DisplayName("Verify ChartDependencyUpdateRequest apply")
    void testChartDependencyUpdateRequestApply() {
        final ChartDependencyUpdateRequest request = new ChartDependencyUpdateRequest("mocked");
        assertThat(request).isNotNull();
        assertThat(request.chartName()).isEqualTo("mocked");

        when(helmExecutionBuilderMock.subcommands("dependency", "update")).thenReturn(helmExecutionBuilderMock);
        when(helmExecutionBuilderMock.positional("mocked")).thenReturn(helmExecutionBuilderMock);
        request.apply(helmExecutionBuilderMock);
        verify(helmExecutionBuilderMock, times(1)).subcommands("dependency", "update");
        verify(helmExecutionBuilderMock, times(1)).positional("mocked");
    }
}
