// SPDX-License-Identifier: Apache-2.0

import {type DeploymentName} from './../types/index.js';
import {type ConfigManager} from './config-manager.js';
import {Flags as flags} from '../commands/flags.js';
import {FlagValidation} from '../commands/validation/flag-validation.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type SoloListrTaskWrapper} from '../types/index.js';
import {input as inputPrompt, select as selectPrompt} from '@inquirer/prompts';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {SoloErrors} from './errors/solo-errors.js';
import {type AnyListrContext} from '../types/aliases.js';
import {type LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type Deployment} from '../business/runtime-state/config/local/deployment.js';
import {type StringFacade} from '../business/runtime-state/facade/string-facade.js';

export class Resolvers {
  public static async resolveNamespaceFromDeployment(
    localConfig: LocalConfigRuntimeState,
    configManager: ConfigManager,
    task?: SoloListrTaskWrapper<AnyListrContext>,
  ): Promise<NamespaceName> {
    const deploymentName: DeploymentName = await Resolvers.promptTheUserForDeployment(configManager, task, localConfig);
    try {
      return NamespaceName.of(localConfig.configuration.deploymentByName(deploymentName).namespace);
    } catch {
      const namespaceFromFlag: NamespaceName | string | undefined = configManager.getFlag(flags.namespace);
      if (namespaceFromFlag) {
        return typeof namespaceFromFlag === 'string' ? NamespaceName.of(namespaceFromFlag) : namespaceFromFlag;
      }
      throw new SoloErrors.deployment.notFound(
        `Deployment ${deploymentName} not found in local config and no --namespace provided`,
      );
    }
  }

  public static async promptTheUserForDeployment(
    configManager: ConfigManager,
    task?: SoloListrTaskWrapper<AnyListrContext>,
    localConfig?: LocalConfigRuntimeState,
  ): Promise<DeploymentName> {
    if (configManager.getFlag(flags.deployment)) {
      return configManager.getFlag<DeploymentName>(flags.deployment);
    }

    // Prefer presenting the deployments found in local config as a selectable list.
    const deploymentChoices: {name: string; value: string}[] = localConfig
      ? Resolvers.buildDeploymentChoices(localConfig)
      : [];

    if (deploymentChoices.length > 0) {
      // A single deployment can be selected automatically without prompting.
      if (deploymentChoices.length === 1) {
        configManager.setFlag(flags.deployment, deploymentChoices[0].value);
      } else {
        const isQuiet: boolean = configManager.getFlag<boolean>(flags.quiet);
        const isForced: boolean = configManager.getFlag<boolean>(flags.force);

        // if the quiet or forced flag is passed don't prompt the user
        if (isQuiet !== true && isForced !== true) {
          const selectedDeployment: string = task
            ? ((await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                message: 'Select deployment:',
                choices: deploymentChoices,
              })) as string)
            : await selectPrompt({message: 'Select deployment:', choices: deploymentChoices});

          configManager.setFlag(flags.deployment, selectedDeployment);
        }
      }
    } else if (task) {
      await configManager.executePrompt(task, [flags.deployment]);
    } else {
      const isQuiet: boolean = configManager.getFlag(flags.quiet);
      const isForced: boolean = configManager.getFlag(flags.force);

      // if the quiet or forced flag is passed don't prompt the user
      if (isQuiet === true || isForced === true) {
        throw new SoloErrors.validation.missingArgument('deployment is required');
      }

      const answer: string = await inputPrompt({
        message: 'Enter the name of the deployment:',
        // Applies the same rules the flag declares, so a name typed here is held to what
        // `--deployment` would accept rather than only being checked for emptiness.
        validate: (value: string): boolean | string =>
          !!value && (FlagValidation.violationOf(flags.deployment, value) ?? true),
      });

      configManager.setFlag(flags.deployment, answer);
    }

    const deploymentName: DeploymentName = configManager.getFlag<DeploymentName>(flags.deployment);

    if (!deploymentName) {
      throw new SoloErrors.validation.missingArgument('deployment is required');
    }

    return deploymentName;
  }

  /**
   * Builds the list of deployment choices from local config, labelling each with its namespace and clusters.
   */
  private static buildDeploymentChoices(localConfig: LocalConfigRuntimeState): {name: string; value: string}[] {
    const deployments: Deployment[] = [];
    if (localConfig.configuration.deployments) {
      for (const deployment of localConfig.configuration.deployments) {
        deployments.push(deployment);
      }
    }

    return deployments.map((deployment: Deployment): {name: string; value: string} => {
      const clusterNames: string[] = deployment.clusters.map((cluster: StringFacade): string => cluster.toString());
      return {
        name: `${deployment.name} (ns: ${deployment.namespace}, clusters: ${clusterNames.join(', ') || 'unknown'})`,
        value: deployment.name,
      };
    });
  }
}

export const resolveNamespaceFromDeployment: typeof Resolvers.resolveNamespaceFromDeployment =
  Resolvers.resolveNamespaceFromDeployment;

export const promptTheUserForDeployment: typeof Resolvers.promptTheUserForDeployment =
  Resolvers.promptTheUserForDeployment;
