// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../../src/commands/flags.js';
import {Helpers} from '../../src/core/helpers.js';
import {getTestCacheDirectory, getTestCluster} from '../test-utility.js';
import {type NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type CommandFlag} from '../../src/types/flag-types.js';
import {type ArgvStruct, type NodeAliases} from '../../src/types/aliases.js';
import {type CloneTrait} from '../../src/types/traits/clone-trait.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type K8Factory} from '../../src/integration/kube/k8-factory.js';

export class Argv implements CloneTrait<Argv> {
  private args: Record<string, any> = {};
  public cacheDir?: string;
  public deployment?: string;

  private command?: string;
  private subcommand?: string;
  private action?: string;

  private constructor() {}

  public setArg(flag: CommandFlag, value: any): void {
    this.args[flag.name] = value;
  }

  public getArg<T = string>(flag: CommandFlag): T {
    return this.args[flag.name];
  }

  public setCommand(command: string, subcommand: string, action: string): void {
    this.command = command;
    this.subcommand = subcommand;
    this.action = action;
  }

  public build(): ArgvStruct {
    if (this.getArg<string>(flags.nodeAliasesUnparsed)?.split(',')?.length) {
      const nodeAliases: NodeAliases = Helpers.parseNodeAliases(this.getArg(flags.nodeAliasesUnparsed));
      this.setArg(flags.numberOfConsensusNodes, nodeAliases.length);
    }

    const rawArguments: ArgvStruct = structuredClone(this.args) as ArgvStruct;

    const _: string[] = [this.command];
    if (this.subcommand) {
      _.push(this.subcommand);
    }
    if (this.action) {
      _.push(this.action);
    }
    rawArguments._ = _;

    return rawArguments;
  }

  public clone(): Argv {
    const cloned: Argv = new Argv();
    cloned.args = structuredClone(this.args);
    cloned.cacheDir = this.cacheDir;
    cloned.deployment = this.deployment;
    return cloned;
  }

  public static initializeEmpty(): Argv {
    return new Argv();
  }

  /** Get argv with defaults */
  public static getDefaultArgv(namespace: NamespaceName, testName?: string): Argv {
    const argv: Argv = new Argv();

    for (const f of flags.allFlags) {
      argv.setArg(f, f.definition.defaultValue);
    }

    // Derive the deployment name from the namespace so each E2E test is isolated to its own
    // deployment. The deployment flag default now falls back to the SOLO_DEPLOYMENT environment
    // variable (set globally in Taskfile.yml), so it can no longer be treated as "unset" here.
    const currentDeployment: string = `${namespace?.name || argv.getArg<NamespaceName>(flags.namespace)}-deployment`;
    const cacheDirectory: string = getTestCacheDirectory(testName);
    argv.cacheDir = cacheDirectory;
    argv.setArg(flags.cacheDir, cacheDirectory);
    argv.deployment = currentDeployment;
    argv.setArg(flags.deployment, currentDeployment);
    argv.setArg(flags.clusterRef, getTestCluster());
    argv.setArg(flags.deploymentClusters, [getTestCluster()]);

    const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
    argv.setArg(flags.context, k8Factory.default().contexts().readCurrent());
    argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
    argv.setArg(flags.quiet, true);

    return argv;
  }
}
