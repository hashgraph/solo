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
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type LocalConfig} from '../../core/config/local/local-config.js';
import {type ArgvStruct} from '../../types/aliases.js';
import {type SoloListrTaskWrapper} from '../../types/index.js';
import {type ClusterReferenceDefaultConfigClass} from './config-interfaces/cluster-reference-default-config-class.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ClusterReferenceResetContext} from './config-interfaces/cluster-reference-reset-context.js';
import {type ClusterReferenceConnectContext} from './config-interfaces/cluster-reference-connect-context.js';
import {type ClusterReferenceConnectConfigClass} from './config-interfaces/cluster-reference-connect-config-class.js';
import {type ClusterReferenceDefaultContext} from './config-interfaces/cluster-reference-default-context.js';
import {type ClusterReferenceSetupContext} from './config-interfaces/cluster-reference-setup-context.js';
import {type ClusterReferenceSetupConfigClass} from './config-interfaces/cluster-reference-setup-config-class.js';
import {type ClusterReferenceResetConfigClass} from './config-interfaces/cluster-reference-reset-config-class.js';
import {type ClusterReference} from '../../core/config/remote/types.js';

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
    context_: ClusterReferenceConnectContext,
    task: SoloListrTaskWrapper<ClusterReferenceConnectContext>,
  ): Promise<ClusterReferenceConnectConfigClass> {
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
    context_.config = this.configManager.getConfig(
      ClusterCommandConfigs.CONNECT_CONFIGS_NAME,
      argv.flags,
      [],
    ) as ClusterReferenceConnectConfigClass;
    return context_.config;
  }

  public async defaultConfigBuilder(
    argv: ArgvStruct,
    context_: ClusterReferenceDefaultContext,
  ): Promise<ClusterReferenceDefaultConfigClass> {
    this.configManager.update(argv);

    context_.config = this.configManager.getConfig(
      ClusterCommandConfigs.DEFAULT_CONFIGS_NAME,
      argv.flags,
      [],
    ) as ClusterReferenceDefaultConfigClass;

    return context_.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    context_: ClusterReferenceSetupContext,
    task: SoloListrTaskWrapper<ClusterReferenceSetupContext>,
  ): Promise<ClusterReferenceSetupConfigClass> {
    const configManager = this.configManager;
    configManager.update(argv);
    flags.disablePrompts([flags.chartDirectory]);

    await configManager.executePrompt(task, [
      flags.chartDirectory,
      flags.clusterSetupNamespace,
      flags.deployMinio,
      flags.deployPrometheusStack,
    ]);

    context_.config = {
      chartDirectory: configManager.getFlag(flags.chartDirectory),
      clusterSetupNamespace: configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace),
      deployMinio: configManager.getFlag<boolean>(flags.deployMinio),
      deployPrometheusStack: configManager.getFlag<boolean>(flags.deployPrometheusStack),
      soloChartVersion: configManager.getFlag(flags.soloChartVersion),
      clusterRef: configManager.getFlag<ClusterReference>(flags.clusterRef),
    } as ClusterReferenceSetupConfigClass;

    this.logger.debug('Prepare ctx.config', {config: context_.config, argv});

    context_.isChartInstalled = await this.chartManager.isChartInstalled(
      context_.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );

    context_.config.context =
      this.localConfig.clusterRefs[context_.config.clusterRef] ?? this.k8Factory.default().contexts().readCurrent();

    return context_.config;
  }

  public async resetConfigBuilder(
    argv: ArgvStruct,
    context_: ClusterReferenceResetContext,
    task: SoloListrTaskWrapper<ClusterReferenceResetContext>,
  ): Promise<ClusterReferenceResetConfigClass> {
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

    context_.config = {
      clusterName: this.configManager.getFlag(flags.clusterRef),
      clusterSetupNamespace: this.configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace),
    } as ClusterReferenceResetConfigClass;

    context_.isChartInstalled = await this.chartManager.isChartInstalled(
      context_.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );
    if (!context_.isChartInstalled) {
      throw new SoloError('No chart found for the cluster');
    }

    return context_.config;
  }
}
