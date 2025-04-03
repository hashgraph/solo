// SPDX-License-Identifier: Apache-2.0

import {type LocalConfig} from './config/local/local-config.js';
import {type DeploymentName} from './config/remote/types.js';
import {type ConfigManager} from './config-manager.js';
import {Flags as flags} from '../commands/flags.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type SoloListrTaskWrapper} from '../types/index.js';
import {input as inputPrompt} from '@inquirer/prompts';
import {SoloError} from './errors/solo-error.js';
import {type AnyListrContext} from '../types/aliases.js';

export async function resolveNamespaceFromDeployment(
  localConfig: LocalConfig,
  configManager: ConfigManager,
  task?: SoloListrTaskWrapper<AnyListrContext>,
): Promise<NamespaceName> {
  const deploymentName: DeploymentName = await promptTheUserForDeployment(configManager, task);

  if (!localConfig.deployments.hasOwnProperty(deploymentName)) {
    throw new SoloError(
      `deployment ${deploymentName}, is missing from deployments: ${JSON.stringify(localConfig.deployments)}`,
    );
  }

  return NamespaceName.of(localConfig.deployments[deploymentName].namespace);
}

export async function promptTheUserForDeployment(
  configManager: ConfigManager,
  task?: SoloListrTaskWrapper<AnyListrContext>,
): Promise<DeploymentName> {
  if (configManager.getFlag(flags.deployment)) {
    return configManager.getFlag<DeploymentName>(flags.deployment);
  }

  if (task) {
    await configManager.executePrompt(task, [flags.deployment]);
  } else {
    const isQuiet = configManager.getFlag<boolean>(flags.quiet);
    const isForced = configManager.getFlag<boolean>(flags.force);

    // if the quiet or forced flag is passed don't prompt the user
    if (isQuiet === true || isForced === true) {
      throw new SoloError('deployment is required');
    }

    const answer = await inputPrompt({
      message: 'Enter the name of the deployment:',
      validate: (value: string) => !!value,
    });

    configManager.setFlag(flags.deployment, answer);
  }

  const deploymentName = configManager.getFlag<DeploymentName>(flags.deployment);

  if (!deploymentName) {
    throw new SoloError('deployment is required');
  }

  return deploymentName;
}
