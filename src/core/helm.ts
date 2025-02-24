/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as constants from './constants.js';
import {ShellRunner} from './shell_runner.js';
import {Templates} from './templates.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {type IHelm} from '../types/index.js';

@injectable()
export class Helm extends ShellRunner implements IHelm {
  private readonly helmPath: string;

  constructor(@inject(InjectTokens.OsPlatform) private readonly osPlatform?: NodeJS.Platform) {
    super();
    this.osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, this.constructor.name);
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
