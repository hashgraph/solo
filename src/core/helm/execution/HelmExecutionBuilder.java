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

package com.hedera.fullstack.helm.client.execution;

import com.hedera.fullstack.base.api.collections.KeyValuePair;
import com.hedera.fullstack.helm.client.HelmConfigurationException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A builder for creating a helm command execution.
 */
public final class HelmExecutionBuilder {
    private static final Logger LOGGER = LoggerFactory.getLogger(HelmExecutionBuilder.class);
    public static final String NAME_MUST_NOT_BE_NULL = "name must not be null";
    public static final String VALUE_MUST_NOT_BE_NULL = "value must not be null";
    /**
     * The path to the helm executable.
     */
    private final Path helmExecutable;

    /**
     * The list of subcommands to be used when execute the helm command.
     */
    private final List<String> subcommands;

    /**
     * The arguments to be passed to the helm command.
     */
    private final HashMap<String, String> arguments;

    /**
     * The list of options and a list of their one or more values.
     */
    private final List<KeyValuePair<String, List<String>>> optionsWithMultipleValues;

    /**
     * The flags to be passed to the helm command.
     */
    private final List<String> flags;

    /**
     * The positional arguments to be passed to the helm command.
     */
    private final List<String> positionals;

    /**
     * The environment variables to be set when executing the helm command.
     */
    private final Map<String, String> environmentVariables;

    /**
     * The working directory to be used when executing the helm command.
     */
    private Path workingDirectory;

    /**
     * Creates a new {@link HelmExecutionBuilder} instance.
     *
     * @param helmExecutable the path to the helm executable.
     */
    public HelmExecutionBuilder(final Path helmExecutable) {
        this.helmExecutable = Objects.requireNonNull(helmExecutable, "helmExecutable must not be null");
        this.subcommands = new ArrayList<>();
        this.arguments = new HashMap<>();
        this.optionsWithMultipleValues = new ArrayList<>();
        this.positionals = new ArrayList<>();
        this.flags = new ArrayList<>();
        this.environmentVariables = new HashMap<>();

        String workingDirectoryString = System.getenv("PWD");
        this.workingDirectory = (workingDirectoryString == null || workingDirectoryString.isBlank())
                ? this.helmExecutable.getParent()
                : new File(workingDirectoryString).toPath();
    }

    /**
     * Adds the list of subcommands to the helm execution.
     *
     * @param commands the list of subcommands to be added.
     * @return this builder.
     */
    public HelmExecutionBuilder subcommands(final String... commands) {
        Objects.requireNonNull(commands, "commands must not be null");
        this.subcommands.addAll(Arrays.asList(commands));
        return this;
    }

    /**
     * Adds an argument to the helm command.
     *
     * @param name  the name of the argument.
     * @param value the value of the argument.
     * @return this builder.
     * @throws NullPointerException if either {@code name} or {@code value} is {@code null}.
     */
    public HelmExecutionBuilder argument(final String name, final String value) {
        Objects.requireNonNull(name, NAME_MUST_NOT_BE_NULL);
        Objects.requireNonNull(value, VALUE_MUST_NOT_BE_NULL);
        this.arguments.put(name, value);
        return this;
    }

    /**
     * Adds an option with a provided list of values to the helm command.  This is used for options that have can have
     * multiple values for a single option.  (e.g. --set and --values)
     *
     * @param name  the name of the option.
     * @param value the list of values for the given option.
     * @return this builder.
     * @throws NullPointerException if either {@code name} or {@code value} is {@code null}.
     */
    public HelmExecutionBuilder optionsWithMultipleValues(final String name, final List<String> value) {
        Objects.requireNonNull(name, NAME_MUST_NOT_BE_NULL);
        Objects.requireNonNull(value, VALUE_MUST_NOT_BE_NULL);
        this.optionsWithMultipleValues.add(new KeyValuePair<>(name, value));
        return this;
    }

    /**
     * Adds a positional argument to the helm command.
     *
     * @param value the value of the positional argument.
     * @return this builder.
     * @throws NullPointerException if {@code value} is {@code null}.
     */
    public HelmExecutionBuilder positional(final String value) {
        Objects.requireNonNull(value, VALUE_MUST_NOT_BE_NULL);
        this.positionals.add(value);
        return this;
    }

    /**
     * Adds an environment variable to the helm command.
     *
     * @param name  the name of the environment variable.
     * @param value the value of the environment variable.
     * @return this builder.
     * @throws NullPointerException if either {@code name} or {@code value} is {@code null}.
     */
    public HelmExecutionBuilder environmentVariable(final String name, final String value) {
        Objects.requireNonNull(name, NAME_MUST_NOT_BE_NULL);
        Objects.requireNonNull(value, VALUE_MUST_NOT_BE_NULL);
        this.environmentVariables.put(name, value);
        return this;
    }

    /**
     * Sets the Path of the working directory for the helm process.
     *
     * @param workingDirectoryPath the Path of the working directory.
     * @return this builder.
     */
    public HelmExecutionBuilder workingDirectory(final Path workingDirectoryPath) {
        this.workingDirectory = Objects.requireNonNull(workingDirectoryPath, "workingDirectoryPath must not be null");
        return this;
    }

    /**
     * Adds a flag to the helm command.
     *
     * @param flag the flag to be added.
     * @return this builder.
     * @throws NullPointerException if {@code flag} is {@code null}.
     */
    public HelmExecutionBuilder flag(final String flag) {
        Objects.requireNonNull(flag, "flag must not be null");
        this.flags.add(flag);
        return this;
    }

    /**
     * Builds a {@link HelmExecution} from the current state of this builder.
     *
     * @return a {@link HelmExecution} instance.
     * @throws HelmConfigurationException if the helm process cannot be started.
     */
    public HelmExecution build() {
        final ProcessBuilder pb = new ProcessBuilder(buildCommand());
        final Map<String, String> env = pb.environment();
        env.putAll(environmentVariables);

        pb.redirectError(ProcessBuilder.Redirect.PIPE);
        pb.redirectOutput(ProcessBuilder.Redirect.PIPE);
        pb.directory(workingDirectory.toFile());

        try {
            return new HelmExecution(pb.start());
        } catch (IOException e) {
            throw new HelmConfigurationException(e);
        }
    }

    /**
     * Builds the CLI arguments including the program to be executed.
     *
     * @return the CLI arguments.
     */
    private String[] buildCommand() {
        final List<String> command = new ArrayList<>();
        command.add(helmExecutable.toString());
        command.addAll(subcommands);
        command.addAll(flags);

        arguments.forEach((key, value) -> {
            command.add(String.format("--%s", key));
            command.add(value);
        });

        optionsWithMultipleValues.forEach(entry -> entry.value().forEach(value -> {
            command.add(String.format("--%s", entry.key()));
            command.add(value);
        }));

        command.addAll(positionals);

        String[] commandArray = command.toArray(new String[0]);
        if (LOGGER.isDebugEnabled()) {
            LOGGER.debug(
                    "Helm command: {}", String.join(" ", Arrays.copyOfRange(commandArray, 1, commandArray.length)));
        }

        return commandArray;
    }
}
