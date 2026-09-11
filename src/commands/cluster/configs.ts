// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {UserBreak} from '../../core/errors/user-break.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type ChartManager} from '../../core/chart-manager.js';
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
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';

@injectable()
export class ClusterCommandConfigs {
  private static readonly CONNECT_CONFIGS_NAME: string = 'connectConfig';
  private static readonly DEFAULT_CONFIGS_NAME: string = 'defaultConfig';

  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  public async connectConfigBuilder(
    argv: ArgvStruct,
    context_: ClusterReferenceConnectContext,
    task: SoloListrTaskWrapper<ClusterReferenceConnectContext>,
  ): Promise<ClusterReferenceConnectConfigClass> {
    this.configManager.update(argv);

    // Apply changes to argv[context] before the config is initiated, because the `context` field is immutable
    if (!this.configManager.getFlag(flags.context)) {
      const isQuiet: boolean = this.configManager.getFlag<boolean>(flags.quiet) === true;
      if (isQuiet) {
        argv[flags.context.name] = this.k8Factory.default().contexts().readCurrent();
      } else {
        const kubeContexts: string[] = this.k8Factory.default().contexts().list();
        argv[flags.context.name] = await flags.context.prompt(
          task,
          kubeContexts,
          this.configManager.getFlag(flags.clusterRef),
        );
      }

      this.configManager.update(argv);
    }

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
    this.configManager.update(argv);
    flags.disablePrompts([flags.chartDirectory]);

    await this.configManager.executePrompt(task, [
      flags.chartDirectory,
      flags.clusterSetupNamespace,
      flags.deployGrafanaAlloy,
      flags.deployMinio,
      flags.deployPrometheusStack,
    ]);

    const config: ClusterReferenceSetupConfigClass = {
      chartDirectory: this.configManager.getFlag(flags.chartDirectory),
      clusterSetupNamespace: this.configManager.getFlag(flags.clusterSetupNamespace),
      deployGrafanaAlloy: this.configManager.getFlag(flags.deployGrafanaAlloy),
      deployMinio: this.configManager.getFlag(flags.deployMinio),
      deployMetricsServer: this.configManager.getFlag(flags.deployMetricsServer),
      deployPrometheusStack: this.configManager.getFlag(flags.deployPrometheusStack),
      soloChartVersion: this.configManager.getFlag(flags.soloChartVersion),
      clusterRef: this.configManager.getFlag(flags.clusterRef),
    } as ClusterReferenceSetupConfigClass;

    config.context =
      this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
      this.k8Factory.default().contexts().readCurrent();

    context_.config = config;

    return context_.config;
  }

  public async resetConfigBuilder(
    argv: ArgvStruct,
    context_: ClusterReferenceResetContext,
    task: SoloListrTaskWrapper<ClusterReferenceResetContext>,
  ): Promise<ClusterReferenceResetConfigClass> {
    this.configManager.update(argv);

    if (!this.configManager.getFlag<boolean>(flags.force)) {
      const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
        default: false,
        message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
      });

      if (!confirmResult) {
        throw new UserBreak('Aborted application by user prompt');
      }
    }

    context_.config = {
      clusterReference: this.configManager.getFlag(flags.clusterRef),
      clusterSetupNamespace: this.configManager.getFlag(flags.clusterSetupNamespace),
    } as ClusterReferenceResetConfigClass;

    context_.config.clusterReference ??= this.k8Factory.default().clusters().readCurrent();

    context_.config.context = this.localConfig.configuration.clusterRefs
      .get(context_.config.clusterReference)
      ?.toString();

    if (!context_.config.context) {
      throw new Error(`Cluster "${context_.config.clusterReference}" not found in the LocalConfig`);
    }

    return context_.config;
  }
}
