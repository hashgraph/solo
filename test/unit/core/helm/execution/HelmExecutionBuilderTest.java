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

package com.hedera.fullstack.helm.client.test.execution;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.hedera.fullstack.helm.client.execution.HelmExecutionBuilder;
import java.io.File;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HelmExecutionBuilderTest {
    @Test
    @DisplayName("Test optionsWithMultipleValues null checks")
    void testOptionsWithMultipleValuesNullChecks() {
        HelmExecutionBuilder builder = new HelmExecutionBuilder(new File(".").toPath());
        assertThrows(NullPointerException.class, () -> {
            builder.optionsWithMultipleValues(null, null);
        });
        assertThrows(NullPointerException.class, () -> {
            builder.optionsWithMultipleValues("test string", null);
        });
    }

    @Test
    @DisplayName("Test environmentVariable null checks")
    void testEnvironmentVariableNullChecks() {
        HelmExecutionBuilder builder = new HelmExecutionBuilder(new File(".").toPath());
        assertThrows(NullPointerException.class, () -> {
            builder.environmentVariable(null, null);
        });
        assertThrows(NullPointerException.class, () -> {
            builder.environmentVariable("test string", null);
        });
    }

    @Test
    @DisplayName("Test workingDirectory null checks")
    void testWorkingDirectoryNullChecks() {
        HelmExecutionBuilder builder = new HelmExecutionBuilder(new File(".").toPath());
        assertThrows(NullPointerException.class, () -> {
            builder.workingDirectory(null);
        });
    }
}
