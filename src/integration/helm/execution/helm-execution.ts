// SPDX-License-Identifier: Apache-2.0

import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {HelmExecutionException} from '../helm-execution-exception.js';
import {HelmParserException} from '../helm-parser-exception.js';
import {type Duration} from '../../../core/time/duration.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {SensitiveDataRedactor} from '../../../core/util/sensitive-data-redactor.js';
import {type ExternalCommandInvocation} from '../../../core/execution/external-command-invocation.js';

/**
 * Represents the execution of a helm command and is responsible for parsing the response.
 */
export class HelmExecution {
  /**
   * The logger for this class which should be used for all logging.
   */
  private static readonly MSG_TIMEOUT_ERROR: string = 'Timed out waiting for the process to complete';

  /**
   * The message for a timeout error.
   */
  private static readonly MSG_DESERIALIZATION_ERROR: string =
    'Failed to deserialize the output into the specified class: %s';

  /**
   * The message for a deserialization error.
   */
  private static readonly MSG_LIST_DESERIALIZATION_ERROR: string =
    'Failed to deserialize the output into a list of the specified class: %s';

  private readonly process: ChildProcessWithoutNullStreams;
  private readonly commandLine: string;
  private readonly logger?: SoloLogger;

  private output: string[] = [];
  private errOutput: string[] = [];
  private exitCodeValue: number | null = null;

  /**
   * Redacts sensitive arguments from a command array.
   * Delegates to the shared {@link SensitiveDataRedactor} utility.
   * @param command The command array to redact
   * @returns A new redacted command array
   */
  public static redactCommand(command: string[]): string[] {
    return SensitiveDataRedactor.redactArguments(command, {
      flagsToRedactNextArgument: ['--password'],
      setStyleFlags: ['--set', '--set-string', '--set-file'],
    });
  }

  /**
   * Creates a new HelmExecution instance.
   * @param invocation The helm command invocation to execute.
   * @param logger Optional logger for command output.
   */
  public constructor(invocation: ExternalCommandInvocation, logger?: SoloLogger) {
    if (!invocation.commandPathOrName) {
      throw new Error('Helm executable path or name is required');
    }

    this.logger = logger;

    const redactedCommand: string[] = HelmExecution.redactCommand([
      invocation.commandPathOrName,
      ...invocation.commandArguments,
    ]);

    this.commandLine = redactedCommand.join(' ');

    if (this.logger) {
      this.logger.info(`Executing helm command: ${this.commandLine}`);
    }

    this.process = spawn(invocation.commandPathOrName, invocation.commandArguments, {
      shell: false,
      env: invocation.environmentVariables,
      cwd: invocation.workingDirectory,
    });
  }

  /**
   * Waits for the process to complete.
   * @returns A promise that resolves when the process completes
   */
  public async waitFor(): Promise<void> {
    return new Promise((resolve, reject): void => {
      this.process.stdout.on('data', (d): void => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            this.output.push(item);
          }
        }
      });

