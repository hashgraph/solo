// SPDX-License-Identifier: Apache-2.0

import {spawn} from 'node:child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

@injectable()
export class ShellRunner {
  constructor(@inject(InjectTokens.SoloLogger) public logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /** Returns a promise that invokes the shell command */
  run(cmd: string, verbose = false) {
    const self = this;
    const callStack = new Error().stack; // capture the callstack to be included in error
    self.logger.info(`Executing command: '${cmd}'`);

    return new Promise<string[]>((resolve, reject) => {
      const child = spawn(cmd, {
        shell: true,
      });

      const output: string[] = [];
      child.stdout.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            output.push(item);
          }
        }
      });

      const errorOutput: string[] = [];
      child.stderr.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            errorOutput.push(item.trim());
          }
        }
      });

      child.on('exit', (code, signal) => {
        if (code) {
          const error = new Error(`Command exit with error code ${code}: ${cmd}`);

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          error.stack = callStack;

          if (verbose) {
            for (const m of errorOutput) self.logger.showUser(chalk.red(m));
          }

          self.logger.error(`Error executing: '${cmd}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
            error: {message: error.message, stack: error.stack},
          });

          reject(error);
        }

        self.logger.debug(`Finished executing: '${cmd}'`, {
          commandExitCode: code,
          commandExitSignal: signal,
          commandOutput: output,
          errOutput: errorOutput,
        });
        resolve(output);
      });
    });
  }
}
