// SPDX-License-Identifier: Apache-2.0

import {type ClusterCommandTasks} from './tasks.js';
import {addFlagsToArgv} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {CommandHandler} from '../../core/command-handler.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type ClusterCommandConfigs} from './configs.js';
import {type ArgvStruct} from '../../types/aliases.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';

@injectable()
export class ClusterCommandHandlers extends CommandHandler {
  public constructor(
    @inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.ClusterCommandConfigs) private readonly configs: ClusterCommandConfigs,
  ) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.ClusterCommandConfigs, this.constructor.name);
  }

  /**
   * - Setup home directory.
   * - Create new local config if needed.
   * - Add new 'cluster-ref => context' mapping in the local config.
   */
  public async connect(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.connectConfigBuilder.bind(this.configs)),
        this.tasks.validateClusterRefs(),
        this.tasks.testConnectionToCluster(),
        this.tasks.connectClusterRef(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref config connect',
      null,
      'cluster-ref config connect',
    );

    return true;
  }

  public async disconnect(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.defaultConfigBuilder.bind(this.configs), false),
          this.tasks.disconnectClusterRef(),
        ],
        constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        'cluster-ref config disconnect',
        null,
        'cluster-ref config disconnect',
      );
    } catch (error) {
      throw new SoloErrors.deployment.clusterSetupFailed(error);
    }

    return true;
  }

  public async list(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.showClusterList()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref config list',
      null,
    );

    return true;
  }

  public async info(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.defaultConfigBuilder.bind(this.configs), false),
        this.tasks.getClusterInfo(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref config info',
      null,
    );

    return true;
  }

  /** Starts the container engine (Docker Desktop / Podman machine) and any stopped Kind cluster containers of the configured cluster references. */
  public async stateStart(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.startClusterState()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref state start',
      undefined,
      'cluster-ref state start',
    );

    return true;
  }

  /** Stops the running Kind cluster containers of the configured cluster references. */
  public async stateStop(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.stopClusterState()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref state stop',
      undefined,
      'cluster-ref state stop',
    );

    return true;
  }

  /** Reports the container engine and Kind cluster container state. */
  public async stateInfo(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.showClusterStateInfo()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'cluster-ref state info',
    );

    return true;
  }

  public async setup(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.SETUP_FLAGS);

    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs)),
          this.tasks.installClusterChart(argv),
        ],
        constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        'cluster-ref config setup',
        null,
        'cluster-ref config setup',
      );
    } catch (error) {
      throw new SoloErrors.deployment.clusterSetupFailed(error);
    }

    return true;
  }

  public async reset(argv: ArgvStruct): Promise<boolean> {
    argv = addFlagsToArgv(argv, ContextFlags.RESET_FLAGS);

    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.resetConfigBuilder.bind(this.configs)),
          this.tasks.uninstallClusterChart(argv),
        ],
        constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        'cluster-ref config reset',
        null,
        'cluster-ref config reset',
      );
    } catch (error) {
      throw new SoloErrors.deployment.clusterResetFailed(error);
    }

    return true;
  }
}
