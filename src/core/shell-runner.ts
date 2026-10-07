// SPDX-License-Identifier: Apache-2.0

import {ChildProcess, ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {OperatingSystem} from '../business/utils/operating-system.js';
import {SensitiveDataRedactor} from './util/sensitive-data-redactor.js';
import {type ShellRunOptions} from './shell-run-options.js';
import {SubprocessEnvironment} from './subprocess-environment.js';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';

@injectable()
export class ShellRunner {
  public constructor(@inject(InjectTokens.SoloLogger) public logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Redacts sensitive arguments from a command array.
   * Delegates to the shared {@link SensitiveDataRedactor} utility.
   * @param arguments_ The arguments array to redact
   * @returns A new redacted arguments array
   */
  public static redactArguments(arguments_: string[]): string[] {
    return SensitiveDataRedactor.redactArguments(arguments_, {
      flagsToRedactNextArgument: ['--password', '-p', '-P'],
      setStyleFlags: ['--set', '--set-string', '--set-file'],
    });
  }

  /** Returns a promise that invokes the shell command */
  public async run(cmd: string, arguments_: string[] = [], options: ShellRunOptions = {}): Promise<string[]> {
    const {
      verbose = false,
      detached = false,
      commandProfile = SubprocessCommandProfile.GENERIC,
      environmentVariablesToAppend = {},
      timeoutMs,
      useShell = false,
      idleTimeoutMs,
      workingDirectory,
      bestEffort = false,
    }: ShellRunOptions = options;
    const redactedArguments: string[] = ShellRunner.redactArguments(arguments_);
    const message: string = `Executing command${OperatingSystem.isWin32() ? ' (Windows)' : ''}: ${cmd} ${redactedArguments.join(' ')}`;
    const callStack: string = new Error(message).stack; // capture the callstack to be included in error
    this.logger.info(message);

    return new Promise<string[]>((resolve, reject): void => {
      const child: ChildProcessWithoutNullStreams | ChildProcess = spawn(cmd, arguments_, {
        env: SubprocessEnvironment.forCommand(commandProfile, environmentVariablesToAppend),
        shell: useShell,
        detached,
        cwd: workingDirectory,
        stdio: detached && !OperatingSystem.isWin32() ? 'ignore' : undefined,
      });

      if (detached) {
        child.once('error', (error): void => {
          error.stack = callStack;
          reject(error);
        });
        child.once('spawn', (): void => {
          child.unref(); // allow the parent process to exit independently of this child
          resolve([]);
        });
        return;
      }

      let timedOut: boolean = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let idleTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const failOnTimeout: (error: Error) => void = (error: Error): void => {
        if (timedOut) {
          return;
        }

        timedOut = true;
        child.kill();
        error.stack = callStack;
        reject(error);
      };

      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout((): void => {
          failOnTimeout(new Error(`Command timed out after ${timeoutMs}ms: '${cmd}'`));
        }, timeoutMs);
      }

      const resetIdleTimeout: () => void = (): void => {
        if (idleTimeoutMs === undefined) {
          return;
        }

        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }

        idleTimeoutHandle = setTimeout((): void => {
          failOnTimeout(new Error(`Command produced no output for ${idleTimeoutMs}ms: '${cmd}'`));
        }, idleTimeoutMs);
      };

      resetIdleTimeout();

      const output: string[] = [];
      child.stdout.on('data', (data): void => {
        resetIdleTimeout();
        const items: string[] = data.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            output.push(item);
            if (verbose) {
              this.logger.showUser(item);
            }
          }
        }
      });

      const errorOutput: string[] = [];
      child.stderr.on('data', (data): void => {
        resetIdleTimeout();
        const items: string[] = data.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            const errorMessage: string = item.trim();
            errorOutput.push(errorMessage);
            if (verbose) {
              this.logger.showUser(errorMessage);
            }
          }
        }
      });

      child.on('exit', (code, signal): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }

        if (timedOut) {
          return; // already rejected by timeout handler
        }

        if (code) {
          const error: Error = new Error(
            `Command exit with error code ${code}, [command: '${cmd}'], [message: '${errorOutput.join('\n')}']`,
          );

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          error.stack = callStack;

          if (verbose) {
            for (const m of errorOutput) {
              this.logger.showUser(chalk.red(m));
            }
          }

          const failureDetails: Record<string, unknown> = {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
            error: {message: error.message, stack: error.stack},
          };
          if (bestEffort) {
            this.logger.debug(`Best-effort command failed: '${cmd}'`, failureDetails);
          } else {
            this.logger.error(`Error executing: '${cmd}'`, failureDetails);
          }

          reject(error);
          return;
        }

        this.logger.debug(
          `Finished executing: '${cmd}', ${JSON.stringify({
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
          })}`,
        );

        resolve(output);
      });

      // With shell:false a missing/invalid executable surfaces as an 'error' event (e.g. ENOENT) rather
      // than a non-zero exit, so it must be handled here to reject instead of throwing uncaught.
      child.on('error', (error: Error): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }
        if (timedOut) {
          return; // already rejected by timeout handler
        }
        error.stack = callStack;
        const spawnFailureDetails: Record<string, unknown> = {error: {message: error.message, stack: error.stack}};
        if (bestEffort) {
          this.logger.debug(`Best-effort command failed: '${cmd}'`, spawnFailureDetails);
        } else {
          this.logger.error(`Error executing: '${cmd}'`, spawnFailureDetails);
        }
        reject(error);
      });
    });
  }

  public async sudoRun(
    sudoRequested: (message: string) => void,
    sudoGranted: (message: string) => void,
    cmd: string,
    arguments_: string[] = [],
    verbose: boolean = false,
    detached: boolean = false,
    environmentVariablesToAppend: Record<string, string> = {},
    commandProfile: SubprocessCommandProfile = SubprocessCommandProfile.GENERIC,
  ): Promise<string[]> {
    // Use Promise.race to handle sudo whoami and timeout
    let whoamiResolved: boolean = false;
    const whoamiPromise: Promise<string[]> = this.run('sudo', ['whoami']).then(async (result): Promise<string[]> => {
      whoamiResolved = true;
      sudoGranted('Root access granted.');
      return result;
    });
    // eslint-disable-next-line no-async-promise-executor
    const timeoutPromise: Promise<string[]> = new Promise<string[]>(async (resolve): Promise<void> => {
      await new Promise((callback): NodeJS.Timeout => setTimeout(callback, 500));
      if (!whoamiResolved) {
        sudoRequested('Please provide root permissions to proceed...');
      }
      resolve([]);
    });
    await Promise.race([whoamiPromise, timeoutPromise]);

    return this.run('sudo', [cmd, ...arguments_], {verbose, detached, environmentVariablesToAppend, commandProfile});
  }
}
