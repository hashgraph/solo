/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Middlewares} from '../../src/core/middlewares.js';
import {type RemoteConfigManager} from '../../src/core/config/remote/remote_config_manager.js';
import {type AnyArgv, type AnyObject} from '../../src/types/aliases.js';
import {type Argv} from './argv_wrapper.js';
import {type ConfigManager} from '../../src/core/config_manager.js';
import {type SoloLogger} from '../../src/core/logging.js';
import {type K8Factory} from '../../src/core/kube/k8_factory.js';

export class CommandInvoker {
  private readonly middlewares: Middlewares;
  private readonly remoteConfigManager: RemoteConfigManager;
  private readonly configManager: ConfigManager;

  public constructor(opts: {
    configManager: ConfigManager;
    remoteConfigManager: RemoteConfigManager;
    k8Factory: K8Factory;
    logger: SoloLogger;
  }) {
    this.middlewares = new Middlewares(opts as any);
    this.configManager = opts.configManager;
    this.remoteConfigManager = opts.remoteConfigManager;
  }

  public async invoke({
    handler,
    argv,
    command,
    subcommand,
    handlers,
  }: {
    handler: (argv: AnyArgv) => Promise<boolean>;
    argv: Argv;
    command: string;
    subcommand?: string;
    handlers: any,
  }): Promise<void> {
    // unload the remote config from the manager
    this.remoteConfigManager.unload();

    const executables: ((Argv: AnyArgv) => Promise<boolean | AnyObject>)[] = [
      this.updateConfigManager(),

      // Loads the remote config if needed
      this.middlewares.loadRemoteConfig(),

      // Adds the handler to be executed in the end
      handler.bind(handlers),
    ];

    argv.setCommand(command, subcommand);

    for (const executable of executables) {
      await executable(argv.build());
    }
  }

  private updateConfigManager() {
    const self = this;

    return async (argv: AnyArgv): Promise<AnyObject> => {
      self.configManager.update(argv);
      return argv;
    };
  }
}
