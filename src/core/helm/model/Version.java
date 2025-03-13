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

package com.hedera.fullstack.helm.client.model;

import com.hedera.fullstack.base.api.version.SemanticVersion;
import java.util.Objects;

/**
 * The response from the helm version command.
 *
 * @param version the semantic version of helm with a leading {@code v} prefix.
 */
public record Version(String version) {

    /**
     * Constructs a new {@link Version}.
     *
     * @param version the semantic version of helm with a leading {@code v} prefix.
     * @throws NullPointerException if {@code version} is {@code null}.
     */
    public Version {
        Objects.requireNonNull(version, "version must not be null");
    }

    /**
     * Returns a {@link SemanticVersion} representation of the version.
     *
     * @return the helm version.
     */
    public SemanticVersion asSemanticVersion() {
        String safeVersion = version.trim();

        if (safeVersion.startsWith("v")) {
            safeVersion = safeVersion.substring(1);
        }

        return SemanticVersion.parse(safeVersion);
    }
}
