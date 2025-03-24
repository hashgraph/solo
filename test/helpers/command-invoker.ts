// SPDX-License-Identifier: Apache-2.0

import {Middlewares} from '../../src/core/middlewares.js';
import {Flags as flags} from '../../src/commands/flags.js';
import {type RemoteConfigManager} from '../../src/core/config/remote/remote-config-manager.js';
import {type AnyObject, type ArgvStruct} from '../../src/types/aliases.js';
import {type Argv} from './argv-wrapper.js';
import {type ConfigManager} from '../../src/core/config-manager.js';
import {type SoloLogger} from '../../src/core/logging.js';
import {type K8Factory} from '../../src/core/kube/k8-factory.js';
import {resetTestContainer} from '../test-container.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';

export class CommandInvoker {
  private readonly middlewares: Middlewares;
  private readonly remoteConfigManager: RemoteConfigManager;
  private readonly configManager: ConfigManager;
  private readonly k8Factory: K8Factory;

  public constructor(opts: {
    configManager: ConfigManager;
    remoteConfigManager: RemoteConfigManager;
    k8Factory: K8Factory;
    logger: SoloLogger;
  }) {
    resetTestContainer(undefined, undefined, {
      ConfigManager: opts.configManager,
      RemoteConfigManager: opts.remoteConfigManager,
      K8Factory: opts.k8Factory,
      SoloLogger: opts.logger,
    });

    this.middlewares = container.resolve(InjectTokens.Middlewares);
  }

  public async invoke({
    callback,
    argv,
    command,
    subcommand,
  }: {
    callback: (argv: ArgvStruct) => Promise<boolean>;
    argv: Argv;
    command: string;
    subcommand?: string;
  }): Promise<void> {
    // unload the remote config from the manager
    this.remoteConfigManager.unload();

    if (!argv.getArg<string>(flags.context)) {
      argv.setArg(flags.context, this.k8Factory.default().contexts().readCurrent());
    }

    const middlewares: ((Argv: ArgvStruct) => Promise<boolean | AnyObject>)[] = [
      this.updateConfigManager(),

      // Loads the remote config if needed
      this.middlewares.loadRemoteConfig(),
    ];

    argv.setCommand(command, subcommand);

    for (const executable of middlewares) {
      await executable(argv.build());
    }

    await callback(argv.build());
  }

  private updateConfigManager() {
    const self = this;

    return async (argv: ArgvStruct): Promise<AnyObject> => {
      self.configManager.update(argv);
      return argv;
    };
  }
}
