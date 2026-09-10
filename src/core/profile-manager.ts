// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'yaml';
import dot from 'dot-object';
import {readFile, writeFile} from 'node:fs/promises';

import {Flags as flags} from '../commands/flags.js';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config-manager.js';
import {Helpers} from './helpers.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type AnyObject, type DirectoryPath, type NodeAlias, type NodeAliases, type Path} from '../types/aliases.js';
import {type PriorityMapping} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type ClusterReferenceName, DeploymentName, Realm, Shard} from './../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FilePermissions} from '../business/utils/file-permissions.js';
import {AccountManager} from './account-manager.js';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {BlockNodesJsonWrapper} from './block-nodes-json-wrapper.js';
import * as versions from '../../version.js';
import {Numbers} from '../business/utils/numbers.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {type ProfileManagerStagingOptions} from './profile-manager-staging-options.js';
import {Address} from '../business/address/address.js';
import {type K8} from '../integration/kube/k8.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {type Container} from '../integration/kube/resources/container/container.js';

@injectable()
export class ProfileManager {
  private readonly logger: SoloLogger;
  private readonly configManager: ConfigManager;
  private readonly cacheDir: DirectoryPath;
  private readonly k8Factory: K8Factory;
  private readonly remoteConfig: RemoteConfigRuntimeStateApi;
  private readonly accountManager: AccountManager;
  private readonly localConfig: LocalConfigRuntimeState;

