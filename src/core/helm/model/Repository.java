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

import java.util.Objects;

/**
 * The response from the helm repo commands.
 *
 * @param name the name of the repository.
 * @param url  the url of the repository.
 */
public record Repository(String name, String url) {

    /**
     * Constructs a new {@link Repository}.
     *
     * @param name the name of the repository.
     * @param url  the url of the repository.
     * @throws NullPointerException if any of the arguments are null.
     * @throws IllegalArgumentException if any of the arguments are blank.
     */
    public Repository {
        Objects.requireNonNull(name, "name must not be null");
        Objects.requireNonNull(url, "url must not be null");

        if (name.isBlank()) {
            throw new IllegalArgumentException("name must not be blank");
        }

        if (url.isBlank()) {
            throw new IllegalArgumentException("url must not be blank");
        }
    }
}
