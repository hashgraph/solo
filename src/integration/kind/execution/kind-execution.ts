// SPDX-License-Identifier: Apache-2.0

import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {KindExecutionException} from '../errors/kind-execution-exception.js';
import {KindParserException} from '../errors/kind-parser-exception.js';
import {type Duration} from '../../../core/time/duration.js';

/**
 * Represents the execution of a kind command and is responsible for parsing the response.
 */
export class KindExecution {
  /**
   * The message for a timeout error.
   */
  private static readonly MSG_TIMEOUT_ERROR: string = 'Timed out waiting for the process to complete';
  /**
   * The message for an error deserializing the output into a specified class.
   */
  private static readonly MSG_DESERIALIZATION_ERROR: string =
    'Failed to deserialize the output into the specified class: %s';
  /**
   * The message for an error reading the output from the process.
   */
  private static readonly MSG_READ_OUTPUT_ERROR: string = 'Failed to read the output from the process';
  /**
   * The message for a deserialization error.
   */
  private static readonly MSG_LIST_DESERIALIZATION_ERROR: string =
    'Failed to deserialize the output into a list of the specified class: %s';

  private readonly process: ChildProcessWithoutNullStreams;

  private output: string[] = [];
  private errOutput: string[] = [];
  private exitCodeValue: number | null = null;
  private spawnError: Error | undefined;

  /**
   * Creates a new KindExecution instance.
   * @param command The command array to execute
   * @param environmentVariables The environment variables to set
   */
  public constructor(command: string[], environmentVariables: Record<string, string>) {
    const [executable, ...commandArguments]: string[] = command;
    this.process = spawn(executable, commandArguments, {
      shell: false,
      env: environmentVariables,
    });
    // With shell:false a missing/invalid executable surfaces as an async 'error' event; capture it so it
    // is never an unhandled exception and can be surfaced by waitFor()/waitForTimeout().
    this.process.on('error', (error: Error): void => {
      this.spawnError = error;
    });
  }

  /**
   * Waits for the process to complete.
   * @returns A promise that resolves when the process completes
   */
  private async waitFor(): Promise<void> {
    return new Promise((resolve, reject) => {
      const rejectWithSpawnError: (error: Error) => void = (error: Error): void => {
        reject(new KindExecutionException(1, `Failed to start process: ${error.message}`, '', error.message));
      };
      if (this.spawnError) {
        rejectWithSpawnError(this.spawnError);
        return;
      }
      this.process.on('error', rejectWithSpawnError);

      // const output: string[] = [];
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

      this.process.on('close', (code): void => {
        this.exitCodeValue = code;
        if (code === 0) {
          resolve();
        } else {
          reject(
            new KindExecutionException(
              code || 1,
              `Process exited with code ${code}: ${this.standardError()}`,
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
    const timeoutPromise: Promise<boolean> = new Promise((resolve): void => {
      setTimeout((): void => resolve(false), timeout.toMillis());
    });

    const successPromise: Promise<boolean> = new Promise((resolve, reject): void => {
      // Reject (rather than resolve false) on a spawn failure so the real start-up error surfaces instead
      // of being masked as a generic timeout by responseAsTimeout()/callTimeout().
      const rejectWithSpawnError: (error: Error) => void = (error: Error): void => {
        reject(new KindExecutionException(1, `Failed to start process: ${error.message}`, '', error.message));
      };
      if (this.spawnError) {
        rejectWithSpawnError(this.spawnError);
        return;
      }
      this.process.on('error', rejectWithSpawnError);
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
    return this.output.join('\n');
  }

  /**
   * Gets the standard error of the process.
   * @returns concatenated standard error as a string
   */
  private standardError(): string {
    return this.errOutput.join('\n');
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
  private async responseAsTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
    if (responseClass === undefined) {
      return null;
    }

    const stdOut: string = this.standardOutput();

    // Kind outputs to stdErr, so when the exit code is 0, we can assume stdErr is the expected output logs.
    const stdLogs: string = this.standardError();

    // If both stdOut and stdLogs are empty, we throw an error.
    const output: string = stdOut || stdLogs;
    if (!output) {
      throw new KindParserException(KindExecution.MSG_READ_OUTPUT_ERROR);
    }

    try {
      const parsed: string[] = output.split(/\r?\n/).filter((line): boolean => line.trim() !== '');
      return new responseClass(...parsed);
    } catch {
      throw new KindParserException(KindExecution.MSG_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
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
  private async responseAsListTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T[]> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }

    const output: string = this.standardOutput();
    try {
      const splitOutput: string[] = output.split(/\r?\n/).filter((line): boolean => line.trim() !== '');
      return splitOutput.map(line => new responseClass(...line.split(',')));
    } catch {
      throw new KindParserException(KindExecution.MSG_LIST_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
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
  private async callTimeout(timeout: Duration | null): Promise<void> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success: boolean = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode: number = this.exitCode();
    if (exitCode !== 0) {
      const stdOut: string = this.standardOutput();
      const stdError: string = this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
  }
}
