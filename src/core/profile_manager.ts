/**
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'fs';
import path from 'path';
import {SoloError, IllegalArgumentError, MissingArgumentError} from './errors.js';
import * as yaml from 'yaml';
import dot from 'dot-object';
import * as semver from 'semver';
import {readFile, writeFile} from 'fs/promises';

import {Flags as flags} from '../commands/flags.js';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config_manager.js';
import * as helpers from './helpers.js';
import {getNodeAccountMap} from './helpers.js';
import {type SemVer} from 'semver';
import {type SoloLogger} from './logging.js';
import {type AnyObject, type DirPath, type NodeAlias, type NodeAliases, type Path} from '../types/aliases.js';
import {type Optional} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import * as versions from '../../version.js';
import {NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {type ConsensusNode} from './model/consensus_node.js';
import {type K8Factory} from './kube/k8_factory.js';

@injectable()
export class ProfileManager {
  private readonly logger: SoloLogger;
  private readonly configManager: ConfigManager;
  private readonly cacheDir: DirPath;
  private readonly k8Factory: K8Factory;

  private profiles: Map<string, AnyObject>;
  private profileFile: Optional<string>;

  constructor(
    @inject(InjectTokens.SoloLogger) logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) configManager?: ConfigManager,
    @inject(InjectTokens.CacheDir) cacheDir?: DirPath,
    @inject(InjectTokens.K8Factory) k8Factory?: K8Factory,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.cacheDir = path.resolve(patchInject(cacheDir, InjectTokens.CacheDir, this.constructor.name));
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);

    this.profiles = new Map();
  }

  /**
   * Load profiles from a profile file and populate the profiles map.
   *
   * @param [forceReload = false] - forces the profiles map to override even if it exists.
   * @returns reference to the populated profiles map.
   *
   * @throws {IllegalArgumentError} if the profile file is not found.
   */
  loadProfiles(forceReload = false): Map<string, AnyObject> {
    const profileFile = this.configManager.getFlag<string>(flags.profileFile);
    if (!profileFile) throw new MissingArgumentError('profileFile is required');

    // return the cached value as quickly as possible
    if (this.profiles && this.profileFile === profileFile && !forceReload) {
      return this.profiles;
    }

    if (!fs.existsSync(profileFile)) throw new IllegalArgumentError(`profileFile does not exist: ${profileFile}`);

    // load profile file
    this.profiles = new Map();
    const yamlData = fs.readFileSync(profileFile, 'utf8');
    const profileItems = yaml.parse(yamlData) as Record<string, AnyObject>;

    // add profiles
    for (const key in profileItems) {
      let profile = profileItems[key];
      profile = profile || {};
      this.profiles.set(key, profile);
    }

    this.profileFile = profileFile;
    return this.profiles;
  }

  /**
   * Get profile from the profiles map, loads them on demand if they are not loaded already.
   *
   * @param profileName - profile name (key in the map).
   * @returns the profile.
   *
   * @throws {IllegalArgumentError} if profiles can't be loaded or the profile name is not found in the map.
   */
  getProfile(profileName: string): AnyObject {
    if (!profileName) throw new MissingArgumentError('profileName is required');
    if (!this.profiles || this.profiles.size <= 0) {
      this.loadProfiles();
    }

    if (!this.profiles || !this.profiles.has(profileName)) {
      throw new IllegalArgumentError(`Profile does not exists with name: ${profileName}`);
    }

    return this.profiles.get(profileName) as AnyObject;
  }

  /**
   * Set value in the YAML object
   * @param itemPath - item path in the yaml
   * @param value - value to be set
   * @param yamlRoot - root of the YAML object
   * @returns
   */
  _setValue(itemPath: string, value: any, yamlRoot: AnyObject): AnyObject {
    // find the location where to set the value in the YAML
    const itemPathParts: string[] = itemPath.split('.');
    let parent = yamlRoot;
    let current = parent;
    let prevItemPath = '';
    for (let itemPathPart of itemPathParts) {
      if (helpers.isNumeric(itemPathPart)) {
        // @ts-ignore
        itemPathPart = Number.parseInt(itemPathPart); // numeric path part can only be array index i.e., an integer
        if (!Array.isArray(parent[prevItemPath])) {
          parent[prevItemPath] = [];
        }

        if (!parent[prevItemPath][itemPathPart]) {
          parent[prevItemPath][itemPathPart] = {};
        }

        parent = parent[prevItemPath];
        prevItemPath = itemPathPart;
        current = parent[itemPathPart];
      } else {
        if (!current[itemPathPart]) {
          current[itemPathPart] = {};
        }

        parent = current;
        prevItemPath = itemPathPart;
        current = parent[itemPathPart];
      }
    }

    parent[prevItemPath] = value;
    return yamlRoot;
  }

  /**
   * Set items for the chart
   * @param itemPath - item path in the YAML, if empty then root of the YAML object will be used
   * @param items - the element object
   * @param yamlRoot - root of the YAML object to update
   */
  _setChartItems(itemPath: string, items: any, yamlRoot: AnyObject) {
    if (!items) return;

    const dotItems = dot.dot(items);

    for (const key in dotItems) {
      let itemKey = key;

      // if it is an array key like extraEnv[0].JAVA_OPTS, convert it into a dot separated key as extraEnv.0.JAVA_OPTS
      if (key.indexOf('[') !== -1) {
        itemKey = key.replace('[', '.').replace(']', '');
      }

      if (itemPath) {
        this._setValue(`${itemPath}.${itemKey}`, dotItems[key], yamlRoot);
      } else {
        this._setValue(itemKey, dotItems[key], yamlRoot);
      }
    }
  }

  async resourcesForConsensusPod(
    profile: AnyObject,
    consensusNodes: ConsensusNode[],
    nodeAliases: NodeAliases,
    yamlRoot: AnyObject,
  ): Promise<AnyObject> {
    if (!profile) throw new MissingArgumentError('profile is required');

    const accountMap = getNodeAccountMap(nodeAliases);

    // set consensus pod level resources
    for (let nodeIndex = 0; nodeIndex < nodeAliases.length; nodeIndex++) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeAliases[nodeIndex], yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.nodeId`, `${nodeIndex}`, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeAliases[nodeIndex]), yamlRoot);
    }

    const stagingDir = Templates.renderStagingDir(
      this.configManager.getFlag(flags.cacheDir),
      this.configManager.getFlag(flags.releaseTag),
    );

    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, {recursive: true});
    }

    const configTxtPath = await this.prepareConfigTxt(
      accountMap,
      consensusNodes,
      stagingDir,
      this.configManager.getFlag(flags.releaseTag),
      this.configManager.getFlag(flags.app),
      this.configManager.getFlag(flags.chainId),
      this.configManager.getFlag(flags.loadBalancerEnabled),
    );

    for (const flag of flags.nodeConfigFileFlags.values()) {
      const filePath = this.configManager.getFlag<string>(flag);
      if (!filePath) {
        throw new SoloError(`Configuration file path is missing for: ${flag.name}`);
      }

      const fileName = path.basename(filePath);
      const destPath = path.join(stagingDir, 'templates', fileName);
      this.logger.debug(`Copying configuration file to staging: ${filePath} -> ${destPath}`);

      fs.cpSync(filePath, destPath, {force: true});
    }

    this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot);
    this._setFileContentsAsValue(
      'hedera.configMaps.log4j2Xml',
      path.join(stagingDir, 'templates', 'log4j2.xml'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.settingsTxt',
      path.join(stagingDir, 'templates', 'settings.txt'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.applicationProperties',
      path.join(stagingDir, 'templates', 'application.properties'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.apiPermissionsProperties',
      path.join(stagingDir, 'templates', 'api-permission.properties'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.bootstrapProperties',
      path.join(stagingDir, 'templates', 'bootstrap.properties'),
      yamlRoot,
    );

    this._setFileContentsAsValue(
      'hedera.configMaps.applicationEnv',
      path.join(stagingDir, 'templates', 'application.env'),
      yamlRoot,
    );

    if (profile.consensus) {
      // set default for consensus pod
      this._setChartItems('defaults.root', profile.consensus.root, yamlRoot);

      // set sidecar resources
      for (const sidecar of constants.HEDERA_NODE_SIDECARS) {
        this._setChartItems(`defaults.sidecars.${sidecar}`, profile.consensus[sidecar], yamlRoot);
      }
    }

    return yamlRoot;
  }

  private resourcesForHaProxyPod(profile: AnyObject, yamlRoot: AnyObject) {
    if (!profile) throw new MissingArgumentError('profile is required');
    if (!profile.haproxy) return; // use chart defaults

    return this._setChartItems('defaults.haproxy', profile.haproxy, yamlRoot);
  }

  private resourcesForEnvoyProxyPod(profile: AnyObject, yamlRoot: AnyObject) {
    if (!profile) throw new MissingArgumentError('profile is required');
    if (!profile.envoyProxy) return; // use chart defaults
    return this._setChartItems('defaults.envoyProxy', profile.envoyProxy, yamlRoot);
  }

  private resourcesForHederaExplorerPod(profile: AnyObject, yamlRoot: AnyObject) {
    if (!profile) throw new MissingArgumentError('profile is required');
    if (!profile.explorer) return;
    return this._setChartItems('', profile.explorer, yamlRoot);
  }

  private resourcesForMinioTenantPod(profile: AnyObject, yamlRoot: AnyObject) {
    if (!profile) throw new MissingArgumentError('profile is required');
    // @ts-ignore
    if (!profile.minio || !profile.minio.tenant) return; // use chart defaults

    for (const poolIndex in profile.minio.tenant.pools) {
      const pool = profile.minio.tenant.pools[poolIndex];
      for (const prop in pool) {
        if (prop !== 'resources') {
          this._setValue(`minio-server.tenant.pools.${poolIndex}.${prop}`, pool[prop], yamlRoot);
        }
      }

      this._setChartItems(`minio-server.tenant.pools.${poolIndex}`, pool, yamlRoot);
    }

    return yamlRoot;
  }

  /**
   * Prepare a values file for Solo Helm chart
   * @param profileName - resource profile name
   * @param consensusNodes - the list of consensus nodes
   * @returns return the full path to the values file
   */
  public async prepareValuesForSoloChart(profileName: string, consensusNodes: ConsensusNode[]) {
    if (!profileName) throw new MissingArgumentError('profileName is required');
    const profile = this.getProfile(profileName);

    const nodeAliases = helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed));
    if (!nodeAliases) throw new SoloError('Node IDs are not set in the config');

    // generate the YAML
    const yamlRoot = {};
    await this.resourcesForConsensusPod(profile, consensusNodes, nodeAliases, yamlRoot);
    this.resourcesForHaProxyPod(profile, yamlRoot);
    this.resourcesForEnvoyProxyPod(profile, yamlRoot);
    this.resourcesForMinioTenantPod(profile, yamlRoot);

    const cachedValuesFile = path.join(this.cacheDir, `solo-${profileName}.yaml`);
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  private async bumpHederaConfigVersion(applicationPropertiesPath: string) {
    const lines = (await readFile(applicationPropertiesPath, 'utf-8')).split('\n');

    for (const line of lines) {
      if (line.startsWith('hedera.config.version=')) {
        const version = parseInt(line.split('=')[1]) + 1;
        lines[lines.indexOf(line)] = `hedera.config.version=${version}`;
        break;
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n'));
  }

  public async prepareValuesForNodeAdd(configTxtPath: string, applicationPropertiesPath: string) {
    const yamlRoot = {};
    this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot);
    await this.bumpHederaConfigVersion(applicationPropertiesPath);
    this._setFileContentsAsValue('hedera.configMaps.applicationProperties', applicationPropertiesPath, yamlRoot);

    const cachedValuesFile = path.join(this.cacheDir, 'solo-node-add.yaml');
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  /**
   * Prepare a values file for rpc-relay Helm chart
   * @param profileName - resource profile name
   * @returns return the full path to the values file
   */
  public async prepareValuesForRpcRelayChart(profileName: string) {
    if (!profileName) throw new MissingArgumentError('profileName is required');
    const profile = this.getProfile(profileName) as AnyObject;
    if (!profile.rpcRelay) return Promise.resolve(); // use chart defaults

    // generate the YAML
    const yamlRoot = {};
    this._setChartItems('', profile.rpcRelay, yamlRoot);

    const cachedValuesFile = path.join(this.cacheDir, `rpcRelay-${profileName}.yaml`);
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  public async prepareValuesHederaExplorerChart(profileName: string) {
    if (!profileName) throw new MissingArgumentError('profileName is required');
    const profile = this.getProfile(profileName) as AnyObject;
    // generate the YAML
    const yamlRoot = {};
    this.resourcesForHederaExplorerPod(profile, yamlRoot);

    const cachedValuesFile = path.join(this.cacheDir, `explorer-${profileName}.yaml`);
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  /**
   * Writes the YAML to file.
   *
   * @param cachedValuesFile - the target file to write the YAML root to.
   * @param yamlRoot - object to turn into YAML and write to file.
   */
  private async writeToYaml(cachedValuesFile: Path, yamlRoot: AnyObject) {
    return await new Promise<string>((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.stringify(yamlRoot), err => {
        if (err) {
          reject(err);
        }

        resolve(cachedValuesFile);
      });
    });
  }

  /**
   * Prepare a values file for mirror-node Helm chart
   * @param profileName - resource profile name
   * @returns the full path to the values file
   */
  public async prepareValuesForMirrorNodeChart(profileName: string) {
    if (!profileName) throw new MissingArgumentError('profileName is required');
    const profile = this.getProfile(profileName) as AnyObject;
    if (!profile.mirror) return Promise.resolve(); // use chart defaults

    // generate the YAML
    const yamlRoot = {};
    if (profile.mirror.postgresql) {
      if (profile.mirror.postgresql.persistence) {
        this._setValue('postgresql.persistence.size', profile.mirror.postgresql.persistence.size, yamlRoot);
      }

      this._setChartItems('postgresql.postgresql', profile.mirror.postgresql.postgresql, yamlRoot);
    }

    this._setChartItems('importer', profile.mirror.importer, yamlRoot);
    this._setChartItems('rest', profile.mirror.rest, yamlRoot);
    this._setChartItems('web3', profile.mirror.web3, yamlRoot);
    this._setChartItems('grpc', profile.mirror.grpc, yamlRoot);
    this._setChartItems('monitor', profile.mirror.monitor, yamlRoot);

    const cachedValuesFile = path.join(this.cacheDir, `mirror-${profileName}.yaml`);
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  /**
   * Writes the contents of a file as a value for the given nested item path in the YAML object
   * @param itemPath - nested item path in the YAML object to store the file contents
   * @param valueFilePath - path to the file whose contents will be stored in the YAML object
   * @param yamlRoot - root of the YAML object
   */
  private _setFileContentsAsValue(itemPath: string, valueFilePath: string, yamlRoot: AnyObject) {
    const fileContents = fs.readFileSync(valueFilePath, 'utf8');
    this._setValue(itemPath, fileContents, yamlRoot);
  }

  /**
   * Prepares config.txt file for the node
   * @param nodeAccountMap - the map of node aliases to account IDs
   * @param consensusNodes - the list of consensus nodes
   * @param destPath - path to the destination directory to write the config.txt file
   * @param releaseTagOverride - release tag override
   * @param [appName] - the app name (default: HederaNode.jar)
   * @param [chainId] - chain ID (298 for local network)
   * @param [loadBalancerEnabled] - whether the load balancer is enabled (flag is not set by default)
   * @returns the config.txt file path
   */
  async prepareConfigTxt(
    nodeAccountMap: Map<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    destPath: string,
    releaseTagOverride: string,
    appName = constants.HEDERA_APP_NAME,
    chainId = constants.HEDERA_CHAIN_ID,
    loadBalancerEnabled: boolean = false,
  ) {
    let releaseTag = releaseTagOverride;
    if (!nodeAccountMap || nodeAccountMap.size === 0) {
      throw new MissingArgumentError('nodeAccountMap the map of node IDs to account IDs is required');
    }

    if (!releaseTag) releaseTag = versions.HEDERA_PLATFORM_VERSION;

    if (!fs.existsSync(destPath)) {
      throw new IllegalArgumentError(`config destPath does not exist: ${destPath}`, destPath);
    }

    const configFilePath = path.join(destPath, 'config.txt');
    if (fs.existsSync(configFilePath)) {
      fs.unlinkSync(configFilePath);
    }

    // init variables
    const internalPort = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    const externalPort = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
    const nodeStakeAmount = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

    // @ts-expect-error - TS2353: Object literal may only specify known properties, and includePrerelease does not exist in type Options
    const releaseVersion = semver.parse(releaseTag, {includePrerelease: true}) as SemVer;

    try {
      const configLines: string[] = [];
      configLines.push(`swirld, ${chainId}`);
      configLines.push(`app, ${appName}`);

      let nodeSeq = 0;
      for (const consensusNode of consensusNodes) {
        const internalIP: string = helpers.getInternalIp(
          releaseVersion,
          NamespaceName.of(consensusNode.namespace),
          consensusNode.name as NodeAlias,
        );

        // const externalIP = consensusNode.fullyQualifiedDomainName;
        const externalIP = await helpers.getExternalAddress(
          consensusNode,
          this.k8Factory.getK8(consensusNode.context),
          loadBalancerEnabled,
        );

        const account = nodeAccountMap.get(consensusNode.name as NodeAlias);

        configLines.push(
          `address, ${nodeSeq}, ${nodeSeq}, ${consensusNode.name}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${externalIP}, ${externalPort}, ${account}`,
        );

        nodeSeq += 1;
      }

      // TODO: remove once we no longer need less than v0.56
      if (releaseVersion.minor >= 41 && releaseVersion.minor < 56) {
        configLines.push(`nextNodeId, ${nodeSeq}`);
      }

      fs.writeFileSync(configFilePath, configLines.join('\n'));
      return configFilePath;
    } catch (e: Error | unknown) {
      throw new SoloError(
        `failed to generate config.txt, ${e instanceof Error ? (e as Error).message : 'unknown error'}`,
        e,
      );
    }
  }
}
