/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {spawn} from 'child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';

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
        items.forEach(item => {
          if (item) {
            output.push(item);
          }
        });
      });

      const errOutput: string[] = [];
      child.stderr.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        items.forEach(item => {
          if (item) {
            errOutput.push(item.trim());
          }
        });
      });

      child.on('exit', (code, signal) => {
        if (code) {
          const err = new Error(`Command exit with error code ${code}: ${cmd}`);

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          err.stack = callStack;

          if (verbose) {
            errOutput.forEach(m => self.logger.showUser(chalk.red(m)));
          }

          self.logger.error(`Error executing: '${cmd}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput,
            error: {message: err.message, stack: err.stack},
          });

          reject(err);
        }

        self.logger.debug(`Finished executing: '${cmd}'`, {
          commandExitCode: code,
          commandExitSignal: signal,
          commandOutput: output,
          errOutput,
        });
        resolve(output);
      });
    });
  }
}
