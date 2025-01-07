/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {Flags as flags} from '../flags.js';
import type {K8} from '../../core/k8.js';
import type {SoloListrTaskWrapper} from '../../types/index.js';
import type {LocalConfig} from '../../core/config/local_config.js';

export async function promptForContext(task: SoloListrTaskWrapper<any>, cluster: string, k8: K8) {
  const kubeContexts = k8.getContexts();
  return flags.context.prompt(
    task,
    kubeContexts.map(c => c.name),
    cluster,
  );
}

export async function getSelectedContext(
  task: SoloListrTaskWrapper<any>,
  selectedCluster: string,
  localConfig: LocalConfig,
  isQuiet: boolean,
  k8: K8,
) {
  let selectedContext;
  if (isQuiet) {
    selectedContext = k8.getKubeConfig().getCurrentContext();
  } else {
    selectedContext = await promptForContext(task, selectedCluster, k8);
    localConfig.clusterContextMapping[selectedCluster] = selectedContext;
  }
  return selectedContext;
}

export async function selectContextForFirstCluster(
  task: SoloListrTaskWrapper<any>,
  clusters: string[],
  localConfig: LocalConfig,
  isQuiet: boolean,
  k8: K8,
) {
  const selectedCluster = clusters[0];

  if (localConfig.clusterContextMapping[selectedCluster]) {
    return localConfig.clusterContextMapping[selectedCluster];
  }

  // If a cluster does not exist in LocalConfig mapping prompt the user to select a context or use the current one
  else {
    return getSelectedContext(task, selectedCluster, localConfig, isQuiet, k8);
  }
}
