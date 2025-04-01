// SPDX-License-Identifier: Apache-2.0

import {spawn, type ChildProcessWithoutNullStreams} from 'child_process';
import {HelmExecutionException} from '../helm-execution-exception.js';
import {HelmParserException} from '../helm-parser-exception.js';
import {type Duration} from '../../../core/time/duration.js';

/**
 * Represents the execution of a helm command and is responsible for parsing the response.
 */
export class HelmExecution {
  /**
   * The logger for this class which should be used for all logging.
   */
  private static readonly MSG_TIMEOUT_ERROR = 'Timed out waiting for the process to complete';
  /**
   * The message for a timeout error.
   */
  private static readonly MSG_DESERIALIZATION_ERROR = 'Failed to deserialize the output into the specified class: %s';
  /**
   * The message for a deserialization error.
   */
  private static readonly MSG_LIST_DESERIALIZATION_ERROR =
    'Failed to deserialize the output into a list of the specified class: %s';

  private readonly process: ChildProcessWithoutNullStreams;

  private output: string[] = [];
  private errOutput: string[] = [];
  private exitCodeValue: number | null = null;

  /**
   * Creates a new HelmExecution instance.
   * @param command The command array to execute
   * @param workingDirectory The working directory for the process
   * @param environmentVariables The environment variables to set
   */
  constructor(command: string[], workingDirectory: string, environmentVariables: Record<string, string>) {
    this.process = spawn(command.join(' '), {
      shell: true,
      cwd: workingDirectory,
      env: {...process.env, ...environmentVariables},
    });
  }

  /**
   * Waits for the process to complete.
   * @returns A promise that resolves when the process completes
   */
  async waitFor(): Promise<void> {
    return new Promise((resolve, reject) => {
      // const output: string[] = [];
      this.process.stdout.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        items.forEach(item => {
          if (item) {
            this.output.push(item);
          }
        });
      });

      this.process.stderr.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        items.forEach(item => {
          if (item) {
            this.errOutput.push(item.trim());
          }
        });
      });

      this.process.on('close', code => {
        this.exitCodeValue = code;
        if (code !== 0) {
          reject(
            new HelmExecutionException(
              code || 1,
              `Process exited with code ${code}` + this.standardError(),
              this.standardOutput(),
              this.standardError(),
            ),
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Waits for the process to complete with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with true if the process completed, or false if it timed out
   */
  async waitForTimeout(timeout: Duration): Promise<boolean> {
    const timeoutPromise = new Promise<boolean>(resolve => {
      setTimeout(() => resolve(false), timeout.toMillis());
    });

    const successPromise = new Promise<boolean>(resolve => {
      this.process.on('close', code => {
        resolve(code === 0);
      });
    });

    return Promise.race([successPromise, timeoutPromise]);
  }

  /**
   * Gets the exit code of the process.
   * @returns The exit code or null if the process hasn't completed
   */
  exitCode(): number | null {
    return this.exitCodeValue;
  }

  /**
   * Gets the standard output of the process.
   * @returns concatenated standard output as a string
   */
  standardOutput(): string {
    return this.output.join('');
  }

  /**
   * Gets the standard error of the process.
   * @returns concatenated standard error as a string
   */
  standardError(): string {
    return this.errOutput.join('');
  }

  /**
   * Gets the response as a parsed object.
   * @param responseClass The class to parse the response into
   * @returns A promise that resolves with the parsed response
   */
  async responseAs<T>(responseClass: new (...arguments_: any[]) => T): Promise<T> {
    return this.responseAsTimeout(responseClass, null);
  }

  /**
   * Gets the response as a parsed object with a timeout.
   * @param responseClass The class to parse the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response or rejects on timeout
   */
  async responseAsTimeout<T>(responseClass: new (...arguments_: any[]) => T, timeout: Duration | null): Promise<T> {
    if (timeout !== null) {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    } else {
      await this.waitFor();
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = this.standardOutput();
      const stdError = this.standardError();
      throw new HelmExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
    if (responseClass === undefined) {
      return null;
    }

    const output = this.standardOutput();
    try {
      const parsed = JSON.parse(output);
      const result = new responseClass();
      Object.assign(result, parsed);
      return result;
    } catch (error) {
      throw new HelmParserException(HelmExecution.MSG_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Gets the response as a list of parsed objects.
   * @param responseClass The class to parse each item in the response into
   * @returns A promise that resolves with the parsed response list
   */
  async responseAsList<T>(responseClass: new (...arguments_: any[]) => T): Promise<T[]> {
    return this.responseAsListTimeout(responseClass, null);
  }

  /**
   * Gets the response as a list of parsed objects with a timeout.
   * @param responseClass The class to parse each item in the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response list or rejects on timeout
   */
  async responseAsListTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T[]> {
    if (timeout !== null) {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    } else {
      await this.waitFor();
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = this.standardOutput();
      const stdError = this.standardError();
      throw new HelmExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }

    const output = this.standardOutput();
    try {
      return JSON.parse(output) as T[];
    } catch (error) {
      throw new HelmParserException(HelmExecution.MSG_LIST_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Executes the command and waits for completion.
   * @returns A promise that resolves when the command completes
   */
  async call(): Promise<void> {
    await this.callTimeout(null);
  }

  /**
   * Executes the command and waits for completion with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves when the command completes or rejects on timeout
   */
  async callTimeout(timeout: Duration | null): Promise<void> {
    if (timeout !== null) {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new HelmParserException(HelmExecution.MSG_TIMEOUT_ERROR);
      }
    } else {
      await this.waitFor();
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = await this.standardOutput();
      const stdError = await this.standardError();
      throw new HelmExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
  }
}
