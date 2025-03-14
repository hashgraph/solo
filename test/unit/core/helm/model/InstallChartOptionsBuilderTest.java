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

package com.hedera.fullstack.helm.client.test.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import com.hedera.fullstack.helm.client.model.install.InstallChartOptions;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class InstallChartOptionsBuilderTest {
    @Mock
    private HelmExecutionBuilder builderMock;

    @Test
    @DisplayName("Test InstallChartOptionsBuilder")
    void testInstallChartOptionsBuilder() {
        InstallChartOptions options = InstallChartOptions.builder()
                .atomic(true)
                .createNamespace(true)
                .dependencyUpdate(true)
                .description("description")
                .enableDNS(true)
                .force(true)
                .passCredentials(true)
                .password("password")
                .repo("repo")
                .set(List.of("set", "livenessProbe.exec.command=[cat,docroot/CHANGELOG.txt]"))
                .skipCrds(true)
                .timeout("timeout")
                .username("username")
                .values(List.of("values1", "values2"))
                .verify(true)
                .version("version")
                .waitFor(true)
                .build();
        assertNotNull(options);
        assertTrue(options.atomic());
        assertTrue(options.createNamespace());
        assertTrue(options.dependencyUpdate());
        assertEquals("description", options.description());
        assertTrue(options.enableDNS());
        assertTrue(options.force());
        assertTrue(options.passCredentials());
        assertEquals("password", options.password());
        assertEquals("repo", options.repo());
        assertTrue(options.set().stream().anyMatch("livenessProbe.exec.command=[cat,docroot/CHANGELOG.txt]"::equals));
        assertTrue(options.set().stream().anyMatch("set"::equals));
        assertTrue(options.skipCrds());
        assertEquals("timeout", options.timeout());
        assertEquals("username", options.username());
        assertTrue(options.values().stream().anyMatch("values1"::equals));
        assertTrue(options.values().stream().anyMatch("values2"::equals));
        assertTrue(options.verify());
        assertEquals("version", options.version());
        assertTrue(options.waitFor());

        options.apply(builderMock);

        verify(builderMock, times(2)).optionsWithMultipleValues(anyString(), anyList());
    }
}
