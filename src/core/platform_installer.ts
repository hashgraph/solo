/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs';
import {Listr} from 'listr2';
import * as path from 'path';
import {SoloError, IllegalArgumentError, MissingArgumentError} from './errors.js';
import * as constants from './constants.js';
import {ConfigManager} from './config_manager.js';
import {type K8} from '../core/kube/k8.js';
import {Templates} from './templates.js';
import {Flags as flags} from '../commands/flags.js';
import * as Base64 from 'js-base64';
import chalk from 'chalk';

import {SoloLogger} from './logging.js';
import {type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {Duration} from './time/duration.js';
import {sleep} from './helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './container_helper.js';
import {type NamespaceName} from './kube/namespace_name.js';
import {type PodRef} from './kube/pod_ref.js';

/** PlatformInstaller install platform code in the root-container of a network pod */
@injectable()
export class PlatformInstaller {
  constructor(
    @inject(SoloLogger) private logger?: SoloLogger,
    @inject('K8') private k8?: K8,
    @inject(ConfigManager) private configManager?: ConfigManager,
  ) {
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.k8 = patchInject(k8, 'K8', this.constructor.name);
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
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
  async fetchPlatform(podRef: PodRef, tag: string) {
    if (!podRef) throw new MissingArgumentError('podRef is required');
    if (!tag) throw new MissingArgumentError('tag is required');

    try {
      const scriptName = 'extract-platform.sh';
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName); // script source path
      await this.copyFiles(podRef, [sourcePath], constants.HEDERA_USER_HOME_DIR);

      // wait a few seconds before calling the script to avoid "No such file" error
      await sleep(Duration.ofSeconds(2));

      const extractScript = path.join(constants.HEDERA_USER_HOME_DIR, scriptName); // inside the container
      await this.k8.execContainer(podRef, constants.ROOT_CONTAINER, `chmod +x ${extractScript}`);
      await this.k8.execContainer(podRef, constants.ROOT_CONTAINER, [extractScript, tag]);
      return true;
    } catch (e: Error | any) {
      const message = `failed to extract platform code in this pod '${podRef.podName.name}': ${e.message}`;
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
   * @returns a list of pathso of the copied files insider the container
   */
  async copyFiles(podRef: PodRef, srcFiles: string[], destDir: string, container = constants.ROOT_CONTAINER) {
    try {
      const copiedFiles: string[] = [];

      // prepare the file mapping
      for (const srcPath of srcFiles) {
        if (!fs.existsSync(srcPath)) {
          throw new SoloError(`file does not exist: ${srcPath}`);
        }

        if (!(await this.k8.hasDir(podRef, container, destDir))) {
          await this.k8.mkdir(podRef, container, destDir);
        }

        this.logger.debug(`Copying file into ${podRef.podName.name}: ${srcPath} -> ${destDir}`);
        await this.k8.copyTo(podRef, container, srcPath, destDir);

        const fileName = path.basename(srcPath);
        copiedFiles.push(path.join(destDir, fileName));
      }

      return copiedFiles;
    } catch (e: Error | any) {
      throw new SoloError(`failed to copy files to pod '${podRef.podName.name}': ${e.message}`, e);
    }
  }

  async copyGossipKeys(nodeAlias: NodeAlias, stagingDir: string, nodeAliases: NodeAliases) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required');
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required');
    if (!nodeAliases || nodeAliases.length <= 0) throw new MissingArgumentError('nodeAliases cannot be empty');

    try {
      const srcFiles = [];

      // copy private keys for the node
      srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPrivateKeyFile(nodeAlias)));

      // copy all public keys for all nodes
      nodeAliases.forEach(nodeAlias => {
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPublicKeyFile(nodeAlias)));
      });

      const data = {};
      for (const srcFile of srcFiles) {
        const fileContents = fs.readFileSync(srcFile);
        const fileName = path.basename(srcFile);
        // @ts-ignore
        data[fileName] = Base64.encode(fileContents);
      }

      if (
        !(await this.k8.createSecret(
          Templates.renderGossipKeySecretName(nodeAlias),
          this._getNamespace(),
          'Opaque',
          data,
          Templates.renderGossipKeySecretLabelObject(nodeAlias),
          true,
        ))
      ) {
        throw new SoloError(`failed to create secret for gossip keys for node '${nodeAlias}'`);
      }
    } catch (e: Error | any) {
      this.logger.error(
        `failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(nodeAlias)}': ${e.message}`,
        e,
      );
      throw new SoloError(
        `failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(nodeAlias)}': ${e.message}`,
        e,
      );
    }
  }

  async copyTLSKeys(nodeAliases: NodeAliases, stagingDir: string) {
    if (!nodeAliases || nodeAliases.length <= 0) throw new MissingArgumentError('nodeAliases cannot be empty');
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required');

    try {
      const data = {};

      for (const nodeAlias of nodeAliases) {
        const srcFiles = [];
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderTLSPemPrivateKeyFile(nodeAlias)));
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderTLSPemPublicKeyFile(nodeAlias)));

        for (const srcFile of srcFiles) {
          const fileContents = fs.readFileSync(srcFile);
          const fileName = path.basename(srcFile);
          // @ts-ignore
          data[fileName] = Base64.encode(fileContents);
        }
      }
      if (
        !(await this.k8.createSecret(
          'network-node-hapi-app-secrets',
          this._getNamespace(),
          'Opaque',
          data,
          undefined,
          true,
        ))
      ) {
        throw new SoloError('failed to create secret for TLS keys');
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
  ) {
    if (!podRef) throw new MissingArgumentError('podRef is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');

    const recursiveFlag = recursive ? '-R' : '';
    await this.k8.execContainer(podRef, container, [
      'bash',
      '-c',
      `chown ${recursiveFlag} hedera:hedera ${destPath} 2>/dev/null || true`,
    ]);
    await this.k8.execContainer(podRef, container, [
      'bash',
      '-c',
      `chmod ${recursiveFlag} ${mode} ${destPath} 2>/dev/null || true`,
    ]);

    return true;
  }

  async setPlatformDirPermissions(podRef: PodRef) {
    const self = this;
    if (!podRef) throw new MissingArgumentError('podRef is required');

    try {
      const destPaths = [constants.HEDERA_HAPI_PATH, constants.HEDERA_HGCAPP_DIR];

      for (const destPath of destPaths) {
        await self.setPathPermission(podRef, destPath);
      }

      return true;
    } catch (e: Error | any) {
      throw new SoloError(`failed to set permission in '${podRef.podName.name}'`, e);
    }
  }

  /** Return a list of task to perform node directory setup */
  taskSetup(podRef: PodRef, stagingDir: string, isGenesis: boolean) {
    const self = this;
    return new Listr(
      [
        {
          title: 'Copy configuration files',
          task: async () => await self.copyConfigurationFiles(stagingDir, podRef, isGenesis),
        },
        {
          title: 'Set file permissions',
          task: async () => await self.setPlatformDirPermissions(podRef),
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
  private async copyConfigurationFiles(stagingDir: string, podRef: PodRef, isGenesis: boolean) {
    if (isGenesis) {
      const genesisNetworkJson = [path.join(stagingDir, 'genesis-network.json')];
      await this.copyFiles(podRef, genesisNetworkJson, `${constants.HEDERA_HAPI_PATH}/data/config`);
    }
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
   * @param nodeAliases list of node ids
   */
  copyNodeKeys(stagingDir: string, nodeAliases: NodeAliases) {
    const self = this;
    const subTasks = [];
    subTasks.push({
      title: 'Copy TLS keys',
      task: async () => await self.copyTLSKeys(nodeAliases, stagingDir),
    });

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Node: ${chalk.yellow(nodeAlias)}`,
        task: () =>
          new Listr(
            [
              {
                title: 'Copy Gossip keys',
                task: async () => await self.copyGossipKeys(nodeAlias, stagingDir, nodeAliases),
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
