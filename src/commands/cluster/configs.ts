// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {UserBreak} from '../../core/errors/user-break.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type NamespaceName} from '../../integration/kube/resources/namespace/namespace-name.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type SoloLogger} from '../../core/logging.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type LocalConfig} from '../../core/config/local/local-config.js';
import {type ArgvStruct} from '../../types/aliases.js';
import {type SoloListrTaskWrapper} from '../../types/index.js';
import {type ClusterRefDefaultConfigClass} from './config-interfaces/cluster-ref-default-config-class.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ClusterRefResetContext} from './config-interfaces/cluster-ref-reset-context.js';
import {type ClusterRefConnectContext} from './config-interfaces/cluster-ref-connect-context.js';
import {type ClusterRefConnectConfigClass} from './config-interfaces/cluster-ref-connect-config-class.js';
import {type ClusterRefDefaultContext} from './config-interfaces/cluster-ref-default-context.js';
import {type ClusterRefSetupContext} from './config-interfaces/cluster-ref-setup-context.js';
import {type ClusterRefSetupConfigClass} from './config-interfaces/cluster-ref-setup-config-class.js';
import {type ClusterRefResetConfigClass} from './config-interfaces/cluster-ref-reset-config-class.js';
import {type ClusterRef} from '../../core/config/remote/types.js';

@injectable()
export class ClusterCommandConfigs {
  private static readonly CONNECT_CONFIGS_NAME = 'connectConfig';
  private static readonly DEFAULT_CONFIGS_NAME = 'defaultConfig';

  constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  public async connectConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterRefConnectContext,
    task: SoloListrTaskWrapper<ClusterRefConnectContext>,
  ): Promise<ClusterRefConnectConfigClass> {
    // Apply changes to argv[context] before the config is initiated, because the `context` field is immutable
    if (!argv[flags.context.name]) {
      const isQuiet = this.configManager.getFlag(flags.quiet);
      if (isQuiet) {
        argv[flags.context.name] = this.k8Factory.default().contexts().readCurrent();
      } else {
        const kubeContexts = this.k8Factory.default().contexts().list();
        argv[flags.context.name] = await flags.context.prompt(task, kubeContexts, argv[flags.clusterRef.name]);
      }
    }

    this.configManager.update(argv);
    ctx.config = this.configManager.getConfig(
      ClusterCommandConfigs.CONNECT_CONFIGS_NAME,
      argv.flags,
      [],
    ) as ClusterRefConnectConfigClass;
    return ctx.config;
  }

  public async defaultConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterRefDefaultContext,
  ): Promise<ClusterRefDefaultConfigClass> {
    this.configManager.update(argv);

    ctx.config = this.configManager.getConfig(
      ClusterCommandConfigs.DEFAULT_CONFIGS_NAME,
      argv.flags,
      [],
    ) as ClusterRefDefaultConfigClass;

    return ctx.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterRefSetupContext,
    task: SoloListrTaskWrapper<ClusterRefSetupContext>,
  ): Promise<ClusterRefSetupConfigClass> {
    const configManager = this.configManager;
    configManager.update(argv);
    flags.disablePrompts([flags.chartDirectory]);

    await configManager.executePrompt(task, [
      flags.chartDirectory,
      flags.clusterSetupNamespace,
      flags.deployMinio,
      flags.deployPrometheusStack,
    ]);

    ctx.config = {
      chartDirectory: configManager.getFlag(flags.chartDirectory),
      clusterSetupNamespace: configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace),
      deployMinio: configManager.getFlag<boolean>(flags.deployMinio),
      deployPrometheusStack: configManager.getFlag<boolean>(flags.deployPrometheusStack),
      soloChartVersion: configManager.getFlag(flags.soloChartVersion),
      clusterRef: configManager.getFlag<ClusterRef>(flags.clusterRef),
    } as ClusterRefSetupConfigClass;

    this.logger.debug('Prepare ctx.config', {config: ctx.config, argv});

    ctx.isChartInstalled = await this.chartManager.isChartInstalled(
      ctx.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );

    ctx.config.context =
      this.localConfig.clusterRefs[ctx.config.clusterRef] ?? this.k8Factory.default().contexts().readCurrent();

    return ctx.config;
  }

  public async resetConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterRefResetContext,
    task: SoloListrTaskWrapper<ClusterRefResetContext>,
  ): Promise<ClusterRefResetConfigClass> {
    if (!argv[flags.force.name]) {
      const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
        default: false,
        message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
      });

      if (!confirmResult) {
        throw new UserBreak('Aborted application by user prompt');
      }
    }

    this.configManager.update(argv);

    ctx.config = {
      clusterName: this.configManager.getFlag(flags.clusterRef),
      clusterSetupNamespace: this.configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace),
    } as ClusterRefResetConfigClass;

    ctx.isChartInstalled = await this.chartManager.isChartInstalled(
      ctx.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );
    if (!ctx.isChartInstalled) {
      throw new SoloError('No chart found for the cluster');
    }

    return ctx.config;
  }
}
