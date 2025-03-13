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

import com.hedera.fullstack.base.api.util.StringUtils;

/**
 * Exception thrown when the execution of the Helm executable fails.
 */
public class HelmExecutionException extends RuntimeException {

    /**
     * the default message to use when no message is provided
     */
    public static final String DEFAULT_MESSAGE = "Execution of the Helm command failed with exit code: %d";

    /**
     * the non-zero system exit code returned by the Helm executable or the operating system
     */
    private final int exitCode;

    /**
     * the standard output of the Helm executable
     */
    private final String stdOut;

    /**
     * the standard error of the Helm executable
     */
    private final String stdErr;

    /**
     * Constructs a new exception instance with the specified exit code and a default message.
     *
     * @param exitCode the exit code returned by the Helm executable or the operating system.
     */
    public HelmExecutionException(final int exitCode) {
        this(exitCode, String.format(DEFAULT_MESSAGE, exitCode), StringUtils.EMPTY, StringUtils.EMPTY);
    }

    /**
     * Constructs a new exception instance with the specified exit code, standard output and standard error.
     *
     * @param exitCode the exit code returned by the Helm executable or the operating system.
     * @param stdOut the standard output of the Helm executable.
     * @param stdErr the standard error of the Helm executable.
     */
    public HelmExecutionException(final int exitCode, final String stdOut, final String stdErr) {
        this(exitCode, String.format(DEFAULT_MESSAGE, exitCode), stdOut, stdErr);
    }

    /**
     * Constructs a new exception instance with the specified exit code, message, stdOut, and stdErr.
     *
     * @param exitCode the exit code returned by the Helm executable or the operating system.
     * @param message the detail message (which is saved for later retrieval by the getMessage() method).
     * @param stdOut the standard output of the Helm executable.
     * @param stdErr the standard error of the Helm executable.
     */
    public HelmExecutionException(final int exitCode, final String message, final String stdOut, final String stdErr) {
        super(message);
        this.exitCode = exitCode;
        this.stdOut = stdOut;
        this.stdErr = stdErr;
    }

    /**
     * Constructs a new exception instance with the specified exit code and cause using the default message.
     *
     * @param exitCode the exit code returned by the Helm executable or the operating system.
     * @param cause    the cause (which is saved for later retrieval by the getCause() method). (A null value is
     *                 permitted, and indicates that the cause is nonexistent or unknown.)
     */
    public HelmExecutionException(final int exitCode, final Throwable cause) {
        this(exitCode, String.format(DEFAULT_MESSAGE, exitCode), cause);
    }

    /**
     * Constructs a new exception instance with the specified exit code, message and cause.
     *
     * @param exitCode the exit code returned by the Helm executable or the operating system.
     * @param message  the detail message (which is saved for later retrieval by the getMessage() method).
     * @param cause    the cause (which is saved for later retrieval by the getCause() method). (A null value is
     *                 permitted, and indicates that the cause is nonexistent or unknown.)
     */
    public HelmExecutionException(final int exitCode, final String message, final Throwable cause) {
        super(message, cause);
        this.exitCode = exitCode;
        this.stdOut = StringUtils.EMPTY;
        this.stdErr = StringUtils.EMPTY;
    }

    /**
     * Returns the exit code returned by the Helm executable or the operating system.
     *
     * @return the exit code returned by the Helm executable or the operating system.
     */
    public int getExitCode() {
        return exitCode;
    }

    /**
     * Returns the standard output of the Helm executable.
     *
     * @return the standard output of the Helm executable.
     */
    public String getStdOut() {
        return stdOut;
    }

    /**
     * Returns the standard error of the Helm executable.
     *
     * @return the standard error of the Helm executable.
     */
    public String getStdErr() {
        return stdErr;
    }

    @Override
    public String toString() {
        return "HelmExecutionException{" + "message="
                + getMessage() + ", exitCode="
                + getExitCode() + ", stdOut='"
                + getStdOut() + '\'' + ", stdErr='"
                + getStdErr() + '\'' + '}';
    }
}
