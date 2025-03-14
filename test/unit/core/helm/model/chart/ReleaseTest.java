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

package com.hedera.fullstack.helm.client.test.model.chart;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hedera.fullstack.helm.client.model.chart.Release;
import java.io.IOException;
import java.io.InputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReleaseTest {
    @Test
    @DisplayName("Test Deserializing JSON Release Response")
    void testDeserializingJson() throws IOException {
        ClassLoader classLoader = this.getClass().getClassLoader();
        InputStream inputStream = classLoader.getResourceAsStream("mysql-release.json");
        Release release = new ObjectMapper().readValue(inputStream, Release.class);
        assertThat(release.name()).isEqualTo("mysql");
        assertThat(release.info().firstDeployed()).isEqualTo("2023-06-09T11:53:14.120656-05:00");
        assertThat(release.info().lastDeployed()).isEqualTo("2023-06-09T11:53:14.120656-05:00");
        assertThat(release.info().deleted()).isEmpty();
        assertThat(release.info().description()).isEqualTo("Install complete");
        assertThat(release.info().status()).isEqualTo("deployed");
        assertThat(release.chart().metadata().version()).isEqualTo("9.10.2");
        assertThat(release.chart().metadata().appVersion()).isEqualTo("8.0.33");
    }
}
