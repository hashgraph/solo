/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { spawn } from 'child_process'
import chalk from 'chalk'
import {type SoloLogger} from "./logging";

export class ShellRunner {
  constructor (public logger: SoloLogger) {
    if (!logger) throw new Error('An instance of core/SoloLogger is required')
  }

  /** Returns a promise that invokes the shell command */
  run (cmd: string, verbose = false) {
    const callStack = new Error().stack // capture the callstack to be included in error
    this.logger.debug(`Executing command: '${cmd}'`)

    return new Promise<string[]>((resolve, reject) => {
      const child = spawn(cmd, {
        shell: true
      })

      const output: string[] = []
      child.stdout.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/)
        items.forEach(item => {
          if (item) {
            output.push(item)
          }
        })
      })

      const errOutput: string[] = []
      child.stderr.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/)
        items.forEach(item => {
          if (item) {
            errOutput.push(item.trim())
          }
        })
      })

      child.on('exit', (code, signal) => {
        if (code) {
          const err = new Error(`Command exit with error code ${code}: ${cmd}`)

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          err.stack = callStack

          if (verbose) {
            errOutput.forEach(m => this.logger.showUser(chalk.red(m)))
          }

          this.logger.error(`Error executing: '${cmd}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput,
            error: { message: err.message, stack: err.stack }
          })

          reject(err)
        }

        this.logger.debug(`Finished executing: '${cmd}'`, {
          commandExitCode: code,
          commandExitSignal: signal,
          commandOutput: output,
          errOutput
        })
        resolve(output)
      })
    })
  }
}
