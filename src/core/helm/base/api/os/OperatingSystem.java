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

package com.hedera.fullstack.base.api.os;

public enum OperatingSystem {
    WINDOWS("windows"),
    LINUX("linux"),
    DARWIN("darwin");

    private final String directoryName;

    OperatingSystem(final String directoryName) {
        this.directoryName = directoryName;
    }

    public String directoryName() {
        return directoryName;
    }

    /**
     * Attempts to determine the current operating system based on the system property "os.name".
     *
     * @return the current operating system.
     * @throws IllegalStateException if the current operating system is not supported.
     */
    public static OperatingSystem current() {
        final String osName = System.getProperty("os.name").toLowerCase();
        if (osName.contains("win")) {
            return WINDOWS;
        } else if (osName.contains("nix") || osName.contains("nux") || osName.contains("aix")) {
            return LINUX;
        } else if (osName.contains("mac")) {
            return DARWIN;
        } else {
            throw new IllegalStateException("Unsupported operating system: " + osName);
        }
    }
}
