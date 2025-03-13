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

package com.hedera.fullstack.helm.client.resource;

import com.hedera.fullstack.base.api.os.Architecture;
import com.hedera.fullstack.base.api.os.OperatingSystem;
import com.hedera.fullstack.base.api.resource.ResourceLoader;
import com.hedera.fullstack.helm.client.HelmConfigurationException;
import java.io.IOException;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Loads the Helm executable contained in the JAR file into a temporary directory.
 */
public final class HelmSoftwareLoader {
    private static final Logger LOGGER = LoggerFactory.getLogger(HelmSoftwareLoader.class);

    /**
     * The root resources folder where the software is located.
     */
    private static final String SOFTWARE_FOLDER_NAME = "software";

    /**
     * The name of the Helm executable.
     */
    private static final String HELM_EXECUTABLE_NAME = "helm";

    /**
     * The path delimiter used in the JAR file.
     */
    private static final String RESOURCE_PATH_DELIMITER = "/";

    /**
     * The {@link ResourceLoader} used to load the Helm executable.
     */
    private static final ResourceLoader<HelmSoftwareLoader> RESOURCE_LOADER =
            new ResourceLoader<>(HelmSoftwareLoader.class);

    /**
     * Private constructor to prevent instantiation of this utility class.
     */
    private HelmSoftwareLoader() {
        // Empty private constructor to prevent instantiation of this utility class.
    }

    /**
     * Unpacks the Helm executable contained in the JAR file into a temporary directory.
     *
     * @return the path to the Helm executable.
     * @throws HelmConfigurationException if the Helm executable cannot be unpacked or the operating system/architecture
     *                                    combination is not supported.
     * @implNote This method expects the executable to be present at the following location in the JAR file:
     * {@code /software/<os>/<arch>/helm}.
     */
    public static Path installSupportedVersion() {
        try {
            final OperatingSystem os = OperatingSystem.current();
            final Architecture arch = Architecture.current();
            final StringBuilder pathBuilder = new StringBuilder();

            pathBuilder
                    .append(SOFTWARE_FOLDER_NAME)
                    .append(RESOURCE_PATH_DELIMITER)
                    .append(os.directoryName())
                    .append(RESOURCE_PATH_DELIMITER)
                    .append(arch.directoryName())
                    .append(RESOURCE_PATH_DELIMITER)
                    .append(HELM_EXECUTABLE_NAME);

            if (os == OperatingSystem.WINDOWS) {
                pathBuilder.append(".exe");
            }

            LOGGER.debug(
                    "Loading Helm executable from JAR file.  [os={}, arch={}, path={}]",
                    os.name(),
                    arch.name(),
                    pathBuilder);

            return RESOURCE_LOADER.load(pathBuilder.toString());
        } catch (IOException | SecurityException | IllegalStateException e) {
            throw new HelmConfigurationException(e);
        }
    }
}