  public constructor(
    @inject(InjectTokens.SoloLogger) logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) configManager?: ConfigManager,
    @inject(InjectTokens.CacheDir) cacheDirectory?: DirectoryPath,
    @inject(InjectTokens.K8Factory) k8Factory?: K8Factory,
    @inject(InjectTokens.RemoteConfigRuntimeState) remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.AccountManager) accountManager?: AccountManager,
    @inject(InjectTokens.LocalConfigRuntimeState) localConfig?: LocalConfigRuntimeState,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.cacheDir = PathEx.resolve(patchInject(cacheDirectory, InjectTokens.CacheDir, this.constructor.name));
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
  }

  /**
   * Set value in the YAML object
   * @param itemPath - item path in the yaml
   * @param value - value to be set
   * @param yamlRoot - root of the YAML object
   * @returns
   */
  public _setValue(itemPath: string, value: unknown, yamlRoot: AnyObject): AnyObject {
    // find the location where to set the value in the YAML
    const itemPathParts: string[] = itemPath.split('.');
    let parent: AnyObject = yamlRoot;
    let current: AnyObject = parent;
    let previousItemPath: string | number = '';
    for (const itemPathPart of itemPathParts) {
      if (Numbers.isNumeric(itemPathPart)) {
        const itemPathIndex: number = Number.parseInt(itemPathPart, 10); // numeric path part can only be array index
        if (!Array.isArray(parent[previousItemPath])) {
          parent[previousItemPath] = [];
        }

        const parentArray: AnyObject[] = parent[previousItemPath] as AnyObject[];
        if (!parentArray[itemPathIndex]) {
          parentArray[itemPathIndex] = {};
        }

        parent = parentArray as unknown as AnyObject;
        previousItemPath = itemPathIndex;
        current = parent[itemPathIndex] as AnyObject;
      } else {
        if (!current[itemPathPart]) {
          current[itemPathPart] = {};
        }

        parent = current;
        previousItemPath = itemPathPart;
        current = parent[itemPathPart];
      }
    }

    parent[previousItemPath] = value;
    return yamlRoot;
  }

  /**
   * Set items for the chart
   * @param itemPath - item path in the YAML, if empty then root of the YAML object will be used
   * @param items - the element object
   * @param yamlRoot - root of the YAML object to update
   */
  public _setChartItems(itemPath: string, items: AnyObject | undefined, yamlRoot: AnyObject): void {
    if (!items) {
      return;
    }

    const dotItems: AnyObject = dot.dot(items) as AnyObject;

    for (const key in dotItems) {
      let itemKey: string = key;

      // if it is an array key like extraEnvironment[0].JAVA_OPTS, convert it into a dot separated key as extraEnvironment.0.JAVA_OPTS
      if (key.includes('[')) {
        itemKey = key.replace('[', '.').replace(']', '');
      }

      if (itemPath) {
        this._setValue(`${itemPath}.${itemKey}`, dotItems[key], yamlRoot);
      } else {
        this._setValue(itemKey, dotItems[key], yamlRoot);
      }
    }
  }

  public async prepareStagingDirectory(
    consensusNodes: ConsensusNode[],
    nodeAliases: NodeAliases,
    yamlRoot: AnyObject,
    deploymentName: DeploymentName,
    applicationPropertiesPath: string,
    stagingOptions?: Partial<ProfileManagerStagingOptions>,
  ): Promise<void> {
    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
      consensusNodes.map((node): NodeAlias => node.name),
      deploymentName,
    );

    // set consensus pod level resources
    for (const [nodeIndex, nodeAlias] of nodeAliases.entries()) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeAlias, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.nodeId`, `${Templates.nodeIdFromNodeAlias(nodeAlias)}`, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeAlias), yamlRoot);
    }

    // Resolve once and keep immutable for this invocation to prevent races from global flag mutation
    // while a parallel command is generating staging/config artifacts.
    const resolvedStagingOptions: ProfileManagerStagingOptions = this.resolveStagingOptions(stagingOptions);
    const stagingDirectory: string = Templates.renderStagingDir(
      resolvedStagingOptions.cacheDir,
      resolvedStagingOptions.releaseTag,
    );

    if (!fs.existsSync(stagingDirectory)) {
      fs.mkdirSync(stagingDirectory, {recursive: true});
    }

    // Update application.properties with shard and realm
    await this.updateApplicationPropertiesWithRealmAndShard(
      applicationPropertiesPath,
      this.localConfig.configuration.realmForDeployment(deploymentName),
      this.localConfig.configuration.shardForDeployment(deploymentName),
    );

    await this.updateApplicationPropertiesForBlockNode(applicationPropertiesPath);
    await this.updateApplicationPropertiesWithChainId(applicationPropertiesPath, resolvedStagingOptions.chainId);

    for (const flag of flags.nodeConfigFileFlags.values()) {
      const sourceFilePath: string = this.configManager.getFlagFile(flag);
      const currentWorkingDirectory: string = process.env.INIT_CWD || process.cwd();
      const sourceAbsoluteFilePath: string = PathEx.resolve(currentWorkingDirectory, sourceFilePath);
      if (!fs.existsSync(sourceAbsoluteFilePath)) {
        throw new SoloErrors.validation.configFileNotFound(flag.name, sourceAbsoluteFilePath, sourceFilePath);
      }

      const destinationFileName: string = path.basename(flag.definition.defaultValue as string);
      const destinationPath: string = PathEx.join(stagingDirectory, 'templates', destinationFileName);
      this.logger.debug(`Copying configuration file to staging: ${sourceAbsoluteFilePath} -> ${destinationPath}`);

      // For application.properties: when the user provides a custom file (flag value differs
      // from the default relative path), use the user's file as the base and then apply
      // Solo's required overrides (realm, shard, block-node settings) on top.
      // This preserves all user-defined properties while ensuring Solo's critical settings win.
      const flagValue: string | undefined = this.configManager.getFlag<string>(flags.applicationProperties);
      const isUserSuppliedApplicationProperties: boolean =
        flag.name === flags.applicationProperties.name &&
        !!flagValue &&
        flagValue !== (flags.applicationProperties.definition.defaultValue as string);

      if (isUserSuppliedApplicationProperties) {
        if (await this.isApplicationPropertiesOverwriteEnabled(sourceAbsoluteFilePath)) {
          this.logger.debug(
            `Detected '${constants.APPLICATION_PROPERTIES_ENABLE_OVERWRITE_MARKER}' in '${sourceAbsoluteFilePath}', ` +
              'using user application.properties as full overwrite',
          );
          fs.cpSync(sourceAbsoluteFilePath, destinationPath, {force: true});
        } else {
          // Base: Solo's updated default (realm/shard/block-node settings already applied).
          // Apply user's properties as key-level overrides: existing keys are updated,
          // new keys are appended.  This avoids duplicates while preserving all Solo defaults
          // that the user did not explicitly override.
          fs.cpSync(applicationPropertiesPath, destinationPath, {force: true});
          await this.mergeApplicationProperties(destinationPath, sourceAbsoluteFilePath);

          // Re-apply Solo-required settings so merged user values cannot override
          // critical deployment behavior (realm/shard/chainId/block-node settings).
          await this.updateApplicationPropertiesWithRealmAndShard(
            destinationPath,
            this.localConfig.configuration.realmForDeployment(deploymentName),
            this.localConfig.configuration.shardForDeployment(deploymentName),
          );
          await this.updateApplicationPropertiesForBlockNode(destinationPath);
          await this.updateApplicationPropertiesWithChainId(destinationPath, resolvedStagingOptions.chainId);
        }
      } else {
        fs.cpSync(sourceAbsoluteFilePath, destinationPath, {force: true});
      }
    }

    // Files staged via cpSync inherit the (wider) source mode and bypass the process umask.
    FilePermissions.restrictTreeToOwner(PathEx.join(stagingDirectory, 'templates'));

    const bootstrapPropertiesPath: string = PathEx.join(stagingDirectory, 'templates', 'bootstrap.properties');
    await this.updateBoostrapPropertiesWithChainId(bootstrapPropertiesPath, resolvedStagingOptions.chainId);

    this._setFileContentsAsValue(
      'hedera.configMaps.log4j2Xml',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'log4j2.xml'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.settingsTxt',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'settings.txt'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.applicationProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', constants.APPLICATION_PROPERTIES),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.apiPermissionsProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'api-permission.properties'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.bootstrapProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'bootstrap.properties'),
      yamlRoot,
    );

    const applicationEnvironmentPath: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
    this._setFileContentsAsValue(
      'hedera.configMaps.applicationEnv',
      PathEx.resolve(applicationEnvironmentPath),
      yamlRoot,
    );

    this.addBlockNodesJsonValues(consensusNodes, nodeAliases, deploymentName, yamlRoot);
  }

  public addBlockNodesJsonValues(
    consensusNodes: ConsensusNode[],
    nodeAliases: NodeAliases,
    deploymentName: DeploymentName,
    yamlRoot: AnyObject,
  ): void {
    try {
      if (
        this.remoteConfig.configuration.state.blockNodes.length === 0 &&
        this.remoteConfig.configuration.state.externalBlockNodes.length === 0
      ) {
        return;
      }
    } catch {
      // Some unit tests intentionally stub only part of remoteConfig; skip block-node values in those cases.
      return;
    }

    const latestConsensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap([...nodeAliases], deploymentName);

    for (const [nodeIndex, nodeAlias] of nodeAliases.entries()) {
      const node: ConsensusNode | undefined =
        consensusNodes.find((candidate: ConsensusNode): boolean => candidate.name === nodeAlias) ??
        latestConsensusNodes.find((candidate: ConsensusNode): boolean => candidate.name === nodeAlias);

      if (!node) {
        continue;
      }

      const latestNode: ConsensusNode | undefined = latestConsensusNodes.find(
        (candidate: ConsensusNode): boolean => candidate.name === nodeAlias,
      );
      const blockNodeMap: PriorityMapping[] =
        node.blockNodeMap.length > 0 ? node.blockNodeMap : (latestNode?.blockNodeMap ?? []);
      const externalBlockNodeMap: PriorityMapping[] =
        node.externalBlockNodeMap.length > 0 ? node.externalBlockNodeMap : (latestNode?.externalBlockNodeMap ?? []);
      const blockNodesJsonData: string = new BlockNodesJsonWrapper(
        blockNodeMap,
        externalBlockNodeMap,
        this.remoteConfig,
      ).toJSON();
      const parsedBlockNodesJson: {nodes: unknown[]} = JSON.parse(blockNodesJsonData) as {nodes: unknown[]};

      if (parsedBlockNodesJson.nodes.length === 0) {
        continue;
      }

      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeAlias, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.nodeId`, `${Templates.nodeIdFromNodeAlias(nodeAlias)}`, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeAlias), yamlRoot);

      // Create a unique filename for each consensus node
      const blockNodesJsonFilename: string = `${constants.BLOCK_NODES_JSON_FILE.replace('.json', '')}-${node.name}.json`;
      const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, blockNodesJsonFilename);

      fs.writeFileSync(blockNodesJsonPath, JSON.stringify(parsedBlockNodesJson, undefined, 2));
      this._setFileContentsAsValue(`hedera.nodes.${nodeIndex}.blockNodesJson`, blockNodesJsonPath, yamlRoot);
    }
  }

  /**
   * Parse a KEY=VALUE env file and override defaults.root.extraEnvironment in the Helm values
   * so that pod-level environment variables match the application.env content.
   */
  private applyApplicationEnvToExtraEnv(applicationEnvironmentPath: string, yamlRoot: AnyObject): void {
    if (!fs.existsSync(applicationEnvironmentPath)) {
      return;
    }

    const extraEnvironment: AnyObject[] = [];
    for (const line of fs.readFileSync(applicationEnvironmentPath, 'utf8').split('\n')) {
      const trimmed: string = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const equalsIndex: number = trimmed.indexOf('=');
      if (equalsIndex > 0) {
        extraEnvironment.push({name: trimmed.slice(0, equalsIndex), value: trimmed.slice(equalsIndex + 1)});
      }
    }

    if (extraEnvironment.length > 0) {
      this._setChartItems('defaults.root', {extraEnv: extraEnvironment}, yamlRoot);
    }
  }

  public async resourcesForNetworkUpgrade(
    itemPath: string,
    fileName: string,
    stagingDirectory: string,
    yamlRoot: AnyObject,
    deploymentName?: DeploymentName,
  ): Promise<void> {
    const filePath: string = PathEx.join(stagingDirectory, 'templates', fileName);

    if (!fs.existsSync(filePath)) {
      return;
    }

    if (fileName === constants.APPLICATION_PROPERTIES) {
      if (deploymentName) {
        await this.updateApplicationPropertiesWithRealmAndShard(
          filePath,
          this.localConfig.configuration.realmForDeployment(deploymentName),
          this.localConfig.configuration.shardForDeployment(deploymentName),
        );
      }
      await this.updateApplicationPropertiesForBlockNode(filePath);
    }

    this._setFileContentsAsValue(itemPath, filePath, yamlRoot);
  }

  /**
   * Prepare a values file for Solo Helm chart
   * @param consensusNodes - the list of consensus nodes
   * @param deploymentName
   * @param applicationPropertiesPath
   * @param jfrFile - the name of the custom JFR settings file to use for recording (basename only)
   * @param stagingOptions
   * @returns mapping of cluster-ref to the full path to the values file
   */
  public async prepareValuesForSoloChart(
    consensusNodes: ConsensusNode[],
    deploymentName: DeploymentName,
    applicationPropertiesPath: string,
    jfrFile: string = '',
    stagingOptions?: Partial<ProfileManagerStagingOptions>,
  ): Promise<Record<ClusterReferenceName, string>> {
    const filesMapping: Record<ClusterReferenceName, string> = {};

    for (const [clusterReference] of this.remoteConfig.getClusterRefs()) {
      const nodeAliases: NodeAliases = consensusNodes
        .filter((node): boolean => node.cluster === clusterReference)
        .map((node): NodeAlias => node.name);

      // generate the YAML
      const yamlRoot: AnyObject = {};

      await this.prepareStagingDirectory(
        consensusNodes,
        nodeAliases,
        yamlRoot,
        deploymentName,
        applicationPropertiesPath,
        stagingOptions,
      );

      // If a JFR settings file is provided, read the defaults from solo-values.yaml,
      // find the JAVA_OPTS entry in defaults.root.extraEnv, and append the
      // -XX:StartFlightRecording flags so that the recorder starts automatically
      // when the consensus node JVM launches.
      if (jfrFile !== '') {
        const soloValuesYaml: AnyObject = yaml.parse(
          fs.readFileSync(constants.SOLO_DEPLOYMENT_VALUES_FILE, 'utf8'),
        ) as AnyObject;
        const extraEnvironment: AnyObject[] = (soloValuesYaml?.defaults?.root?.extraEnv as AnyObject[]) ?? [];
        const javaOption: AnyObject | undefined = extraEnvironment.find(
          (environmentObject: AnyObject): boolean => environmentObject.name === 'JAVA_OPTS',
        );
        if (javaOption) {
          javaOption.value +=
            ' -XX:StartFlightRecording=dumponexit=true' +
            `,settings=${constants.HEDERA_HAPI_PATH}/data/config/${jfrFile}` +
            `,filename=${constants.HEDERA_HAPI_PATH}/output/recording.jfr`;
        } else {
          this.logger.warn(
            `JAVA_OPTS not found in ${constants.SOLO_DEPLOYMENT_VALUES_FILE}; JFR settings file '${jfrFile}' will not be applied`,
          );
        }
        this._setChartItems('defaults.root', soloValuesYaml.defaults.root, yamlRoot);
      }

      // Override defaults.root.extraEnv with values from the staged application.env file.
      // This must run AFTER the JFR block above, which overwrites defaults.root from solo-values.yaml.
      const stagingDirectory: string = Templates.renderStagingDir(
        this.configManager.getFlag(flags.cacheDir),
        this.configManager.getFlag(flags.consensusNodeVersion),
      );
      const applicationEnvironmentPath: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
      this.applyApplicationEnvToExtraEnv(applicationEnvironmentPath, yamlRoot);

      const cachedValuesFile: string = PathEx.join(this.cacheDir, `solo-${clusterReference}.yaml`);
      filesMapping[clusterReference] = await this.writeToYaml(cachedValuesFile, yamlRoot);
    }

    return filesMapping;
  }

  private resolveStagingOptions(options?: Partial<ProfileManagerStagingOptions>): ProfileManagerStagingOptions {
    // Fallbacks preserve compatibility for call sites that do not pass explicit options yet.
    // Newer call sites should pass command-scoped values to avoid cross-command interference.
    return {
      cacheDir: options?.cacheDir ?? this.configManager.getFlag(flags.cacheDir),
      releaseTag: options?.releaseTag ?? this.configManager.getFlag(flags.consensusNodeVersion),
      appName: options?.appName ?? this.configManager.getFlag(flags.app),
      chainId: options?.chainId ?? this.configManager.getFlag(flags.chainId),
    };
  }

  private async bumpHederaConfigVersion(applicationPropertiesPath: string): Promise<void> {
    const fileContents: string = await readFile(applicationPropertiesPath, 'utf8');
    const lines: string[] = fileContents.split('\n');

    for (const line of lines) {
      if (line.startsWith('hedera.config.version=')) {
        const version: number = Number.parseInt(line.split('=', 2)[1], 10) + 1;
        lines[lines.indexOf(line)] = `hedera.config.version=${version}`;
        break;
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n'));
  }

  /**
   * Merge a user-supplied application.properties into the existing staging file.
   * Solo's defaults (already written to stagingPath) are the base; for each key in the
   * user's file the existing line is replaced in-place.  Keys not present in the base
   * are appended at the end.  This avoids duplicate entries while preserving every
   * Solo default the user did not explicitly override.
   */
  private async mergeApplicationProperties(stagingPath: string, userFilePath: string): Promise<void> {
    this.logger.debug(`Merging user application.properties '${userFilePath}' into staging '${stagingPath}'`);
    const stagingContent: string = await readFile(stagingPath, 'utf8');
    const userContent: string = await readFile(userFilePath, 'utf8');

    // Parse user file into key→value map (comments and blank lines are skipped)
    const userProperties: Map<string, string> = new Map<string, string>();
    for (const line of userContent.split('\n')) {
      const trimmed: string = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const equalsIndex: number = trimmed.indexOf('=');
      if (equalsIndex > 0) {
        userProperties.set(trimmed.slice(0, equalsIndex).trim(), trimmed.slice(equalsIndex + 1));
      }
    }

    // Walk staging lines, replacing values for keys the user supplied
    const appliedKeys: Set<string> = new Set<string>();
    const resultLines: string[] = [];
    for (const line of stagingContent.split('\n')) {
      const trimmed: string = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        resultLines.push(line);
        continue;
      }
      const equalsIndex: number = trimmed.indexOf('=');
      if (equalsIndex > 0) {
        const key: string = trimmed.slice(0, equalsIndex).trim();
        if (userProperties.has(key)) {
          resultLines.push(`${key}=${userProperties.get(key)}`);
          appliedKeys.add(key);
        } else {
          resultLines.push(line);
        }
      } else {
        resultLines.push(line);
      }
    }

    // Append keys from user's file that were not present in Solo's default
    for (const [key, value] of userProperties) {
      if (!appliedKeys.has(key)) {
        resultLines.push(`${key}=${value}`);
      }
    }

    await writeFile(stagingPath, resultLines.join('\n'));
  }

  private async isApplicationPropertiesOverwriteEnabled(userFilePath: string): Promise<boolean> {
    const userContent: string = await readFile(userFilePath, 'utf8');
    return userContent.split('\n').some((line: string): boolean => {
      const trimmed: string = line.trim();
      return trimmed.startsWith('#') && trimmed.includes(constants.APPLICATION_PROPERTIES_ENABLE_OVERWRITE_MARKER);
    });
  }

  private async updateApplicationPropertiesForBlockNode(applicationPropertiesPath: string): Promise<void> {
    const blockNodes: BlockNodeStateSchema[] = this.remoteConfig.configuration.components.state.blockNodes;
    const hasDeployedBlockNodes: boolean = blockNodes.length > 0;
    if (!hasDeployedBlockNodes) {
      return;
    }

    const lines: string[] = await readFile(applicationPropertiesPath, 'utf8').then((fileText): string[] =>
      fileText.split('\n'),
    );

    const applicationPropertiesText: string = lines.join('\n');
    const tssEnabled: boolean = this.remoteConfig.configuration.state.tssEnabled ?? true;
    const streamMode: string = Helpers.resolveBlockStreamModeForConsensusVersion(
      Helpers.parseBlockStreamMode(applicationPropertiesText),
      this.remoteConfig.configuration.versions.consensusNode,
      hasDeployedBlockNodes,
      Helpers.parseStreamWrappedRecordBlocks(applicationPropertiesText),
      tssEnabled,
    );
    Helpers.updateBlockStreamPropertiesForMode(lines, streamMode);

    // streamMode=BOTH sends both native blocks (BLOCK_HEADER) and Wrapped Record Blocks
    // (ROUND_HEADER) to the block node.  The block node silently drops ROUND_HEADER items
    // because they fail its hasBlockHeader() check, creating gaps that permanently stall the
    // mirror importer on NOT_AVAILABLE.  Set this here so the CN pod reads it at first startup;
    // the post-start ConfigMap update in createAndCopyBlockNodeJsonFileForConsensusNode is too
    // late because the JVM has already cached its configuration by then.
    Helpers.ensureWrappedRecordBlocksDisabled(lines, streamMode);

    await writeFile(applicationPropertiesPath, lines.join('\n') + '\n');
  }

  private async updateApplicationPropertiesWithChainId(
    applicationPropertiesPath: string,
    chainId: string,
  ): Promise<void> {
    const fileText: string = await readFile(applicationPropertiesPath, 'utf8');
    const lines: string[] = fileText.split('\n');

    for (const line of lines) {
      if (line.startsWith('contracts.chainId=')) {
        lines[lines.indexOf(line)] = `contracts.chainId=${chainId}`;
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n') + '\n');
  }

  private async updateBoostrapPropertiesWithChainId(bootstrapPropertiesPath: string, chainId: string): Promise<void> {
    const fileText: string = await readFile(bootstrapPropertiesPath, 'utf8');
    const lines: string[] = fileText.split('\n');

    for (const line of lines) {
      if (line.startsWith('contracts.chainId=')) {
        lines[lines.indexOf(line)] = `contracts.chainId=${chainId}`;
      }
    }

    await writeFile(bootstrapPropertiesPath, lines.join('\n') + '\n');
  }

  private async updateApplicationPropertiesWithRealmAndShard(
    applicationPropertiesPath: string,
    realm: Realm,
    shard: Shard,
  ): Promise<void> {
    const fileContents: string = await readFile(applicationPropertiesPath, 'utf8');
    const lines: string[] = fileContents.split('\n');

    Helpers.upsertApplicationProperty(lines, 'hedera.realm', `${realm}`);
    Helpers.upsertApplicationProperty(lines, 'hedera.shard', `${shard}`);

    let releaseTag: SemanticVersion<string> = new SemanticVersion<string>(versions.HEDERA_PLATFORM_VERSION);
    try {
      releaseTag = this.remoteConfig.configuration.versions.consensusNode;
    } catch {
      // Guard
    }

    let tssEnabled: boolean = false;
    try {
      tssEnabled = this.remoteConfig.configuration.state.tssEnabled;
    } catch {
      // Guard
    }

    if (!releaseTag.lessThan(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS) && tssEnabled) {
      if (!ProfileManager.hasApplicationProperty(lines, 'tss.hintsEnabled')) {
        Helpers.upsertApplicationProperty(lines, 'tss.hintsEnabled', 'true');
      }

      if (!ProfileManager.hasApplicationProperty(lines, 'tss.historyEnabled')) {
        Helpers.upsertApplicationProperty(lines, 'tss.historyEnabled', 'true');
      }

      if (!ProfileManager.hasApplicationProperty(lines, 'tss.forceMockSignatures')) {
        Helpers.upsertApplicationProperty(lines, 'tss.forceMockSignatures', 'false');
      }

      if (
        this.remoteConfig.configuration.state.wrapsEnabled &&
        !ProfileManager.hasApplicationProperty(lines, 'tss.wrapsEnabled')
      ) {
        Helpers.upsertApplicationProperty(lines, 'tss.wrapsEnabled', 'true');
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n') + '\n');
  }

  private static hasApplicationProperty(lines: string[], key: string): boolean {
    const propertyPrefix: string = `${key}=`;
    return lines.some((line: string): boolean => line.startsWith(propertyPrefix));
  }

  public async prepareValuesForNodeTransaction(
    applicationPropertiesPath: string,
    configTxtPath?: string,
  ): Promise<string> {
    const yamlRoot: AnyObject = {};
    if (configTxtPath) {
      this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot);
    }
    await this.updateApplicationPropertiesForBlockNode(applicationPropertiesPath);
    await this.bumpHederaConfigVersion(applicationPropertiesPath);
    this._setFileContentsAsValue('hedera.configMaps.applicationProperties', applicationPropertiesPath, yamlRoot);

    const cachedValuesFile: string = PathEx.join(this.cacheDir, 'solo-node-transaction.yaml');
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  /**
   * Writes the YAML to file.
   *
   * @param cachedValuesFile - the target file to write the YAML root to.
   * @param yamlRoot - object to turn into YAML and write to file.
   */
  public async writeToYaml(cachedValuesFile: Path, yamlRoot: AnyObject): Promise<string> {
    return await new Promise<string>((resolve, reject): void => {
      fs.writeFile(cachedValuesFile, yaml.stringify(yamlRoot), (error): void => {
        if (error) {
          reject(error);
        }

        resolve(cachedValuesFile);
      });
    });
  }

  /**
   * Writes the contents of a file as a value for the given nested item path in the YAML object
   * @param itemPath - nested item path in the YAML object to store the file contents
   * @param valueFilePath - path to the file whose contents will be stored in the YAML object
   * @param yamlRoot - root of the YAML object
   */
  private _setFileContentsAsValue(itemPath: string, valueFilePath: string, yamlRoot: AnyObject): void {
    const fileContents: string = fs.readFileSync(valueFilePath, 'utf8');
    this._setValue(itemPath, fileContents, yamlRoot);
  }

  /**
   * Extracts gossip endpoints from saved state (network.json) if it exists
   * @param consensusNode - the consensus node to check
   * @param nodeSeq - the node sequence number (index in roster)
   * @returns the saved endpoint address or undefined if no saved state exists or IP is no longer valid
   * @private
   */
  private async extractSavedEndpoint(
    consensusNode: ConsensusNode,
    nodeSeq: number,
    gossipFqdnRestricted: boolean,
  ): Promise<Address | undefined> {
    try {
      const k8: K8 = this.k8Factory.getK8(consensusNode.context);
      const networkJsonPath: string = `${constants.HEDERA_HAPI_PATH}/output/network.json`;

      // Check if network.json exists in the pod
      const pods: Pod[] = await k8
        .pods()
        .list(NamespaceName.of(consensusNode.namespace), [`app=network-${consensusNode.name}`]);
      if (pods.length === 0) {
        return undefined;
      }

      const pod: Pod | undefined = pods.find((candidate: Pod): boolean => Boolean(candidate?.podReference)) ?? pods[0];
      const podReference: PodReference | null | undefined = pod?.podReference;
      if (!podReference) {
        return undefined;
      }

      // Get container reference
      const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
      const container: Container = k8.containers().readByRef(containerReference);

      // Try to read network.json from the pod
      const networkJsonContent: string = await container.execContainer(['cat', networkJsonPath]);

      if (!networkJsonContent || networkJsonContent.includes('No such file')) {
        return undefined;
      }

      const networkJson: Record<string, unknown> = JSON.parse(networkJsonContent);
      const nodeMetadata: unknown = networkJson?.nodeMetadata?.[nodeSeq];
      const rosterEntry: {gossipEndpoint?: Array<Record<string, unknown>>} | undefined = (
        nodeMetadata as {rosterEntry?: {gossipEndpoint?: Array<Record<string, unknown>>}} | undefined
      )?.rosterEntry;
      const gossipEndpointRaw: Record<string, unknown> | undefined = rosterEntry?.gossipEndpoint?.[0];
      const port: number = (gossipEndpointRaw?.port as number) || 0;
      const domainName: string | undefined =
        typeof gossipEndpointRaw?.domainName === 'string' ? gossipEndpointRaw.domainName : undefined;
      const ipAddressV4: string | undefined =
        typeof gossipEndpointRaw?.ipAddressV4 === 'string' ? gossipEndpointRaw.ipAddressV4 : undefined;

      if (!gossipEndpointRaw) {
        return undefined;
      }

      // Check if endpoint uses domain name (FQDN)
      if (domainName) {
        if (gossipFqdnRestricted) {
          this.logger.warn(
            `Saved endpoint ${domainName}:${port} for ${consensusNode.name} is an FQDN while gossip FQDN is restricted, falling back to current service address`,
          );
          return undefined;
        }

        this.logger.info(`Found saved endpoint for ${consensusNode.name}: ${domainName}:${port} (FQDN)`);
        return new Address(port, domainName);
      }

      // Check if endpoint uses IP address
      if (ipAddressV4) {
        // Decode base64 IP address
        const base64Ip: string = ipAddressV4 as string;
        const ipBytes: Buffer = Buffer.from(base64Ip, 'base64');
        const ipAddress: string = [...ipBytes].join('.');

        // Validate the saved IP still belongs to this node service.
        const serviceName: string = `network-${consensusNode.name}-svc`;
        const service:
          {spec?: {clusterIP?: string}; status?: {loadBalancer?: {ingress?: Array<{ip?: string}>}}} | undefined =
          await k8.services().read(NamespaceName.of(consensusNode.namespace), serviceName);
        const serviceIpAddresses: string[] = [
          ...(service?.status?.loadBalancer?.ingress ?? [])
            .map((ingress: {ip?: string}): string | undefined => ingress.ip)
            .filter(Boolean),
          ...(service?.spec?.clusterIP && service.spec.clusterIP !== 'None' ? [service.spec.clusterIP] : []),
        ];
        if (!serviceIpAddresses.includes(ipAddress)) {
          this.logger.warn(
            `Saved endpoint ${ipAddress}:${port} for ${consensusNode.name} does not match current ${serviceName} IPs ${serviceIpAddresses.join(',') || 'undefined'}, falling back to current service address`,
          );
          return undefined;
        }

        this.logger.info(`Found saved endpoint for ${consensusNode.name}: ${ipAddress}:${port} (IP)`);
        return new Address(port, ipAddress);
      }

      return undefined;
    } catch (error: Error | unknown) {
      // If anything fails, return undefined to fall back to getExternalAddress
      this.logger.debug(
        `Could not extract saved endpoint for ${consensusNode.name}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return undefined;
    }
  }

  /**
   * Prepares config.txt file for the node
   * @param nodeAccountMap - the map of node aliases to account IDs
   * @param consensusNodes - the list of consensus nodes
   * @param destinationPath
   * @param [appName] - the app name (default: HederaNode.jar)
   * @param [chainId] - chain ID (298 for local network)
   * @param [gossipFqdnRestricted] - whether gossip FQDN is restricted
   * @returns the config.txt file path
   */
  public async prepareConfigTxt(
    nodeAccountMap: Map<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    destinationPath: string,
    appName: string = constants.HEDERA_APP_NAME,
    chainId: string = constants.HEDERA_CHAIN_ID,
    gossipFqdnRestricted: boolean = true,
  ): Promise<string> {
    if (!nodeAccountMap || nodeAccountMap.size === 0) {
      throw new SoloErrors.validation.missingArgument('nodeAccountMap the map of node IDs to account IDs is required');
    }

    if (!fs.existsSync(destinationPath)) {
      throw new SoloErrors.validation.illegalArgument(
        `config destPath does not exist: ${destinationPath}`,
        destinationPath,
      );
    }

    const configFilePath: string = PathEx.join(destinationPath, 'config.txt');
    if (fs.existsSync(configFilePath)) {
      fs.unlinkSync(configFilePath);
    }

    // init variables
    const internalPort: number = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    const externalPort: number = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
    const nodeStakeAmount: number = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

    try {
      const configLines: string[] = [`swirld, ${chainId}`, `app, ${appName}`];

      const shouldAvoidGossipFqdn: boolean =
        gossipFqdnRestricted || Helpers.hasMultipleKubernetesContexts(consensusNodes);

      let nodeSeq: number = 0;
      for (const consensusNode of consensusNodes) {
        const internalIP: string = constants.LOCAL_HOST;

        // First try to extract endpoint from saved state (migration scenario)
        let address: Address | undefined = await this.extractSavedEndpoint(
          consensusNode,
          nodeSeq,
          shouldAvoidGossipFqdn,
        );

        // If no saved state, get current external address
        if (!address) {
          address = await Address.getExternalAddress(
            consensusNode,
            this.k8Factory.getK8(consensusNode.context),
            externalPort,
            shouldAvoidGossipFqdn,
          );
        }

        const account: string | undefined = nodeAccountMap.get(consensusNode.name as NodeAlias);

        configLines.push(
          `address, ${nodeSeq}, ${nodeSeq}, ${consensusNode.name}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${address.hostString()}, ${address.port}, ${account}`,
        );

        nodeSeq += 1;
      }

      fs.writeFileSync(configFilePath, configLines.join('\n'));
      return configFilePath;
    } catch (error: Error | unknown) {
      throw new SoloErrors.component.genesisDataGenerationFailed(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async getGossipFqdnRestricted(
    consensusNodes: ConsensusNode[],
    applicationPropertiesPath: string,
  ): Promise<boolean> {
    const firstNode: ConsensusNode | undefined = consensusNodes[0];
    return await Helpers.resolveGossipFqdnRestricted({
      k8: firstNode ? this.k8Factory.getK8(firstNode.context) : undefined,
      namespace: firstNode ? NamespaceName.of(firstNode.namespace) : undefined,
      applicationPropertiesPath,
      cacheDir: constants.SOLO_CACHE_DIR,
      resourcesDir: constants.RESOURCES_DIR,
    });
  }
}
