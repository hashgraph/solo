/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {IsEmail, IsNotEmpty, IsObject, IsString, validateSync} from 'class-validator';
import fs from 'fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../commands/flags.js';
import {type Deployments, type LocalConfigData} from './local_config_data.js';
import {MissingArgumentError, SoloError} from '../errors.js';
import {type SoloLogger} from '../logging.js';
import {IsClusterRefs, IsDeployments} from '../validator_decorators.js';
import {type ConfigManager} from '../config_manager.js';
import {type DeploymentName, type EmailAddress, type Version, type ClusterRefs} from './remote/types.js';
import {ErrorMessages} from '../error_messages.js';
import {type K8Factory} from '../kube/k8_factory.js';
import * as helpers from '../helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency_injection/container_helper.js';
import {type SoloListrTask} from '../../types/index.js';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../dependency_injection/inject_tokens.js';

@injectable()
export class LocalConfig implements LocalConfigData {
  @IsEmail(
    {},
    {
      message: ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL,
    },
  )
  userEmailAddress: EmailAddress;

  @IsString({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  @IsNotEmpty({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  soloVersion: Version;

  // The string is the name of the deployment, will be used as the namespace,
  // so it needs to be available in all targeted clusters
  @IsDeployments({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  @IsNotEmpty()
  @IsObject({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  public deployments: Deployments;

  @IsClusterRefs({
    message: ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT,
  })
  @IsNotEmpty()
  public clusterRefs: ClusterRefs = {};

  private readonly skipPromptTask: boolean = false;

  public constructor(
    @inject(InjectTokens.LocalConfigFilePath) private readonly filePath?: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.filePath = patchInject(filePath, InjectTokens.LocalConfigFilePath, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);

    if (!this.filePath || this.filePath === '') throw new MissingArgumentError('a valid filePath is required');

    const allowedKeys = ['userEmailAddress', 'deployments', 'clusterRefs', 'soloVersion'];
    if (this.configFileExists()) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedConfig = yaml.parse(fileContent);

      for (const key in parsedConfig) {
        if (!allowedKeys.includes(key)) {
          throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
        }
        this[key] = parsedConfig[key];
      }

      this.validate();
      this.skipPromptTask = true;
    }
  }

  private validate(): void {
    const errors = validateSync(this, {});

    if (errors.length) {
      // throw the first error:
      const prop = Object.keys(errors[0]?.constraints);
      if (prop[0]) {
        throw new SoloError(errors[0].constraints[prop[0]]);
      } else {
        throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
      }
    }
  }

  public setUserEmailAddress(emailAddress: EmailAddress): this {
    this.userEmailAddress = emailAddress;
    this.validate();
    return this;
  }

  public setDeployments(deployments: Deployments): this {
    this.deployments = deployments;
    this.validate();
    return this;
  }

  public setClusterRefs(clusterRefs: ClusterRefs): this {
    this.clusterRefs = clusterRefs;
    this.validate();
    return this;
  }

  public setSoloVersion(version: Version): this {
    this.soloVersion = version;
    this.validate();
    return this;
  }

  public configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public async write(): Promise<void> {
    const yamlContent = yaml.stringify({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      clusterRefs: this.clusterRefs,
      soloVersion: this.soloVersion,
    });
    console.log(`yamlContent = ${yamlContent}`);
    await fs.promises.writeFile(this.filePath, yamlContent);

    this.logger.info(`Wrote local config to ${this.filePath}: ${yamlContent}`);
  }

  public promptLocalConfigTask(k8Factory: K8Factory): SoloListrTask<any> {
    const self = this;

    return {
      title: 'Prompt local configuration',
      skip: this.skipPromptTask,
      task: async (_, task): Promise<void> => {
        if (self.configFileExists()) {
          self.configManager.setFlag(flags.userEmailAddress, self.userEmailAddress);
        }

        const isQuiet = self.configManager.getFlag<boolean>(flags.quiet);
        const contexts = self.configManager.getFlag<string>(flags.context);
        const deploymentName = self.configManager.getFlag<DeploymentName>(flags.deployment);
        const namespace = self.configManager.getFlag<NamespaceName>(flags.namespace);
        let userEmailAddress = self.configManager.getFlag<EmailAddress>(flags.userEmailAddress);
        let deploymentClusters: string = self.configManager.getFlag<string>(flags.deploymentClusters);

        if (!userEmailAddress) {
          if (isQuiet) throw new SoloError(ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL);
          userEmailAddress = await flags.userEmailAddress.prompt(task, userEmailAddress);
          self.configManager.setFlag(flags.userEmailAddress, userEmailAddress);
        }

        if (!deploymentName) throw new SoloError('Deployment name was not specified');

        if (!deploymentClusters) {
          if (isQuiet) {
            deploymentClusters = k8Factory.default().clusters().readCurrent();
          } else {
            deploymentClusters = await flags.deploymentClusters.prompt(task, deploymentClusters);
          }
          self.configManager.setFlag(flags.deploymentClusters, deploymentClusters);
        }

        const parsedClusterRefs = helpers.splitFlagInput(deploymentClusters);

        const deployments: Deployments = {
          [deploymentName]: {
            clusters: parsedClusterRefs,
            namespace: namespace.name,
          },
        };

        const parsedContexts = helpers.splitFlagInput(contexts);

        if (parsedContexts.length < parsedClusterRefs.length) {
          if (!isQuiet) {
            const promptedContexts: string[] = [];
            for (const clusterRef of parsedClusterRefs) {
              const kubeContexts = k8Factory.default().contexts().list();
              const context: string = await flags.context.prompt(task, kubeContexts, clusterRef);
              self.clusterRefs[clusterRef] = context;
              promptedContexts.push(context);

              self.configManager.setFlag(flags.context, context);
            }
            self.configManager.setFlag(flags.context, promptedContexts.join(','));
          } else {
            const context = k8Factory.default().contexts().readCurrent();
            for (const clusterRef of parsedClusterRefs) {
              self.clusterRefs[clusterRef] = context;
            }
            self.configManager.setFlag(flags.context, context);
          }
        } else {
          for (let i = 0; i < parsedClusterRefs.length; i++) {
            const clusterRef = parsedClusterRefs[i];
            self.clusterRefs[clusterRef] = parsedContexts[i];

            self.configManager.setFlag(flags.context, parsedContexts[i]);
          }
        }

        self.userEmailAddress = userEmailAddress;
        self.deployments = deployments;
        self.soloVersion = helpers.getSoloVersion();

        self.validate();
        await self.write();
      },
    };
  }
}
