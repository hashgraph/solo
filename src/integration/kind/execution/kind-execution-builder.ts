// SPDX-License-Identifier: Apache-2.0

import {KindExecution} from './kind-execution.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {ExecutionBuilder} from '../../execution-builder.js';
import {SubprocessEnvironment} from '../../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../core/subprocess-command-profile.js';

/**
 * A builder for creating a kind command execution.
 */
@injectable()
export class KindExecutionBuilder extends ExecutionBuilder {
  private static readonly NAME_MUST_NOT_BE_NULL: string = 'name must not be null';
  private static readonly VALUE_MUST_NOT_BE_NULL: string = 'value must not be null';

  /**
   * The path to the kind executable.
   */
  private kindExecutable: string;

  /**
   * The list of subcommands to be used when execute the kind command.
   */
  private readonly _subcommands: string[] = [];

  /**
   * The arguments to be passed to the kind command.
   */
  private readonly _arguments: Map<string, string> = new Map();

  /**
   * The list of options and a list of their one or more values.
   */
  private readonly _optionsWithMultipleValues: Array<{key: string; value: string[]}> = [];

  /**
   * The positional arguments to be passed to the kind command.
   */
  private readonly _positionals: string[] = [];

  /**
   * The environment variables to be set when executing the kind command.
   */
  private readonly _environmentVariables: Map<string, string> = new Map();

  /**
   * Creates a new KindExecutionBuilder instance.
   */
  public constructor(
    @inject(InjectTokens.KindInstallationDirectory) private readonly kindInstallationDirectory?: string,
  ) {
    super();
    this.kindInstallationDirectory = patchInject(
      kindInstallationDirectory,
      InjectTokens.KindInstallationDirectory,
      KindExecutionBuilder.name,
    );
  }

  public executable(kindExecutable: string): KindExecutionBuilder {
    if (!kindExecutable) {
      throw new Error('kindExecutable must not be null');
    }
    this.kindExecutable = kindExecutable;
    return this;
  }

  /**
   * Adds the list of subcommands to the kind execution.
   * @param commands the list of subcommands to be added
   * @returns this builder
   */
  public subcommands(...commands: string[]): KindExecutionBuilder {
    if (!commands || commands.length === 0) {
      throw new Error('commands must not be null');
    }
    this._subcommands.push(...commands);
    return this;
  }

  /**
   * Adds an argument to the kind execution.
   * @param name the name of the argument
   * @param value the value of the argument
   * @returns this builder
   */
  public argument(name: string, value: string): KindExecutionBuilder {
    if (!name) {
      throw new Error(KindExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(KindExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._arguments.set(name, value);
    return this;
  }

  /**
   * Adds an option with multiple values to the kind execution.
   * @param name the name of the option
   * @param value the list of values for the option
   * @returns this builder
   */
  public optionsWithMultipleValues(name: string, value: string[]): KindExecutionBuilder {
    if (!name) {
      throw new Error(KindExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(KindExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._optionsWithMultipleValues.push({key: name, value});
    return this;
  }

  /**
   * Adds a positional argument to the kind execution.
   * @param value the value of the positional argument
   * @returns this builder
   */
  public positional(value: string): KindExecutionBuilder {
    if (!value) {
      throw new Error(KindExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._positionals.push(value);
    return this;
  }

  /**
   * Adds an environment variable to the kind execution.
   * @param name the name of the environment variable
   * @param value the value of the environment variable
   * @returns this builder
   */
  public environmentVariable(name: string, value: string): KindExecutionBuilder {
    if (!name) {
      throw new Error(KindExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(KindExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._environmentVariables.set(name, value);
    return this;
  }

  /**
   * Builds the KindExecution instance.
   * @returns the KindExecution instance
   */
  public build(): KindExecution {
    const command: string[] = this.buildCommand();
    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KIND);
    for (const [key, value] of this._environmentVariables.entries()) {
      environment[key] = value;
    }

    this.prefixPath(environment, this.kindInstallationDirectory);

    return new KindExecution(command, environment);
  }

  /**
   * Builds the command array for the kind execution.
   * @returns the command array
   */
  private buildCommand(): string[] {
    const command: string[] = [`${this.kindExecutable}`, ...this._subcommands, ...this._flags];

    for (const [key, value] of this._arguments.entries()) {
      command.push(`--${key}`, value);
    }

    for (const entry of this._optionsWithMultipleValues) {
      for (const value of entry.value) {
        command.push(`--${entry.key}`, value);
      }
    }

    command.push(...this._positionals);

    return command;
  }
}
