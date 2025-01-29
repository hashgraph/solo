/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import * as constants from './constants.js';
import {ShellRunner} from './shell_runner.js';
import {Templates} from './templates.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './container_helper.js';

@injectable()
export class Helm extends ShellRunner {
  private readonly helmPath: string;

  constructor(@inject('osPlatform') private readonly osPlatform?: NodeJS.Platform) {
    super();
    this.osPlatform = patchInject(osPlatform, 'osPlatform', this.constructor.name);
    this.helmPath = Templates.installationPath(constants.HELM, this.osPlatform);
  }

  /**
   * Prepare a `helm` shell command string
   * @param action - represents a helm command (e.g. create | install | get )
   * @param args - args of the command
   */
  prepareCommand(action: string, ...args: string[]) {
    let cmd = `${this.helmPath} ${action}`;
    args.forEach(arg => {
      cmd += ` ${arg}`;
    });
    return cmd;
  }

  /**
   * Invoke `helm install` command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  install(...args: string[]) {
    return this.run(this.prepareCommand('install', ...args), true);
  }

  /**
   * Invoke `helm uninstall` command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  uninstall(...args: string[]) {
    return this.run(this.prepareCommand('uninstall', ...args), true);
  }

  /**
   * Invoke `helm upgrade` command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  upgrade(...args: string[]) {
    return this.run(this.prepareCommand('upgrade', ...args), true);
  }

  /**
   * Invoke `helm list` command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  list(...args: string[]) {
    return this.run(this.prepareCommand('list', ...args));
  }

  /**
   * Invoke `helm dependency` command
   * @param subCommand - sub-command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  dependency(subCommand: string, ...args: string[]) {
    return this.run(this.prepareCommand('dependency', subCommand, ...args));
  }

  /**
   * Invoke `helm repo` command
   * @param subCommand - sub-command
   * @param args - args of the command
   * @returns console output as an array of strings
   */
  repo(subCommand: string, ...args: string[]) {
    return this.run(this.prepareCommand('repo', subCommand, ...args));
  }

  /** Get helm version */
  version(args = ['--short']) {
    return this.run(this.prepareCommand('version', ...args));
  }
}
