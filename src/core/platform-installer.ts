// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import * as fs from 'node:fs';
import {Listr} from 'listr2';
import * as path from 'node:path';
import * as constants from './constants.js';
import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {Templates} from './templates.js';
import {ConsensusNodePathTemplates} from './consensus-node-path-templates.js';
import {Flags as flags} from '../commands/flags.js';
import * as Base64 from 'js-base64';
import chalk from 'chalk';

import {type SoloLogger} from './logging/solo-logger.js';
import {type NodeAlias} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {type ContainerName} from '../integration/kube/resources/container/container-name.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {ResourceNotFoundError} from '../integration/kube/errors/resource-operation-errors.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {PathEx} from '../business/utils/path-ex.js';
import {PackageDownloader} from './package-downloader.js';
import {Containers} from '../integration/kube/resources/container/containers.js';
import {Container} from '../integration/kube/resources/container/container.js';

/** PlatformInstaller install platform code in the root-container of a network pod */
@injectable()
export class PlatformInstaller {
  public constructor(
    @inject(InjectTokens.SoloLogger) private logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private k8Factory?: K8Factory,
    @inject(InjectTokens.ConfigManager) private configManager?: ConfigManager,
    @inject(InjectTokens.PackageDownloader) private packageDownloader?: PackageDownloader,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.packageDownloader = patchInject(packageDownloader, InjectTokens.PackageDownloader, this.constructor.name);
  }

