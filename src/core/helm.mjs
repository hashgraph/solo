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
import os from 'os'
import { constants } from './index.mjs'
import { ShellRunner } from './shell_runner.mjs'
import { Templates } from './templates.mjs'
import { IllegalArgumentError } from './errors.mjs'

export class Helm extends ShellRunner {
  constructor (logger, osPlatform = os.platform()) {
    if (!logger) throw new IllegalArgumentError('an instance of core/Logger is required', logger)
    super(logger)
    this.osPlatform = osPlatform
    this.helmPath = Templates.installationPath(constants.HELM, this.osPlatform)
  }

  /**
     * Prepare a `helm` shell command string
     * @param action represents a helm command (e.g. create | install | get )
     * @param args args of the command
     * @returns {string}
     */
  prepareCommand (action, ...args) {
    let cmd = `${this.helmPath} ${action}`
    args.forEach(arg => { cmd += ` ${arg}` })
    return cmd
  }

  /**
     * Invoke `helm install` command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async install (...args) {
    return this.run(this.prepareCommand('install', ...args))
  }

  /**
     * Invoke `helm uninstall` command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async uninstall (...args) {
    return this.run(this.prepareCommand('uninstall', ...args))
  }

  /**
     * Invoke `helm upgrade` command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async upgrade (...args) {
    return this.run(this.prepareCommand('upgrade', ...args))
  }

  /**
     * Invoke `helm list` command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async list (...args) {
    return this.run(this.prepareCommand('list', ...args))
  }

  /**
     * Invoke `helm dependency` command
     * @param subCommand sub-command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async dependency (subCommand, ...args) {
    return this.run(this.prepareCommand('dependency', subCommand, ...args))
  }

  /**
     * Invoke `helm repo` command
     * @param subCommand sub-command
     * @param args args of the command
     * @returns {Promise<Array>} console output as an array of strings
     */
  async repo (subCommand, ...args) {
    return this.run(this.prepareCommand('repo', subCommand, ...args))
  }

  /**
   * Get helm version
   * @return {Promise<Array>}
   */
  async version (args = ['--short']) {
    return this.run(this.prepareCommand('version', ...args))
  }
}
