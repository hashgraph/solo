/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyArgv, type AnyListrContext, type ConfigBuilder} from '../../../types/aliases.js';
import {type ClusterResetContext, type ClusterSetupContext, type SelectClusterContextContext} from '../configs.js';

export interface IClusterCommandTasks {
  getClusterInfo(): SoloListrTask<AnyListrContext>;
  showClusterList(): SoloListrTask<AnyListrContext>;
  acquireNewLease(): SoloListrTask<ClusterResetContext>;
  prepareChartValues(): SoloListrTask<ClusterSetupContext>;
  selectContext(): SoloListrTask<SelectClusterContextContext>;
  updateLocalConfig(): SoloListrTask<SelectClusterContextContext>;
  readClustersFromRemoteConfig(): SoloListrTask<SelectClusterContextContext>;

  installClusterChart(argv: AnyArgv): SoloListrTask<ClusterSetupContext>;
  uninstallClusterChart(argv: AnyArgv): SoloListrTask<ClusterResetContext>;

  initialize(argv: AnyArgv, configInit: ConfigBuilder): SoloListrTask<AnyListrContext>;
}