  private _getNamespace(): NamespaceName {
    const ns: NamespaceName = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) {
      throw new SoloErrors.validation.missingArgument('namespace is not set');
    }
    return ns;
  }

  public validatePlatformReleaseDir(releaseDirectory: string): void {
    if (!releaseDirectory) {
      throw new SoloErrors.validation.missingArgument('releaseDirectory is required');
    }
    if (!fs.existsSync(releaseDirectory)) {
      throw new SoloErrors.validation.illegalArgument('releaseDirectory does not exists', releaseDirectory);
    }

    const dataDirectory: string = `${releaseDirectory}/data`;
    const appsDirectory: string = `${releaseDirectory}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libraryDirectory: string = `${releaseDirectory}/${constants.HEDERA_DATA_LIB_DIR}`;

    if (!fs.existsSync(dataDirectory)) {
      throw new SoloErrors.validation.illegalArgument(
        'releaseDirectory does not have data directory',
        releaseDirectory,
      );
    }

    if (!fs.existsSync(appsDirectory)) {
      throw new SoloErrors.validation.illegalArgument(
        `'${constants.HEDERA_DATA_APPS_DIR}' missing in '${releaseDirectory}'`,
        releaseDirectory,
      );
    }

    if (!fs.existsSync(libraryDirectory)) {
      throw new SoloErrors.validation.illegalArgument(
        `'${constants.HEDERA_DATA_LIB_DIR}' missing in '${releaseDirectory}'`,
        releaseDirectory,
      );
    }

    const appsJarFiles: string[] = fs
      .readdirSync(appsDirectory)
      .filter((file: string): boolean => file.endsWith('.jar'));
    if (appsJarFiles.length === 0) {
      throw new SoloErrors.validation.illegalArgument(
        `No jar files found in '${constants.HEDERA_DATA_APPS_DIR}' in releaseDir: ${releaseDirectory}`,
        releaseDirectory,
      );
    }

    const libraryJarFiles: string[] = fs
      .readdirSync(libraryDirectory)
      .filter((file: string): boolean => file.endsWith('.jar'));
    if (libraryJarFiles.length === 0) {
      throw new SoloErrors.validation.illegalArgument(
        `No jar files found in '${constants.HEDERA_DATA_LIB_DIR}' in releaseDir: ${releaseDirectory}`,
        releaseDirectory,
      );
    }
  }

  public async getPlatformRelease(stagingDirectory: string, tag: string): Promise<string[]> {
    if (!tag) {
      throw new SoloErrors.validation.missingArgument('tag is required');
    }

    // Download the platform zip client-side into {stagingDir}/build/
    const buildDirectory: string = PathEx.join(stagingDirectory ?? constants.SOLO_CACHE_DIR, 'build');
    if (!fs.existsSync(buildDirectory)) {
      fs.mkdirSync(buildDirectory, {recursive: true});
    }
    const zipPath: string = await this.packageDownloader.fetchPlatform(tag, buildDirectory);

    // fetchPlatform ensures the checksum file is present, downloading it only when it is missing or unusable
    const checksumPath: string = PathEx.join(buildDirectory, `build-${tag}.sha384`);

    return [zipPath, checksumPath];
  }

  /** Fetch and extract platform code into the container */
  public async fetchPlatform(
    podReference: PodReference,
    tag: string,
    zipPath: string,
    checksumPath: string,
    context?: string,
  ) {
    if (!podReference) {
      throw new SoloErrors.validation.missingArgument('podReference is required');
    }
    if (!tag) {
      throw new SoloErrors.validation.missingArgument('tag is required');
    }
    if (!zipPath) {
      throw new SoloErrors.validation.illegalArgument('zipPath is required');
    }
    if (!checksumPath) {
      throw new SoloErrors.validation.illegalArgument('checksumPath is required');
    }

    try {
      // Upload zip and checksum to the container — extract-platform.sh expects them in HEDERA_USER_HOME_DIR
      await this.copyFiles(podReference, [zipPath, checksumPath], constants.HEDERA_USER_HOME_DIR, undefined, context);

      const scriptName: string = 'extract-platform.sh';
      const sourcePath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName);
      await this.copyFiles(podReference, [sourcePath], constants.HEDERA_USER_HOME_DIR, undefined, context);

      const extractScript: string = `${constants.HEDERA_USER_HOME_DIR}/${scriptName}`; // inside the container
      const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

      const k8Containers: Containers = this.k8Factory.getK8(context).containers();

      const container: Container = k8Containers.readByRef(containerReference);

      await container.execContainer('sync'); // ensure all writes are flushed before executing the script
      await container.execContainer(`chmod +x ${extractScript}`);
      await container.execContainer(`chown root:root ${extractScript}`);
      await container.execContainer([extractScript, tag]);

      return true;
    } catch (error) {
      const logFile: string = `${constants.HEDERA_HAPI_PATH}/output/extract-platform.log`;
      const response: string = await this.k8Factory
        .getK8(context)
        .containers()
        .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
        .execContainer(['bash', '-c', `cat ${logFile} || echo "Log file not found or empty"`]);
      this.logger.showUser(`Log file content from ${logFile}:\n${response}`);

      const message: string = `failed to extract platform code in this pod '${podReference}' while using the '${context}' context: ${error.message}`;
      throw new SoloErrors.system.containerOperationFailed(message, error);
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
  public async copyFiles(
    podReference: PodReference,
    sourceFiles: string[],
    destinationDirectory: string,
    container: ContainerName = constants.ROOT_CONTAINER,
    context?: string,
  ): Promise<string[]> {
    try {
      const containerReference: ContainerReference = ContainerReference.of(podReference, container);
      const copiedFiles: string[] = [];

      // prepare the file mapping
      for (const sourcePath of sourceFiles) {
        if (!fs.existsSync(sourcePath)) {
          throw new SoloErrors.component.platformFileNotFound(sourcePath);
        }

        const k8Containers: Containers = this.k8Factory.getK8(context).containers();

        if (!(await k8Containers.readByRef(containerReference).hasDir(destinationDirectory))) {
          await k8Containers.readByRef(containerReference).mkdir(destinationDirectory);
        }

        this.logger.debug(`Copying file into ${podReference.name}: ${sourcePath} -> ${destinationDirectory}`);
        await k8Containers.readByRef(containerReference).copyTo(sourcePath, destinationDirectory);

        const fileName: string = path.basename(sourcePath);
        copiedFiles.push(PathEx.join(destinationDirectory, fileName));
      }

      return copiedFiles;
    } catch (error) {
      throw new SoloErrors.component.platformFileCopyFailed(
        sourceFiles,
        podReference.name.toString(),
        destinationDirectory,
        error,
      );
    }
  }

  public async copyGossipKeys(
    consensusNode: ConsensusNode,
    keysDirectory: string,
    consensusNodes: ConsensusNode[],
  ): Promise<void> {
    if (!consensusNode) {
      throw new SoloErrors.validation.missingArgument('consensusNode is required');
    }
    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }
    if (!consensusNodes || consensusNodes.length <= 0) {
      throw new SoloErrors.validation.missingArgument('consensusNodes cannot be empty');
    }

    try {
      const gossipSecretDataByNode: Map<string, Record<string, string>> = new Map();
      const readGossipSecretData: (node: ConsensusNode) => Promise<Record<string, string>> = async (
        node: ConsensusNode,
      ): Promise<Record<string, string>> => {
        if (!gossipSecretDataByNode.has(node.name)) {
          gossipSecretDataByNode.set(
            node.name,
            await this.readSecretData(
              node.context,
              NamespaceName.of(node.namespace),
              Templates.renderGossipKeySecretName(node.name as NodeAlias),
            ),
          );
        }
        return gossipSecretDataByNode.get(node.name);
      };

      const data: Record<string, string> = {};
      const privateKeyFile: string = Templates.renderGossipPemPrivateKeyFile(consensusNode.name as NodeAlias);
      data[privateKeyFile] = await this.resolveKeyFileBase64(
        keysDirectory,
        privateKeyFile,
        (): Promise<Record<string, string>> => readGossipSecretData(consensusNode),
      );
      for (const node of consensusNodes) {
        const publicKeyFile: string = Templates.renderGossipPemPublicKeyFile(node.name as NodeAlias);
        data[publicKeyFile] = await this.resolveKeyFileBase64(
          keysDirectory,
          publicKeyFile,
          (): Promise<Record<string, string>> => readGossipSecretData(node),
        );
      }

      const secretCreated: boolean = await this.k8Factory
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
        throw new SoloErrors.component.gossipKeySecretCreationFailed(consensusNode.name);
      }
    } catch (error) {
      throw new SoloErrors.component.gossipKeySecretCreationFailed(
        consensusNode.name,
        `failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(consensusNode.name as NodeAlias)}'`,
        error,
      );
    }
  }

  public async copyTLSKeys(consensusNodes: ConsensusNode[], keysDirectory: string, contexts: string[]): Promise<void> {
    if (!consensusNodes || consensusNodes.length <= 0) {
      throw new SoloErrors.validation.missingArgument('consensusNodes cannot be empty');
    }
    if (!keysDirectory) {
      throw new SoloErrors.validation.missingArgument('keysDirectory is required');
    }

    try {
      let sharedTlsSecretData: Record<string, string> | undefined;
      const readSharedTlsSecretData: () => Promise<Record<string, string>> = async (): Promise<
        Record<string, string>
      > => {
        if (!sharedTlsSecretData) {
          sharedTlsSecretData = await this.readSecretData(
            contexts[0],
            this._getNamespace(),
            'network-node-hapi-app-secrets',
          );
        }
        return sharedTlsSecretData;
      };

      const data: Record<string, string> = {};
      for (const consensusNode of consensusNodes) {
        const keyFiles: string[] = [
          Templates.renderTLSPemPrivateKeyFile(consensusNode.name as NodeAlias),
          Templates.renderTLSPemPublicKeyFile(consensusNode.name as NodeAlias),
        ];
        for (const fileName of keyFiles) {
          data[fileName] = await this.resolveKeyFileBase64(keysDirectory, fileName, readSharedTlsSecretData);
        }
      }

      for (const context of contexts) {
        const secretCreated: boolean = await this.k8Factory
          .getK8(context)
          .secrets()
          .createOrReplace(this._getNamespace(), 'network-node-hapi-app-secrets', SecretType.OPAQUE, data);

        if (!secretCreated) {
          throw new SoloErrors.component.tlsKeySecretCreationFailed();
        }
      }
    } catch (error: unknown) {
      throw new SoloErrors.component.tlsKeySecretCreationFailed(error as Error);
    }
  }

  public async setPathPermission(
    podReference: PodReference,
    destinationPath: string,
    mode: string = '0750',
    recursive: boolean = true,
    container: ContainerName = constants.ROOT_CONTAINER,
    context?: string,
  ): Promise<boolean> {
    if (!podReference) {
      throw new SoloErrors.validation.missingArgument('podReference is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }
    const containerReference: ContainerReference = ContainerReference.of(podReference, container);

    const recursiveFlag: string = recursive ? '-R' : '';

    const k8Containers: Containers = this.k8Factory.getK8(context).containers();

    await k8Containers
      .readByRef(containerReference)
      .execContainer(['bash', '-c', `chown ${recursiveFlag} hedera:hedera ${destinationPath} 2>/dev/null || true`]);
    await k8Containers
      .readByRef(containerReference)
      .execContainer(['bash', '-c', `chmod ${recursiveFlag} ${mode} ${destinationPath} 2>/dev/null || true`]);

    return true;
  }

  public async setPlatformDirPermissions(podReference: PodReference, context?: string): Promise<boolean> {
    if (!podReference) {
      throw new SoloErrors.validation.missingArgument('podReference is required');
    }

    try {
      const destinationPaths: string[] = [constants.HEDERA_HAPI_PATH, constants.HEDERA_HGCAPP_DIR];

      for (const destinationPath of destinationPaths) {
        await this.setPathPermission(podReference, destinationPath, undefined, undefined, undefined, context);
      }

      return true;
    } catch (error) {
      throw new SoloErrors.system.containerOperationFailed(`set permission in ${podReference.name}`, error);
    }
  }

  /** Return a list of task to perform node directory setup */
  public taskSetup(podReference: PodReference, stagingDirectory: string, isGenesis: boolean, context?: string): Listr {
    return new Listr(
      [
        {
          title: 'Copy configuration files',
          task: async (): Promise<void> =>
            await this.copyConfigurationFiles(stagingDirectory, podReference, isGenesis, context),
        },
        {
          title: 'Set file permissions',
          task: async (): Promise<boolean> => await this.setPlatformDirPermissions(podReference, context),
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
   * @param isGenesis - true if this is `solo consensus node setup` and we are at genesis
   * @param context
   */
  private async copyConfigurationFiles(
    stagingDirectory: string,
    podReference: PodReference,
    isGenesis: boolean,
    context?: string,
  ): Promise<void> {
    if (isGenesis) {
      const genesisNetworkJson: string[] = [PathEx.joinWithRealPath(stagingDirectory, constants.GENESIS_NETWORK_FILE)];
      await this.copyFiles(
        podReference,
        genesisNetworkJson,
        `${constants.HEDERA_HAPI_PATH}/data/config`,
        undefined,
        context,
      );

      // Archived so `ledger system reset` and a state transplant can restore the address book without
      // re-running `consensus node setup`.
      await this.k8Factory
        .getK8(context)
        .containers()
        .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
        .execContainer([
          'bash',
          '-c',
          `mkdir -p ${ConsensusNodePathTemplates.CONFIG_ARCHIVE} && ` +
            `cp ${ConsensusNodePathTemplates.GENESIS_NETWORK_JSON} ${ConsensusNodePathTemplates.ARCHIVE_GENESIS_NETWORK_JSON}`,
        ]);
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
  public copyNodeKeys(keysDirectory: string, consensusNodes: ConsensusNode[], contexts: string[]): any[] {
    const subTasks: any[] = [
      {
        title: 'Copy TLS keys',
        task: async (): Promise<void> => await this.copyTLSKeys(consensusNodes, keysDirectory, contexts),
      },
    ];

    for (const consensusNode of consensusNodes) {
      subTasks.push({
        title: `Node: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.context)}`,
        task: () =>
          new Listr(
            [
              {
                title: 'Copy Gossip keys',
                task: async () => await this.copyGossipKeys(consensusNode, keysDirectory, consensusNodes),
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

  /**
   * Read a secret's data map, returning an empty map when the secret does not exist yet. This lets the
   * key-file resolver fall through to a clear "key file missing" error (rather than a confusing
   * "failed to read Secret") on a fresh deploy where the keys must come from disk.
   * @param context - the k8s context to read from
   * @param namespace - the secret's namespace
   * @param secretName - the secret name
   */
  private async readSecretData(
    context: string,
    namespace: NamespaceName,
    secretName: string,
  ): Promise<Record<string, string>> {
    try {
      const secret: Secret = await this.k8Factory.getK8(context).secrets().read(namespace, secretName);
      return secret?.data ?? {};
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return {};
      }
      throw error;
    }
  }

  private async resolveKeyFileBase64(
    keysDirectory: string,
    fileName: string,
    readSecretData: () => Promise<Record<string, string>>,
  ): Promise<string> {
    const keyFilePath: string = PathEx.join(keysDirectory, fileName);
    if (fs.existsSync(keyFilePath)) {
      // Key files are ASCII PEM, so reading as utf8 preserves the previous base64 encoding of the bytes.
      return Base64.encode(fs.readFileSync(keyFilePath, 'utf8'));
    }

    const secretData: Record<string, string> = await readSecretData();
    const encodedContents: string | undefined = secretData[fileName];
    if (!encodedContents) {
      throw new SoloErrors.component.platformKeyFileMissing(fileName);
    }
    return encodedContents;
  }
}
