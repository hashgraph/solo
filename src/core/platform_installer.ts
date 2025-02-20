/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import {Listr} from 'listr2';
import * as path from 'path';
import {IllegalArgumentError, MissingArgumentError, SoloError} from './errors.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config_manager.js';
import {type K8Factory} from '../core/kube/k8_factory.js';
import {Templates} from './templates.js';
import {Flags as flags} from '../commands/flags.js';
import * as Base64 from 'js-base64';
import chalk from 'chalk';

import {type SoloLogger} from './logging.js';
import {type NodeAlias} from '../types/aliases.js';
import {Duration} from './time/duration.js';
import {sleep} from './helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {type PodRef} from './kube/resources/pod/pod_ref.js';
import {ContainerRef} from './kube/resources/container/container_ref.js';
import {SecretType} from './kube/resources/secret/secret_type.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {type ConsensusNode} from './model/consensus_node.js';

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
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }

  validatePlatformReleaseDir(releaseDir: string) {
    if (!releaseDir) throw new MissingArgumentError('releaseDir is required');
    if (!fs.existsSync(releaseDir)) {
      throw new IllegalArgumentError('releaseDir does not exists', releaseDir);
    }

    const dataDir = `${releaseDir}/data`;
    const appsDir = `${releaseDir}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libDir = `${releaseDir}/${constants.HEDERA_DATA_LIB_DIR}`;

    if (!fs.existsSync(dataDir)) {
      throw new IllegalArgumentError('releaseDir does not have data directory', releaseDir);
    }

    if (!fs.existsSync(appsDir)) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_APPS_DIR}' missing in '${releaseDir}'`, releaseDir);
    }

    if (!fs.existsSync(libDir)) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_LIB_DIR}' missing in '${releaseDir}'`, releaseDir);
    }

    // @ts-ignore
    if (!fs.statSync(appsDir).isEmpty()) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_APPS_DIR}' is empty in releaseDir: ${releaseDir}`,
        releaseDir,
      );
    }

    // @ts-ignore
    if (!fs.statSync(libDir).isEmpty()) {
      throw new IllegalArgumentError(
        `'${constants.HEDERA_DATA_LIB_DIR}' is empty in releaseDir: ${releaseDir}`,
        releaseDir,
      );
    }
  }

  /** Fetch and extract platform code into the container */
  async fetchPlatform(podRef: PodRef, tag: string, context?: string) {
    if (!podRef) throw new MissingArgumentError('podRef is required');
    if (!tag) throw new MissingArgumentError('tag is required');

    try {
      const scriptName = 'extract-platform.sh';
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName); // script source path
      await this.copyFiles(podRef, [sourcePath], constants.HEDERA_USER_HOME_DIR, undefined, context);

      // wait a few seconds before calling the script to avoid "No such file" error
      await sleep(Duration.ofSeconds(2));

      const extractScript = path.join(constants.HEDERA_USER_HOME_DIR, scriptName); // inside the container
      const containerRef = ContainerRef.of(podRef, constants.ROOT_CONTAINER);

      const k8Containers = this.k8Factory.getK8(context).containers();

      await k8Containers.readByRef(containerRef).execContainer(`chmod +x ${extractScript}`);
      await k8Containers.readByRef(containerRef).execContainer([extractScript, tag]);

      return true;
    } catch (e) {
      const message = `failed to extract platform code in this pod '${podRef}' while using the '${context}' context: ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }
  }

  /**
   * Copy a list of files to a directory in the container
   * @param podRef - pod reference
   * @param srcFiles - list of source files
   * @param destDir - destination directory
   * @param [container] - name of the container
   * @param [context]
   * @returns a list of paths of the copied files insider the container
   */
  async copyFiles(
    podRef: PodRef,
    srcFiles: string[],
    destDir: string,
    container = constants.ROOT_CONTAINER,
    context?: string,
  ) {
    try {
      const containerRef = ContainerRef.of(podRef, container);
      const copiedFiles: string[] = [];

      // prepare the file mapping
      for (const srcPath of srcFiles) {
        if (!fs.existsSync(srcPath)) {
          throw new SoloError(`file does not exist: ${srcPath}`);
        }

        const k8Containers = this.k8Factory.getK8(context).containers();

        if (!(await k8Containers.readByRef(containerRef).hasDir(destDir))) {
          await k8Containers.readByRef(containerRef).mkdir(destDir);
        }

        this.logger.debug(`Copying file into ${podRef.name}: ${srcPath} -> ${destDir}`);
        await k8Containers.readByRef(containerRef).copyTo(srcPath, destDir);

        const fileName = path.basename(srcPath);
        copiedFiles.push(path.join(destDir, fileName));
      }

      return copiedFiles;
    } catch (e) {
      throw new SoloError(`failed to copy files to pod '${podRef.name}': ${e.message}`, e);
    }
  }

  async copyGossipKeys(consensusNode: ConsensusNode, stagingDir: string, consensusNodes: ConsensusNode[]) {
    if (!consensusNode) throw new MissingArgumentError('consensusNode is required');
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required');
    if (!consensusNodes || consensusNodes.length <= 0) throw new MissingArgumentError('consensusNodes cannot be empty');

    try {
      const srcFiles = [];

      // copy private keys for the node
      srcFiles.push(
        path.join(stagingDir, 'keys', Templates.renderGossipPemPrivateKeyFile(consensusNode.name as NodeAlias)),
      );

      // copy all public keys for all nodes
      consensusNodes.forEach(consensusNode => {
        srcFiles.push(
          path.join(stagingDir, 'keys', Templates.renderGossipPemPublicKeyFile(consensusNode.name as NodeAlias)),
        );
      });

      const data = {};
      for (const srcFile of srcFiles) {
        const fileContents = fs.readFileSync(srcFile);
        const fileName = path.basename(srcFile);
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
    } catch (e: Error | any) {
      const message = `failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(consensusNode.name as NodeAlias)}': ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }
  }

  async copyTLSKeys(consensusNodes: ConsensusNode[], stagingDir: string, contexts: string[]) {
    if (!consensusNodes || consensusNodes.length <= 0) throw new MissingArgumentError('consensusNodes cannot be empty');
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required');

    try {
      const data = {};

      for (const consensusNode of consensusNodes) {
        const srcFiles = [];
        srcFiles.push(
          path.join(stagingDir, 'keys', Templates.renderTLSPemPrivateKeyFile(consensusNode.name as NodeAlias)),
        );
        srcFiles.push(
          path.join(stagingDir, 'keys', Templates.renderTLSPemPublicKeyFile(consensusNode.name as NodeAlias)),
        );

        for (const srcFile of srcFiles) {
          const fileContents = fs.readFileSync(srcFile);
          const fileName = path.basename(srcFile);
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
    } catch (e: Error | any) {
      this.logger.error('failed to copy TLS keys to secret', e);
      throw new SoloError('failed to copy TLS keys to secret', e);
    }
  }

  async setPathPermission(
    podRef: PodRef,
    destPath: string,
    mode = '0755',
    recursive = true,
    container = constants.ROOT_CONTAINER,
    context?: string,
  ) {
    if (!podRef) throw new MissingArgumentError('podRef is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');
    const containerRef = ContainerRef.of(podRef, container);

    const recursiveFlag = recursive ? '-R' : '';

    const k8Containers = this.k8Factory.getK8(context).containers();

    await k8Containers
      .readByRef(containerRef)
      .execContainer(['bash', '-c', `chown ${recursiveFlag} hedera:hedera ${destPath} 2>/dev/null || true`]);
    await k8Containers
      .readByRef(containerRef)
      .execContainer(['bash', '-c', `chmod ${recursiveFlag} ${mode} ${destPath} 2>/dev/null || true`]);

    return true;
  }

  async setPlatformDirPermissions(podRef: PodRef, context?: string) {
    const self = this;
    if (!podRef) throw new MissingArgumentError('podRef is required');

    try {
      const destPaths = [constants.HEDERA_HAPI_PATH, constants.HEDERA_HGCAPP_DIR];

      for (const destPath of destPaths) {
        await self.setPathPermission(podRef, destPath, undefined, undefined, undefined, context);
      }

      return true;
    } catch (e) {
      throw new SoloError(`failed to set permission in '${podRef.name}'`, e);
    }
  }

  /** Return a list of task to perform node directory setup */
  taskSetup(podRef: PodRef, stagingDir: string, isGenesis: boolean, context?: string) {
    const self = this;
    return new Listr(
      [
        {
          title: 'Copy configuration files',
          task: async () => await self.copyConfigurationFiles(stagingDir, podRef, isGenesis, context),
        },
        {
          title: 'Set file permissions',
          task: async () => await self.setPlatformDirPermissions(podRef, context),
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
   * @param stagingDir - staging directory path
   * @param podRef - pod reference
   * @param isGenesis - true if this is `solo node setup` and we are at genesis
   * @private
   */
  private async copyConfigurationFiles(stagingDir: string, podRef: PodRef, isGenesis: boolean, context?: string) {
    if (isGenesis) {
      const genesisNetworkJson = [path.join(stagingDir, 'genesis-network.json')];
      await this.copyFiles(podRef, genesisNetworkJson, `${constants.HEDERA_HAPI_PATH}/data/config`, undefined, context);
    }

    const nodeOverridesYaml = [path.join(stagingDir, constants.NODE_OVERRIDE_FILE)];
    await this.copyFiles(podRef, nodeOverridesYaml, `${constants.HEDERA_HAPI_PATH}/data/config`, undefined, context);
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
   * @param stagingDir staging directory path
   * @param consensusNodes list of consensus nodes
   * @param contexts list of k8s contexts
   */
  copyNodeKeys(stagingDir: string, consensusNodes: ConsensusNode[], contexts: string[]) {
    const self = this;
    const subTasks = [];
    subTasks.push({
      title: 'Copy TLS keys',
      task: async () => await self.copyTLSKeys(consensusNodes, stagingDir, contexts),
    });

    for (const consensusNode of consensusNodes) {
      subTasks.push({
        title: `Node: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.context)}`,
        task: () =>
          new Listr(
            [
              {
                title: 'Copy Gossip keys',
                task: async () => await self.copyGossipKeys(consensusNode, stagingDir, consensusNodes),
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
