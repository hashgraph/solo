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

package com.hedera.fullstack.helm.client.test.software;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;

import com.hedera.fullstack.base.api.resource.ResourceLoader;
import com.hedera.fullstack.base.api.version.SemanticVersion;
import com.hedera.fullstack.helm.client.resource.HelmSoftwareLoader;
import com.jcovalent.junit.logging.JCovalentLoggingSupport;
import com.jcovalent.junit.logging.LogEntryBuilder;
import com.jcovalent.junit.logging.LoggingOutput;
import com.jcovalent.junit.logging.assertj.LoggingOutputAssert;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.slf4j.event.Level;

@DisplayName("Helm Software Loader Test")
@Execution(ExecutionMode.CONCURRENT)
@JCovalentLoggingSupport
class HelmSoftwareLoaderTest {
    @Test
    @DisplayName("Linux: Install Supported Helm Version")
    @EnabledOnOs(
            value = {OS.LINUX},
            architectures = {"x86_64", "amd64", "arm", "arm64", "aarch64"})
    void testInstallSupportedVersion_Linux() {
        installHelmAndVerify(OS.LINUX);
    }

    @Test
    @DisplayName("Darwin: Install Supported Helm Version")
    @EnabledOnOs(
            value = {OS.MAC},
            architectures = {"x86_64", "amd64", "arm64", "aarch64"})
    void testInstallSupportedVersion_Darwin(LoggingOutput loggingOutput) {
        installHelmAndVerify(OS.MAC);
        LoggingOutputAssert.assertThat(loggingOutput)
                .hasAtLeastOneEntry(List.of(LogEntryBuilder.builder()
                        .level(Level.DEBUG)
                        .message("Loading Helm executable from JAR file")
                        .build()));
    }

    @Test
    @DisplayName("Windows: Install Supported Helm Version")
    @EnabledOnOs(
            value = {OS.WINDOWS},
            architectures = {"x86_64", "amd64"})
    void testInstallSupportedVersion_Windows() {
        installHelmAndVerify(OS.WINDOWS);
    }

    private void installHelmAndVerify(final OS os) {
        final Path helmPath = HelmSoftwareLoader.installSupportedVersion();
        assertThat(helmPath).isNotNull();
        assertThat(helmPath).exists();
        assertThat(helmPath).isRegularFile();
        assertThat(helmPath).isExecutable();

        if (os == OS.WINDOWS) {
            assertThat(helmPath).hasFileName("helm.exe");
        } else {
            assertThat(helmPath).hasFileName("helm");
        }

        checkHelmVersion(helmPath, os);
    }

    private void checkHelmVersion(final Path helmExecutable, final OS os) {
        final SemanticVersion expectedVersion = expectedHelmVersion();

        assertThat(expectedVersion).isNotNull();

        Process helm;
        try {
            helm = new ProcessBuilder()
                    .command(helmExecutable.toString(), "version", "--short")
                    .redirectOutput(ProcessBuilder.Redirect.PIPE)
                    .redirectError(ProcessBuilder.Redirect.PIPE)
                    .start();
        } catch (IOException e) {
            helm = null;
            Assertions.fail(e);
        }

        assertThatNoException().isThrownBy(helm::waitFor);
        assertThat(helm).isNotNull();
        assertThat(helm.exitValue()).isZero();

        String helmVersion = toString(helm.getInputStream());
        assertThat(helmVersion).isNotNull().isNotBlank();

        if (helmVersion.toLowerCase().charAt(0) == 'v') {
            helmVersion = helmVersion.substring(1);
        }

        final SemanticVersion actualVersion = SemanticVersion.parse(helmVersion);
        assertThat(actualVersion).isNotNull();
        assertThat(actualVersion.withClearedBuild()).isEqualTo(expectedVersion.withClearedBuild());
    }

    private SemanticVersion expectedHelmVersion() {
        try {
            final ResourceLoader<HelmSoftwareLoader> resourceLoader = new ResourceLoader<>(HelmSoftwareLoader.class);
            final Path versionFile = resourceLoader.load("software/HELM_VERSION");

            assertThat(versionFile).isNotNull().exists().isRegularFile();
            final String version = Files.readString(versionFile);
            assertThat(version).isNotBlank();
            return SemanticVersion.parse(version);
        } catch (IOException ignored) {
            return null;
        }
    }

    private String toString(final InputStream stream) {
        try (final BufferedInputStream bis = new BufferedInputStream(stream)) {
            return new String(bis.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }
}
