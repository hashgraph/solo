// SPDX-License-Identifier: Apache-2.0

import {spawn, type ChildProcess} from 'child_process';
import {HelmExecutionException} from '../HelmExecutionException.js';
import {HelmParserException} from '../HelmParserException.js';
import {type Duration} from '../../time/duration.js';

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

  private readonly process: ChildProcess;

  /**
   * Creates a new HelmExecution instance.
   * @param command The command array to execute
   * @param workingDirectory The working directory for the process
   * @param environmentVariables The environment variables to set
   */
  constructor(command: string[], workingDirectory: string, environmentVariables: Record<string, string>) {
    this.process = spawn(command[0], command.slice(1), {
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
      this.process.on('close', code => {
        if (code !== 0) {
          reject(new HelmExecutionException(code || 1, `Process exited with code ${code}`, '', ''));
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
    return this.process.exitCode;
  }

  /**
   * Gets the standard output of the process.
   * @returns A promise that resolves with the standard output as a string
   */
  async standardOutput(): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      this.process.stdout?.on('data', data => {
        output += data.toString();
      });
      this.process.on('close', code => {
        if (code !== 0) {
          reject(new HelmExecutionException(code || 1, `Process exited with code ${code}`, '', ''));
        } else {
          resolve(output);
        }
      });
    });
  }

  /**
   * Gets the standard error of the process.
   * @returns A promise that resolves with the standard error as a string
   */
  async standardError(): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      this.process.stderr?.on('data', data => {
        output += data.toString();
      });
      this.process.on('close', code => {
        if (code !== 0) {
          reject(new HelmExecutionException(code || 1, `Process exited with code ${code}`, '', ''));
        } else {
          resolve(output);
        }
      });
    });
  }

  /**
   * Gets the response as a parsed object.
   * @param responseClass The class to parse the response into
   * @returns A promise that resolves with the parsed response
   */
  async responseAs<T>(responseClass: new () => T): Promise<T> {
    const output = await this.standardOutput();
    try {
      return JSON.parse(output) as T;
    } catch (error) {
      throw new HelmParserException(HelmExecution.MSG_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Gets the response as a parsed object with a timeout.
   * @param responseClass The class to parse the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response or rejects on timeout
   */
  async responseAsTimeout<T>(responseClass: new () => T, timeout: Duration | null): Promise<T> {
    const success = await this.waitForTimeout(timeout);
    if (!success) {
      throw new HelmExecutionException(1, HelmExecution.MSG_TIMEOUT_ERROR, '', '');
    }
    return this.responseAs(responseClass);
  }

  /**
   * Gets the response as a list of parsed objects.
   * @param responseClass The class to parse each item in the response into
   * @returns A promise that resolves with the parsed response list
   */
  async responseAsList<T>(responseClass: new () => T): Promise<T[]> {
    const output = await this.standardOutput();
    try {
      return JSON.parse(output) as T[];
    } catch (error) {
      throw new HelmParserException(HelmExecution.MSG_LIST_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Gets the response as a list of parsed objects with a timeout.
   * @param responseClass The class to parse each item in the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response list or rejects on timeout
   */
  async responseAsListTimeout<T>(responseClass: new () => T, timeout: Duration | null): Promise<T[]> {
    const success = await this.waitForTimeout(timeout);
    if (!success) {
      throw new HelmExecutionException(1, HelmExecution.MSG_TIMEOUT_ERROR, '', '');
    }
    return this.responseAsList(responseClass);
  }

  /**
   * Executes the command and waits for completion.
   * @returns A promise that resolves when the command completes
   */
  async call(): Promise<void> {
    await this.waitFor();
  }

  /**
   * Executes the command and waits for completion with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves when the command completes or rejects on timeout
   */
  async callTimeout(timeout: Duration | null): Promise<void> {
    const success = await this.waitForTimeout(timeout);
    if (!success) {
      throw new HelmExecutionException(1, HelmExecution.MSG_TIMEOUT_ERROR, '', '');
    }
  }
}