      this.process.stderr.on('data', (d): void => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            this.errOutput.push(item.trim());
          }
        }
      });

      this.process.on('error', reject);

      this.process.on('close', (code): void => {
        this.exitCodeValue = code;
        if (code === 0) {
          resolve();
        } else {
          reject(
            new HelmExecutionException(
              code || 1,
              `Helm command failed with exit code ${code}. Command: '${this.commandLine}'. Error: ${this.standardError()}`,
              this.standardOutput(),
              this.standardError(),
            ),
          );
        }
      });
    });
  }

  /**
   * Waits for the process to complete with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with true if the process completed, or false if it timed out
   */
  private async waitForTimeout(timeout: Duration): Promise<boolean> {
    const timeoutPromise: Promise<boolean> = new Promise<boolean>((resolve): void => {
      setTimeout((): void => resolve(false), timeout.toMillis());
    });

    const successPromise: Promise<boolean> = new Promise<boolean>((resolve): void => {
      this.process.on('close', (code): void => {
        resolve(code === 0);
      });
    });

    return Promise.race([successPromise, timeoutPromise]);
  }

  /**
   * Gets the exit code of the process.
   * @returns The exit code or null if the process hasn't completed
   */
  private exitCode(): number | null {
    return this.exitCodeValue;
  }

  /**
   * Gets the standard output of the process.
   * @returns concatenated standard output as a string
   */
  private standardOutput(): string {
    return this.output.join('');
  }

  /**
   * Gets the standard error of the process.
   * @returns concatenated standard error as a string
   */
  private standardError(): string {
    return this.errOutput.join('');
  }

  private static parseJsonOutput(output: string): unknown {
    let lastParseError: unknown;

    for (let index: number = 0; index < output.length; index++) {
      if (output[index] !== '{' && output[index] !== '[') {
        continue;
      }

      try {
        return JSON.parse(HelmExecution.extractJsonOutput(output, index));
      } catch (error) {
        lastParseError = error;
      }
    }

    if (lastParseError) {
      throw lastParseError;
    }

    return JSON.parse(output);
  }

  private static extractJsonOutput(output: string, jsonStart: number): string {
    const stack: string[] = [];
    let inString: boolean = false;
    let escaped: boolean = false;

    for (let index: number = jsonStart; index < output.length; index++) {
      const character: string = output[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === '\\') {
          escaped = true;
          continue;
        }

        if (character === '"') {
          inString = false;
        }

        continue;
      }

      if (character === '"') {
        inString = true;
        continue;
      }

      if (character === '{') {
        stack.push('}');
        continue;
      }

      if (character === '[') {
        stack.push(']');
        continue;
      }

      if (character !== '}' && character !== ']') {
        continue;
      }

      const expectedCharacter: string | undefined = stack.pop();
      if (character !== expectedCharacter) {
        return output.slice(jsonStart);
      }

      if (stack.length === 0) {
        return output.slice(jsonStart, index + 1);
      }
    }

    return output.slice(jsonStart);
  }

  /**
   * Gets the response as a parsed object.
   * @param responseClass The class to parse the response into
   * @returns A promise that resolves with the parsed response
   */
  public async responseAs<T>(responseClass: new (...arguments_: any[]) => T): Promise<T> {
    return this.responseAsTimeout(responseClass, null);
  }

  /**
   * Gets the response as a parsed object with a timeout.
   * @param responseClass The class to parse the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response or rejects on timeout
   */
  public async responseAsTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new HelmExecutionException(
        exitCode,
        `Helm command failed with exit code ${exitCode}. Command: '${this.commandLine}'. Error: ${stdError}`,
        stdOut,
        stdError,
      );
    }
    if (responseClass === undefined) {
      return null;
    }

    const output: string = this.standardOutput();
    try {
      const parsed: any = HelmExecution.parseJsonOutput(output);
      const result: T = new responseClass();
      Object.assign(result, parsed);
      return result;
    } catch (error) {
      throw new HelmParserException(
        HelmExecution.MSG_DESERIALIZATION_ERROR.replace('%s', responseClass.name),
        error as Error,
      );
    }
  }

  /**
   * Gets the response as a list of parsed objects.
   * @param responseClass The class to parse each item in the response into
   * @returns A promise that resolves with the parsed response list
   */
  public async responseAsList<T>(responseClass: new (...arguments_: any[]) => T): Promise<T[]> {
    return this.responseAsListTimeout(responseClass, null);
  }

  /**
   * Gets the response as a list of parsed objects with a timeout.
   * @param responseClass The class to parse each item in the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response list or rejects on timeout
   */
  public async responseAsListTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T[]> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new HelmExecutionException(
        exitCode,
        `Helm command failed with exit code ${exitCode}. Command: '${this.commandLine}'. Error: ${stdError}`,
        stdOut,
        stdError,
      );
    }

    const output: string = this.standardOutput();
    try {
      return HelmExecution.parseJsonOutput(output) as T[];
    } catch (error) {
      throw new HelmParserException(
        HelmExecution.MSG_LIST_DESERIALIZATION_ERROR.replace('%s', responseClass.name),
        error as Error,
      );
    }
  }

  /**
   * Executes the command and waits for completion.
   * @returns A promise that resolves when the command completes
   */
  public async call(): Promise<void> {
    await this.callTimeout(null);
  }

  /**
   * Executes the command and waits for completion with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves when the command completes or rejects on timeout
   */
  public async callTimeout(timeout: Duration | null): Promise<void> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new HelmExecutionException(
        exitCode,
        `Helm command failed with exit code ${exitCode}. Command: '${this.commandLine}'. Error: ${stdError}`,
        stdOut,
        stdError,
      );
    }
  }
}
