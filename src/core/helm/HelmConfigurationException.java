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

package com.hedera.fullstack.helm.client;

public class HelmConfigurationException extends RuntimeException {

    /**
     * Constructs a new exception instance with the specified message.
     *
     * @param message the detail message (which is saved for later retrieval by the getMessage() method).
     */
    public HelmConfigurationException(String message) {
        super(message);
    }

    /**
     * Constructs a new exception instance with the specified message and cause.
     *
     * @param message the detail message (which is saved for later retrieval by the getMessage() method).
     * @param cause   the cause (which is saved for later retrieval by the getCause() method). (A null value is permitted, and indicates that the cause is nonexistent or unknown.)
     */
    public HelmConfigurationException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Constructs a new exception instance with the specified cause.
     *
     * @param cause the cause (which is saved for later retrieval by the getCause() method). (A null value is permitted, and indicates that the cause is nonexistent or unknown.)
     */
    public HelmConfigurationException(Throwable cause) {
        super(cause);
    }
}
