/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type LocalConfig} from './config/local_config.js';
import {type ListrTaskWrapper} from 'listr2';
import {type DeploymentName} from './config/remote/types.js';
import {type ConfigManager} from './config_manager.js';
import {Flags as flags} from '../commands/flags.js';
import {NamespaceName} from './kube/resources/namespace/namespace_name.js';

export async function resolveNamespaceFromDeployment(
  localConfig: LocalConfig,
  configManager: ConfigManager,
  task: ListrTaskWrapper<any, any, any>,
): Promise<NamespaceName> {
  await configManager.executePrompt(task, [flags.deployment]);
  const deploymentName = configManager.getFlag<DeploymentName>(flags.deployment);
  return NamespaceName.of(localConfig.deployments[deploymentName].namespace);
}
