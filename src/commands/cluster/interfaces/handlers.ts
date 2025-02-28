/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type SoloListrTask} from '../../../types/index.js';
import {type ArgvStruct, type AnyListrContext, type ConfigBuilder} from '../../../types/aliases.js';
import {type ClusterResetContext, type ClusterSetupContext, type SelectClusterContextContext} from '../configs.js';

export interface IClusterCommandTasks {
  getClusterInfo(): SoloListrTask<AnyListrContext>;
  showClusterList(): SoloListrTask<AnyListrContext>;
  acquireNewLease(): SoloListrTask<ClusterResetContext>;
  prepareChartValues(): SoloListrTask<ClusterSetupContext>;
  selectContext(): SoloListrTask<SelectClusterContextContext>;
  updateLocalConfig(): SoloListrTask<SelectClusterContextContext>;
  readClustersFromRemoteConfig(): SoloListrTask<SelectClusterContextContext>;

  installClusterChart(argv: ArgvStruct): SoloListrTask<ClusterSetupContext>;
  uninstallClusterChart(argv: ArgvStruct): SoloListrTask<ClusterResetContext>;

  initialize(argv: ArgvStruct, configInit: ConfigBuilder): SoloListrTask<AnyListrContext>;
}
