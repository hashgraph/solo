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
'use strict'
import os from 'os'
import { constants } from './index.mjs'
import { ShellRunner } from './shell_runner.mjs'
import { Templates } from './templates.mjs'
import { MissingArgumentError } from './errors.mjs'

export class Keytool extends ShellRunner {
  /**
   * @param {SoloLogger} logger
   * @param {NodeJS.Platform} [osPlatform]
   */
  constructor (logger, osPlatform = os.platform()) {
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required', logger)
    super(logger)
    this.osPlatform = osPlatform
    this.keytoolPath = Templates.installationPath(constants.KEYTOOL, this.osPlatform)
  }

  /**
   * Prepare a `keytool` shell command string
   * @param {string} action - represents a helm command (e.g. create | install | get )
   * @param {string} args - args of the command
   * @returns {string}
   */
  prepareCommand (action, ...args) {
    let cmd = `${this.keytoolPath} ${action}`
    args.forEach(arg => {
      cmd += ` ${arg}`
    })
    return cmd
  }

  /**
   * Invoke `keytool -genkeypair` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  genKeyPair (...args) {
    return this.run(this.prepareCommand('-genkeypair', ...args), true)
  }

  /**
   * Invoke `keytool -certreq` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  certReq (...args) {
    return this.run(this.prepareCommand('-certreq', ...args), true)
  }

  /**
   * Invoke `keytool -gencert` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  genCert (...args) {
    return this.run(this.prepareCommand('-gencert', ...args), true)
  }

  /**
   * Invoke `keytool -importcert` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  importCert (...args) {
    return this.run(this.prepareCommand('-importcert', ...args), true)
  }

  /**
   * Invoke `keytool -exportcert` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  exportCert (...args) {
    return this.run(this.prepareCommand('-exportcert', ...args), true)
  }

  /**
   * Invoke `keytool -list` command
   * @param {string} args - args of the command
   * @returns {Promise<Array>} console output as an array of strings
   */
  list (...args) {
    return this.run(this.prepareCommand('-list', ...args), true)
  }
}
