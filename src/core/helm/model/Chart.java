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

/**
 * Represents a chart and is used to interact with the Helm install and uninstall commands.
 * @param repoName the name of repository which contains the Helm chart.
 * @param name the name of the Helm chart.
 */
public record Chart(String name, String repoName) {
    public Chart(String name) {
        this(name, null);
    }

    @Override
    public String toString() {
        if (repoName == null || repoName.isBlank()) {
            return name;
        }

        return String.format("%s/%s", repoName, name);
    }

    public String qualified() {
        return toString();
    }

    public String unqualified() {
        return name;
    }
}
