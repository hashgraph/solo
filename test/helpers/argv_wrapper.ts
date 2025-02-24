/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Flags as flags} from '../../src/commands/flags.js';
import {getTestCacheDir} from '../test_util.js';
import {K8Client} from '../../src/core/kube/k8_client/k8_client.js';
import {type NamespaceName} from '../../src/core/kube/resources/namespace/namespace_name.js';
import {type CommandFlag} from '../../src/types/flag_types.js';
import {type AnyObject} from '../../src/types/aliases.js';
import * as helpers from '../../src/core/helpers.js';

export class Argv {
  // @ts-expect-error - TS2344: Type CommandFlag does not satisfy the constraint string | number | symbol
  private args: Record<CommandFlag, any> = {};
  public cacheDir?: string;
  public deployment?: string;

  private constructor() {}

  public setArg(flag: CommandFlag, value: any): void {
    this.args[flag.name] = value;
  }

  public getArg<T>(flag: CommandFlag): T {
    return this.args[flag.name];
  }

  public build(): AnyObject {
    return helpers.deepClone(this.args);
  }

  public static initializeEmpty(): Argv {
    return new Argv();
  }

  public clone(): Argv {
    const cloned = new Argv();
    cloned.args = helpers.deepClone(this.args);
    cloned.cacheDir = this.cacheDir;
    cloned.deployment = this.deployment;
    return cloned;
  }

  /** Get argv with defaults */
  public static getDefaultArgv(namespace: NamespaceName) {
    const argv = new Argv();

    for (const f of flags.allFlags) {
      argv.setArg(f, f.definition.defaultValue);
    }

    const currentDeployment =
      argv.getArg<string>(flags.deployment) ||
      `${namespace?.name || argv.getArg<NamespaceName>(flags.namespace)}-deployment`;
    const cacheDir = getTestCacheDir();
    argv.cacheDir = cacheDir;
    argv.setArg(flags.cacheDir, cacheDir);
    argv.deployment = currentDeployment;
    argv.setArg(flags.deployment, currentDeployment);
    argv.setArg(flags.clusterRef, 'cluster-1');
    argv.setArg(flags.deploymentClusters, ['cluster-1']);
    argv.setArg(flags.context, new K8Client(undefined).contexts().readCurrent());
    return argv;
  }
}
