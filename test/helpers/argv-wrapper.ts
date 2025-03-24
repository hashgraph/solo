// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../../src/commands/flags.js';
import {getTestCacheDir, getTestCluster} from '../test-util.js';
import {K8Client} from '../../src/integration/kube/k8-client/k8-client.js';
import {type NamespaceName} from '../../src/integration/kube/resources/namespace/namespace-name.js';
import {type CommandFlag} from '../../src/types/flag-types.js';
import {type ArgvStruct} from '../../src/types/aliases.js';
import * as helpers from '../../src/core/helpers.js';
import {type CloneTrait} from '../../src/types/traits/clone-trait.js';

export class Argv implements CloneTrait<Argv> {
  private args: Record<string, any> = {};
  public cacheDir?: string;
  public deployment?: string;

  private command?: string;
  private subcommand?: string;

  private constructor() {}

  public setArg(flag: CommandFlag, value: any): void {
    this.args[flag.name] = value;
  }

  public getArg<T>(flag: CommandFlag): T {
    return this.args[flag.name];
  }

  public setCommand(command: string, subcommand?: string): void {
    this.command = command;
    this.subcommand = subcommand;
  }

  public build(): ArgvStruct {
    if (this.getArg<string>(flags.nodeAliasesUnparsed)?.split(',')?.length) {
      const nodeAliases = helpers.parseNodeAliases(this.getArg(flags.nodeAliasesUnparsed));
      this.setArg(flags.numberOfConsensusNodes, nodeAliases.length);
    }

    // @ts-expect-error - TS2322: the '_' field is filled during command invocation for Argv reusability
    const rawArgs: ArgvStruct = helpers.deepClone(this.args);

    const _: string[] = [this.command];
    if (this.subcommand) _.push(this.subcommand);
    rawArgs._ = _;

    return rawArgs;
  }

  public clone() {
    const cloned = new Argv();
    cloned.args = helpers.deepClone(this.args);
    cloned.cacheDir = this.cacheDir;
    cloned.deployment = this.deployment;
    return cloned;
  }

  public static initializeEmpty(): Argv {
    return new Argv();
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
    argv.setArg(flags.clusterRef, getTestCluster());
    argv.setArg(flags.deploymentClusters, [getTestCluster()]);
    argv.setArg(flags.context, new K8Client(undefined).contexts().readCurrent());
    argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
    argv.setArg(flags.userEmailAddress, 'test@test.com');
    argv.setArg(flags.quiet, true);

    return argv;
  }
}
