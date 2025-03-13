// SPDX-License-Identifier: Apache-2.0

import { join } from 'path';
import { HelmConfigurationException } from '../HelmConfigurationException.js';
import { HelmExecution } from './HelmExecution.js';

/**
 * A builder for creating a helm command execution.
 */
export class HelmExecutionBuilder {
  private static readonly NAME_MUST_NOT_BE_NULL = 'name must not be null';
  private static readonly VALUE_MUST_NOT_BE_NULL = 'value must not be null';

  /**
   * The path to the helm executable.
   */
  private readonly helmExecutable: string;

  /**
   * The list of subcommands to be used when execute the helm command.
   */
  private readonly _subcommands: string[] = [];

  /**
   * The arguments to be passed to the helm command.
   */
  private readonly _arguments: Map<string, string> = new Map();

  /**
   * The list of options and a list of their one or more values.
   */
  private readonly _optionsWithMultipleValues: Array<{ key: string; value: string[] }> = [];

  /**
   * The flags to be passed to the helm command.
   */
  private readonly _flags: string[] = [];

  /**
   * The positional arguments to be passed to the helm command.
   */
  private readonly _positionals: string[] = [];

  /**
   * The environment variables to be set when executing the helm command.
   */
  private readonly _environmentVariables: Map<string, string> = new Map();

  /**
   * The working directory to be used when executing the helm command.
   */
  private _workingDirectory: string;

  /**
   * Creates a new HelmExecutionBuilder instance.
   * @param helmExecutable the path to the helm executable
   */
  constructor(helmExecutable: string) {
    if (!helmExecutable) {
      throw new Error('helmExecutable must not be null');
    }
    this.helmExecutable = helmExecutable;

    const workingDirectoryString = process.env.PWD;
    this._workingDirectory = workingDirectoryString && workingDirectoryString.trim() !== ''
      ? workingDirectoryString
      : join(this.helmExecutable, '..');
  }

  /**
   * Adds the list of subcommands to the helm execution.
   * @param commands the list of subcommands to be added
   * @returns this builder
   */
  subcommands(...commands: string[]): HelmExecutionBuilder {
    if (!commands) {
      throw new Error('commands must not be null');
    }
    this._subcommands.push(...commands);
    return this;
  }

  /**
   * Adds an argument to the helm execution.
   * @param name the name of the argument
   * @param value the value of the argument
   * @returns this builder
   */
  argument(name: string, value: string): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._arguments.set(name, value);
    return this;
  }

  /**
   * Adds an option with multiple values to the helm execution.
   * @param name the name of the option
   * @param value the list of values for the option
   * @returns this builder
   */
  optionsWithMultipleValues(name: string, value: string[]): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._optionsWithMultipleValues.push({ key: name, value });
    return this;
  }

  /**
   * Adds a positional argument to the helm execution.
   * @param value the value of the positional argument
   * @returns this builder
   */
  positional(value: string): HelmExecutionBuilder {
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._positionals.push(value);
    return this;
  }

  /**
   * Adds an environment variable to the helm execution.
   * @param name the name of the environment variable
   * @param value the value of the environment variable
   * @returns this builder
   */
  environmentVariable(name: string, value: string): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._environmentVariables.set(name, value);
    return this;
  }

  /**
   * Sets the working directory for the helm execution.
   * @param workingDirectoryPath the path to the working directory
   * @returns this builder
   */
  workingDirectory(workingDirectoryPath: string): HelmExecutionBuilder {
    if (!workingDirectoryPath) {
      throw new Error('workingDirectoryPath must not be null');
    }
    this._workingDirectory = workingDirectoryPath;
    return this;
  }

  /**
   * Adds a flag to the helm execution.
   * @param flag the flag to be added
   * @returns this builder
   */
  flag(flag: string): HelmExecutionBuilder {
    if (!flag) {
      throw new Error('flag must not be null');
    }
    this._flags.push(flag);
    return this;
  }

  /**
   * Builds the HelmExecution instance.
   * @returns the HelmExecution instance
   */
  build(): HelmExecution {
    const command = this.buildCommand();
    const env: Record<string, string> = { ...process.env };
    this._environmentVariables.forEach((value, key) => {
      env[key] = value;
    });

    return new HelmExecution(command, this._workingDirectory, env);
  }

  /**
   * Builds the command array for the helm execution.
   * @returns the command array
   */
  private buildCommand(): string[] {
    const command: string[] = [];
    command.push(this.helmExecutable);
    command.push(...this._subcommands);
    command.push(...this._flags);

    this._arguments.forEach((value, key) => {
      command.push(`--${key}`);
      command.push(value);
    });

    this._optionsWithMultipleValues.forEach(entry => {
      entry.value.forEach(value => {
        command.push(`--${entry.key}`);
        command.push(value);
      });
    });

    command.push(...this._positionals);

    if (process.env.DEBUG) {
      console.debug('Helm command:', command.slice(1).join(' '));
    }

    return command;
  }
} 