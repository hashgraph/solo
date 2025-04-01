// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import {Listr} from 'listr2';
import * as path from 'node:path';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import {SoloError} from './errors/solo-error.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {Templates} from './templates.js';
import {Flags as flags} from '../commands/flags.js';
import * as Base64 from 'js-base64';
import chalk from 'chalk';

import {type SoloLogger} from './logging/solo-logger.js';
import {type NodeAlias} from '../types/aliases.js';
import {Duration} from './time/duration.js';
import {getAppleSiliconChipset, sleep} from './helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {PathEx} from '../business/utils/path-ex.js';
import {ShellRunner} from './shell-runner.js';

/** PlatformInstaller install platform code in the root-container of a network pod */
@injectable()
export class PlatformInstaller {
  constructor(
    @inject(InjectTokens.SoloLogger) private logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private k8Factory?: K8Factory,
    @inject(InjectTokens.ConfigManager) private configManager?: ConfigManager,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  private _getNamespace(): NamespaceName {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) {
      throw new MissingArgumentError('namespace is not set');
    }
    return ns;
  }

  validatePlatformReleaseDir(releaseDirectory: string) {
    if (!releaseDirectory) {
      throw new MissingArgumentError('releaseDirectory is required');
    }
    if (!fs.existsSync(releaseDirectory)) {
      throw new IllegalArgumentError('releaseDirectory does not exists', releaseDirectory);
    }

    const dataDirectory = `${releaseDirectory}/data`;
    const appsDirectory = `${releaseDirectory}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libraryDirectory = `${releaseDirectory}/${constants.HEDERA_DATA_LIB_DIR}`;

    if (!fs.existsSync(dataDirectory)) {
      throw new IllegalArgumentError('releaseDirectory does not have data directory', releaseDirectory);
    }

    if (!fs.existsSync(appsDirectory)) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_APPS_DIR}' missing in '${releaseDirectory}'`,
        releaseDirectory,
      );
    }

    if (!fs.existsSync(libraryDirectory)) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_LIB_DIR}' missing in '${releaseDirectory}'`,
        releaseDirectory,
      );
    }

    // @ts-ignore
    if (!fs.statSync(appsDirectory).isEmpty()) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_APPS_DIR}' is empty in releaseDir: ${releaseDirectory}`,
        releaseDirectory,
      );
    }

    // @ts-ignore
    if (!fs.statSync(libraryDirectory).isEmpty()) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_LIB_DIR}' is empty in releaseDir: ${releaseDirectory}`,
        releaseDirectory,
      );
    }
  }


  /** Fetch and extract platform code into the container */
  async fetchPlatform(podReference: PodReference, tag: string, context?: string) {
    if (!podReference) {
      throw new MissingArgumentError('podReference is required');
    }
    if (!tag) {
      throw new MissingArgumentError('tag is required');
    }

    try {
      const chipType = (await  getAppleSiliconChipset(this.logger)).join('');
      this.logger.info(`chipType: ${chipType}`);
      const scriptName = 'extract-platform.sh';
      const sourcePath = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName); // script source path
      await this.copyFiles(podReference, [sourcePath], constants.HEDERA_USER_HOME_DIR, undefined, context);

      // wait a few seconds before calling the script to avoid "No such file" error
      await sleep(Duration.ofSeconds(2));

      const extractScript = `${constants.HEDERA_USER_HOME_DIR}/${scriptName}`; // inside the container
      const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

      const k8Containers = this.k8Factory.getK8(context).containers();

      await k8Containers.readByRef(containerReference).execContainer(`chmod +x ${extractScript}`);
      await k8Containers.readByRef(containerReference).execContainer([extractScript, tag, chipType]);

      return true;
    } catch (error) {
      const message = `failed to extract platform code in this pod '${podReference}' while using the '${context}' context: ${error.message}`;
      throw new SoloError(message, error);
    }
  }

  /**
   * Copy a list of files to a directory in the container
   * @param podReference - pod reference
   * @param sourceFiles - list of source files
   * @param destinationDirectory - destination directory
   * @param [container] - name of the container
   * @param [context]
   * @returns a list of paths of the copied files insider the container
   */
  async copyFiles(
    podReference: PodReference,
    sourceFiles: string[],
    destinationDirectory: string,
    container = constants.ROOT_CONTAINER,
    context?: string,
  ) {
    try {
      const containerReference = ContainerReference.of(podReference, container);
      const copiedFiles: string[] = [];

      // prepare the file mapping
      for (const sourcePath of sourceFiles) {
        if (!fs.existsSync(sourcePath)) {
          throw new SoloError(`file does not exist: ${sourcePath}`);
        }

        const k8Containers = this.k8Factory.getK8(context).containers();

        if (!(await k8Containers.readByRef(containerReference).hasDir(destinationDirectory))) {
          await k8Containers.readByRef(containerReference).mkdir(destinationDirectory);
        }

        this.logger.debug(`Copying file into ${podReference.name}: ${sourcePath} -> ${destinationDirectory}`);
        await k8Containers.readByRef(containerReference).copyTo(sourcePath, destinationDirectory);

        const fileName = path.basename(sourcePath);
        copiedFiles.push(PathEx.join(destinationDirectory, fileName));
      }

      return copiedFiles;
    } catch (error) {
      throw new SoloError(`failed to copy files to pod '${podReference.name}': ${error.message}`, error);
    }
  }

  async copyGossipKeys(consensusNode: ConsensusNode, stagingDirectory: string, consensusNodes: ConsensusNode[]) {
    if (!consensusNode) {
      throw new MissingArgumentError('consensusNode is required');
    }
    if (!stagingDirectory) {
      throw new MissingArgumentError('stagingDirectory is required');
    }
    if (!consensusNodes || consensusNodes.length <= 0) {
      throw new MissingArgumentError('consensusNodes cannot be empty');
    }

    try {
      const sourceFiles = [];

      // copy private keys for the node
      sourceFiles.push(
        PathEx.joinWithRealPath(
          stagingDirectory,
          'keys',
          Templates.renderGossipPemPrivateKeyFile(consensusNode.name as NodeAlias),
        ),
      );

      // copy all public keys for all nodes
      for (const consensusNode of consensusNodes) {
        sourceFiles.push(
          PathEx.joinWithRealPath(
            stagingDirectory,
            'keys',
            Templates.renderGossipPemPublicKeyFile(consensusNode.name as NodeAlias),
          ),
        );
      }

      const data = {};
      for (const sourceFile of sourceFiles) {
        const fileContents = fs.readFileSync(sourceFile);
        const fileName = path.basename(sourceFile);
        // @ts-ignore
        data[fileName] = Base64.encode(fileContents);
      }

      const secretCreated = await this.k8Factory
        .getK8(consensusNode.context)
        .secrets()
        .createOrReplace(
          NamespaceName.of(consensusNode.namespace),
          Templates.renderGossipKeySecretName(consensusNode.name as NodeAlias),
          SecretType.OPAQUE,
          data,
          Templates.renderGossipKeySecretLabelObject(consensusNode.name as NodeAlias),
        );

      if (!secretCreated) {
        throw new SoloError(`failed to create secret for gossip keys for node '${consensusNode.name}'`);
      }
    } catch (error: Error | any) {
      const message = `failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(consensusNode.name as NodeAlias)}': ${error.message}`;
      throw new SoloError(message, error);
    }
  }

  async copyTLSKeys(consensusNodes: ConsensusNode[], stagingDirectory: string, contexts: string[]) {
    if (!consensusNodes || consensusNodes.length <= 0) {
      throw new MissingArgumentError('consensusNodes cannot be empty');
    }
    if (!stagingDirectory) {
      throw new MissingArgumentError('stagingDirectory is required');
    }

    try {
      const data = {};

      for (const consensusNode of consensusNodes) {
        const sourceFiles = [];
        sourceFiles.push(
          PathEx.joinWithRealPath(
            stagingDirectory,
            'keys',
            Templates.renderTLSPemPrivateKeyFile(consensusNode.name as NodeAlias),
          ),
        );
        sourceFiles.push(
          PathEx.joinWithRealPath(
            stagingDirectory,
            'keys',
            Templates.renderTLSPemPublicKeyFile(consensusNode.name as NodeAlias),
          ),
        );

        for (const sourceFile of sourceFiles) {
          const fileContents = fs.readFileSync(sourceFile);
          const fileName = path.basename(sourceFile);
          // @ts-ignore
          data[fileName] = Base64.encode(fileContents);
        }
      }

      for (const context of contexts) {
        const secretCreated = await this.k8Factory
          .getK8(context)
          .secrets()
          .createOrReplace(this._getNamespace(), 'network-node-hapi-app-secrets', SecretType.OPAQUE, data, undefined);

        if (!secretCreated) {
          throw new SoloError('failed to create secret for TLS keys');
        }
      }
    } catch (error: Error | any) {
      throw new SoloError('failed to copy TLS keys to secret', error);
    }
  }

  async setPathPermission(
    podReference: PodReference,
    destinationPath: string,
    mode = '0755',
    recursive = true,
    container = constants.ROOT_CONTAINER,
    context?: string,
  ) {
    if (!podReference) {
      throw new MissingArgumentError('podReference is required');
    }
    if (!destinationPath) {
      throw new MissingArgumentError('destPath is required');
    }
    const containerReference = ContainerReference.of(podReference, container);

    const recursiveFlag = recursive ? '-R' : '';

    const k8Containers = this.k8Factory.getK8(context).containers();

    await k8Containers
      .readByRef(containerReference)
      .execContainer(['bash', '-c', `chown ${recursiveFlag} hedera:hedera ${destinationPath} 2>/dev/null || true`]);
    await k8Containers
      .readByRef(containerReference)
      .execContainer(['bash', '-c', `chmod ${recursiveFlag} ${mode} ${destinationPath} 2>/dev/null || true`]);

    return true;
  }

  async setPlatformDirPermissions(podReference: PodReference, context?: string) {
    const self = this;
    if (!podReference) {
      throw new MissingArgumentError('podReference is required');
    }

    try {
      const destinationPaths = [constants.HEDERA_HAPI_PATH, constants.HEDERA_HGCAPP_DIR];

      for (const destinationPath of destinationPaths) {
        await self.setPathPermission(podReference, destinationPath, undefined, undefined, undefined, context);
      }

      return true;
    } catch (error) {
      throw new SoloError(`failed to set permission in '${podReference.name}'`, error);
    }
  }

  /** Return a list of task to perform node directory setup */
  taskSetup(podReference: PodReference, stagingDirectory: string, isGenesis: boolean, context?: string) {
    const self = this;
    return new Listr(
      [
        {
          title: 'Copy configuration files',
          task: async () => await self.copyConfigurationFiles(stagingDirectory, podReference, isGenesis, context),
        },
        {
          title: 'Set file permissions',
          task: async () => await self.setPlatformDirPermissions(podReference, context),
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
        },
      },
    );
  }

  /**
   * Copy configuration files to the network consensus node pod
   * @param stagingDirectory - staging directory path
   * @param podReference - pod reference
   * @param isGenesis - true if this is `solo node setup` and we are at genesis
   * @param context
   */
  private async copyConfigurationFiles(
    stagingDirectory: string,
    podReference: PodReference,
    isGenesis: boolean,
    context?: string,
  ) {
    if (isGenesis) {
      const genesisNetworkJson = [PathEx.joinWithRealPath(stagingDirectory, 'genesis-network.json')];
      await this.copyFiles(
        podReference,
        genesisNetworkJson,
        `${constants.HEDERA_HAPI_PATH}/data/config`,
        undefined,
        context,
      );
    }

    // TODO: temporarily disable this until we add logic to only set this when the user provides the node override gossip endpoints for each node they want to override
    // const nodeOverridesYaml = [PathEx.joinWithRealPath(stagingDirectory, constants.NODE_OVERRIDE_FILE)];
    // await this.copyFiles(podReference, nodeOverridesYaml, `${constants.HEDERA_HAPI_PATH}/data/config`, undefined, context);
  }

  /**
   * Return a list of task to copy the node keys to the staging directory
   *
   * It assumes the staging directory has the following files and resources:
   * <li>${staging}/keys/s-public-<nodeAlias>.pem: private signing key for a node</li>
   * <li>${staging}/keys/s-private-<nodeAlias>.pem: public signing key for a node</li>
   * <li>${staging}/keys/a-public-<nodeAlias>.pem: private agreement key for a node</li>
   * <li>${staging}/keys/a-private-<nodeAlias>.pem: public agreement key for a node</li>
   * <li>${staging}/keys/hedera-<nodeAlias>.key: gRPC TLS key for a node</li>
   * <li>${staging}/keys/hedera-<nodeAlias>.crt: gRPC TLS cert for a node</li>
   *
   * @param stagingDirectory staging directory path
   * @param consensusNodes list of consensus nodes
   * @param contexts list of k8s contexts
   */
  copyNodeKeys(stagingDirectory: string, consensusNodes: ConsensusNode[], contexts: string[]) {
    const self = this;
    const subTasks = [];
    subTasks.push({
      title: 'Copy TLS keys',
      task: async () => await self.copyTLSKeys(consensusNodes, stagingDirectory, contexts),
    });

    for (const consensusNode of consensusNodes) {
      subTasks.push({
        title: `Node: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.context)}`,
        task: () =>
          new Listr(
            [
              {
                title: 'Copy Gossip keys',
                task: async () => await self.copyGossipKeys(consensusNode, stagingDirectory, consensusNodes),
              },
            ],
            {
              concurrent: false,
              rendererOptions: {
                collapseSubtasks: false,
              },
            },
          ),
      });
    }
    return subTasks;
  }
}
