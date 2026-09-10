// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDeployConfigClass} from '../../one-shot-single-deploy-config-class.js';
import {type OneShotVersionsObject} from '../../one-shot-versions-object.js';
import {type SoloConfigFileVersions} from '../../solo-config-file-versions.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../command-definitions/keys-command-definition.js';
import {Flags} from '../../../flags.js';
import {
  appendConfigToArgv,
  argvPushGlobalFlags,
  negatedOptionFromFlag,
  newArgv,
  optionFromFlag,
} from '../../../command-helpers.js';
import * as constants from '../../../../core/constants.js';
import {Helpers} from '../../../../core/helpers.js';
import * as version from '../../../../../version.js';
import {type AnyObject, type ArgvStruct, type NodeAlias} from '../../../../types/aliases.js';
import {CacheCommandDefinition} from '../../../command-definitions/cache-command-definition.js';
import {SINGLE_DESTROY_COMMAND} from '../../one-shot-command-paths.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import {Templates} from '../../../../core/templates.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

const MIRROR_NODE_ID: number = 1;
const GITHUB_RELEASES_PER_PAGE: number = 100;

interface GitHubReleaseWithMetadata {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
}

export class DeployArgvBuilders {
  private static readonly CONSENSUS_RELEASES_URL: string =
    'https://api.github.com/repos/hiero-ledger/hiero-consensus-node/releases';
  private static readonly MIRROR_RELEASES_URL: string =
    'https://api.github.com/repos/hiero-ledger/hiero-mirror-node/releases';
  private static readonly EXPLORER_RELEASES_URL: string =
    'https://api.github.com/repos/hiero-ledger/hiero-mirror-node-explorer/releases';
  private static readonly RELAY_RELEASES_URL: string =
    'https://api.github.com/repos/hiero-ledger/hiero-json-rpc-relay/releases';
  private static readonly BLOCK_NODE_RELEASES_URL: string =
    'https://api.github.com/repos/hiero-ledger/hiero-block-node/releases';

  private static isBlockNodeEnvironmentEnabled(): boolean {
    return (process.env.ONE_SHOT_WITH_BLOCK_NODE || 'false').toLowerCase() === 'true';
  }

  public static shouldDeployBlockNode(config: OneShotSingleDeployConfigClass): boolean {
    void config;
    return this.isBlockNodeEnvironmentEnabled();
  }

  private static shouldSkipMinioSetup(config: OneShotSingleDeployConfigClass): boolean {
    if (!this.shouldDeployBlockNode(config)) {
      return false;
    }

    const consensusNodeVersion: string = config.versions.consensus || version.HEDERA_PLATFORM_VERSION;
    const blockStreamMode: string = constants.getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') ?? 'BLOCKS';
    return blockStreamMode === 'BLOCKS' && Helpers.requiresRsaBootstrap(consensusNodeVersion, blockStreamMode);
  }

  private static shouldInjectRsaBootstrapValuesFile(config: OneShotSingleDeployConfigClass): boolean {
    if (!this.shouldDeployBlockNode(config)) {
      return false;
    }

    const consensusNodeVersion: string = config.versions.consensus || version.HEDERA_PLATFORM_VERSION;
    const blockStreamMode: string = constants.getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') ?? 'BLOCKS';
    return Helpers.requiresRsaBootstrap(consensusNodeVersion, blockStreamMode);
  }

  /**
   * Builds the argv for `one-shot single destroy`, used by the deploy pipeline to auto-clean any
   * pre-existing one-shot state before a fresh deploy. Runs quietly against the same deployment.
   */
  public static buildOneShotSingleDestroyArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...SINGLE_DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildBlockNodeArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(...BlockCommandDefinition.ADD_COMMAND.split(' '), optionFromFlag(Flags.deployment), config.deployment);
    if (this.shouldDeployBlockNode(config)) {
      argv.push(optionFromFlag(Flags.blockNodeTssOverlay));
    }

    const consensusNodeVersionFlag: string = optionFromFlag(Flags.consensusNodeVersion);
    const legacyReleaseTagFlag: string = optionFromFlag(Flags.releaseTag);
    const blockNodeConfiguration: AnyObject = {...config.blockNodeConfiguration};
    const consensusVersionOverride: unknown =
      blockNodeConfiguration[consensusNodeVersionFlag] ??
      blockNodeConfiguration[legacyReleaseTagFlag] ??
      blockNodeConfiguration.releaseTag ??
      blockNodeConfiguration.consensusNodeVersion ??
      blockNodeConfiguration['consensus-node-version'] ??
      blockNodeConfiguration['--releaseTag'];
    if (blockNodeConfiguration[consensusNodeVersionFlag] === undefined && consensusVersionOverride !== undefined) {
      blockNodeConfiguration[consensusNodeVersionFlag] = consensusVersionOverride;
    }

    delete blockNodeConfiguration[legacyReleaseTagFlag];
    delete blockNodeConfiguration['--releaseTag'];
    delete blockNodeConfiguration.releaseTag;
    delete blockNodeConfiguration.consensusNodeVersion;
    delete blockNodeConfiguration['consensus-node-version'];

    // Build a local copy with the dev image values file appended, without mutating
    // config.blockNodeConfiguration — it may be an alias for another section's object
    // (e.g. via YAML anchors), causing the values file to leak into other commands.
    // When ONE_SHOT_BLOCK_NODE_PERF=true, also inject the messaging workaround values
    // (larger Disruptor ring buffer + memory, no JFR) before the solo-dev image override
    // so the settings apply but the image is still the solo-dev image.
    const blockExistingValuesFile: string = blockNodeConfiguration?.[Flags.getFormattedFlagKey(Flags.valuesFile)];
    const isPerfMode: boolean = constants.ONE_SHOT_BLOCK_NODE_PERF.toLowerCase() === 'true';
    const perfValuesFile: string | undefined = isPerfMode ? constants.BLOCK_NODE_MESSAGING_WORKAROUND_FILE : undefined;
    // WRB/RSA blocks require the block node's RSA address book before block 0 is verified.
    // Mirror can provide it later, but block-node startup must be seeded to avoid BAD_BLOCK_PROOF
    // on the first block.
    const rsaBootstrapValuesFile: string | undefined = DeployArgvBuilders.shouldInjectRsaBootstrapValuesFile(config)
      ? DeployArgvBuilders.writeRsaBootstrapInitContainerValuesFile(config.cacheDir, config.numberOfConsensusNodes)
      : undefined;
    const blockLocalConfig: AnyObject = {
      [optionFromFlag(Flags.blockNodeVersion)]: config.versions.blockNode,
      ...blockNodeConfiguration,
      [Flags.getFormattedFlagKey(Flags.valuesFile)]: [
        blockExistingValuesFile,
        perfValuesFile,
        rsaBootstrapValuesFile,
        constants.BLOCK_NODE_SOLO_DEV_FILE,
      ]
        .filter(Boolean)
        .join(','),
    };
    appendConfigToArgv(argv, blockLocalConfig);
    return argvPushGlobalFlags(argv);
  }

  /**
   * Writes a Helm values YAML that overrides the block node's init container to also write the
   * RSA bootstrap roster file into the application-state PVC before the block node starts.
   *
   * Writing the file in the init container means the block node loads the RSA keys on its very
   * first startup — no pod restart is needed and the consensus node's gRPC publisher stream is
   * never interrupted by a restart.
   *
   * The file is written in RangedAddressBookHistory JSON format (block node v0.37.1+). When the
   * block node detects this format it treats it as a pre-loaded history and skips all Mirror Node
   * queries. Without this, the mirror eventually returns a TSS-era address book with a blank
   * rsaPubKey, which clears keyByNodeId, causing BAD_BLOCK_PROOF on the first WRB block.
   */
  private static writeRsaBootstrapInitContainerValuesFile(
    cacheDirectory: string,
    numberOfConsensusNodes: number,
  ): string {
    const keysDirectory: string = path.join(cacheDirectory, 'keys');
    const nodeAliases: NodeAlias[] = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, 0);
    const nodeAddresses: Array<{RSAPubKey: string; nodeId: number}> = nodeAliases.map(
      (alias: NodeAlias): {RSAPubKey: string; nodeId: number} => {
        const certPem: string = fs.readFileSync(
          path.join(keysDirectory, Templates.renderGossipPemPublicKeyFile(alias)),
          'utf8',
        );
        const spkiDer: Buffer = new crypto.X509Certificate(certPem).publicKey.export({
          format: 'der',
          type: 'spki',
        }) as Buffer;
        return {RSAPubKey: spkiDer.toString('hex'), nodeId: Templates.nodeIdFromNodeAlias(alias)};
      },
    );
    // RangedAddressBookHistory format: single open-ended era (endBlock: "-1" = sentinel).
    // The block node parses this as history, records metrics, and returns without scheduling any
    // Mirror Node queries — so the TSS-era address book (blank rsaPubKey) never clears keyByNodeId.
    const bootstrapJson: string = JSON.stringify({
      addressBooks: [{addressBook: {nodeAddress: nodeAddresses}, startBlock: '0', endBlock: '-1'}],
    });

    // Reconstruct the full init-storage-dirs init container, extending its command to also write
    // the RSA bootstrap file. Helm replaces list values entirely, so we must include all mounts.
    const content: string = yaml.stringify({
      blockNode: {
        config: {
          ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL: `http://mirror-${MIRROR_NODE_ID}-restjava:80`,
        },
        initContainers: [
          {
            name: 'init-storage-dirs',
            // Pinned rather than tracking the block node chart's floating `busybox` default, so the
            // override cannot pull a different image on a later deploy without a code change. Matches
            // the tag used by the block node's other init container and already in the image cache.
            image: 'busybox:1.36.1',
            command: [
              'sh',
              '-c',
              [
                'mkdir -p /application-state-pvc',
                'chown 2000:2000 /application-state-pvc',
                'chmod 700 /application-state-pvc',
                `printf '%s' '${bootstrapJson}' > /application-state-pvc/rsa-bootstrap-roster.json`,
                'mkdir -p /archive-pvc/archive-data',
                'chown 2000:2000 /archive-pvc/archive-data',
                'chmod 700 /archive-pvc/archive-data',
                'mkdir -p /live-pvc/live-data',
                'chown 2000:2000 /live-pvc/live-data',
                'chmod 700 /live-pvc/live-data',
              ].join(' && \\\n'),
            ],
            volumeMounts: [
              {name: 'application-state-storage', mountPath: '/application-state-pvc'},
              {name: 'archive-storage', mountPath: '/archive-pvc'},
              {name: 'live-storage', mountPath: '/live-pvc'},
              {name: 'logging-storage', mountPath: '/logging-pvc'},
            ],
          },
        ],
      },
    });
    const filePath: string = path.join(os.tmpdir(), 'bn-rsa-bootstrap-init-container.yaml');
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  public static buildMirrorNodeArgv(config: OneShotSingleDeployConfigClass, deployPinger: boolean = true): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.enableIngress),
      optionFromFlag(Flags.parallelDeploy),
      config.parallelDeploy.toString(),
    );
    if (config.clusterHasOneShotPortMappings) {
      // Expose the mirror ingress controller via a stable Kind NodePort and skip the flaky
      // kubectl port-forward tunnel. One-shot only; standalone `mirror node add` is unaffected.
      // Only possible when this deploy created the Kind cluster with the one-shot
      // extraPortMappings; a pre-existing cluster keeps the legacy port-forward.
      argv.push(
        optionFromFlag(Flags.ingressControllerValueFile),
        constants.ONE_SHOT_MIRROR_INGRESS_NODEPORT_VALUES_FILE,
        negatedOptionFromFlag(Flags.forcePortForward),
      );
    }
    if (deployPinger && config.pinger) {
      argv.push(optionFromFlag(Flags.pinger));
    }
    if (this.shouldDeployBlockNode(config)) {
      argv.push(optionFromFlag(Flags.forceBlockNodeIntegration));
    }
    // Append HikariCP limits file without mutating the shared config object.
    const mirrorExistingValuesFile: string =
      config.mirrorNodeConfiguration?.[Flags.getFormattedFlagKey(Flags.valuesFile)];
    const mirrorLocalConfig: AnyObject = {
      [optionFromFlag(Flags.mirrorNodeVersion)]: config.versions.mirror,
      [optionFromFlag(Flags.soloChartVersion)]: config.versions.soloChart,
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      ...config.mirrorNodeConfiguration,
      [Flags.getFormattedFlagKey(Flags.valuesFile)]: mirrorExistingValuesFile
        ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
        : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
    };
    appendConfigToArgv(argv, mirrorLocalConfig);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildMirrorNodePingerUpgradeArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...MirrorCommandDefinition.UPGRADE_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.pinger),
      optionFromFlag(Flags.enableIngress),
    );
    if (config.clusterHasOneShotPortMappings) {
      // Keep the ingress controller on its stable NodePort and skip port-forward on re-upgrade too.
      argv.push(
        optionFromFlag(Flags.ingressControllerValueFile),
        constants.ONE_SHOT_MIRROR_INGRESS_NODEPORT_VALUES_FILE,
        negatedOptionFromFlag(Flags.forcePortForward),
      );
    }
    if (constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() === 'true') {
      argv.push(optionFromFlag(Flags.forceBlockNodeIntegration));
    }
    const mirrorExistingValuesFile: string =
      config.mirrorNodeConfiguration?.[Flags.getFormattedFlagKey(Flags.valuesFile)];
    const mirrorLocalConfig: AnyObject = {
      [optionFromFlag(Flags.mirrorNodeVersion)]: config.versions.mirror,
      [optionFromFlag(Flags.soloChartVersion)]: config.versions.soloChart,
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      ...config.mirrorNodeConfiguration,
      [Flags.getFormattedFlagKey(Flags.valuesFile)]: mirrorExistingValuesFile
        ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
        : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
    };
    appendConfigToArgv(argv, mirrorLocalConfig);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildExplorerArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    if (config.clusterHasOneShotPortMappings) {
      // The explorer is exposed via a stable Kind NodePort service created by the one-shot deploy
      // orchestrator, so skip the flaky kubectl port-forward tunnel.
      argv.push(negatedOptionFromFlag(Flags.forcePortForward));
    }
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.soloChartVersion)]: config.versions.soloChart,
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      [optionFromFlag(Flags.explorerVersion)]: config.versions.explorer,
      [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
      [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
      ...config.explorerNodeConfiguration,
    });
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildRelayArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...RelayCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      'node1',
    );
    if (config.clusterHasOneShotPortMappings) {
      // The relay is exposed via a stable Kind NodePort service created by the one-shot deploy
      // orchestrator, so skip the flaky kubectl port-forward tunnel.
      argv.push(negatedOptionFromFlag(Flags.forcePortForward));
    }
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.relayVersion)]: config.versions.relay,
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
      [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
      ...config.relayNodeConfiguration,
    });
    return argvPushGlobalFlags(argv);
  }

  public static buildConsensusDeployArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.soloChartVersion),
      config.versions.soloChart,
    );
    if (config.networkConfiguration) {
      appendConfigToArgv(argv, config.networkConfiguration);
    }
    if (this.isBlockNodeEnvironmentEnabled()) {
      argv.push(optionFromFlag(Flags.tssEnabled));
    }
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildConsensusSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    appendConfigToArgv(argv, config.setupConfiguration);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildConsensusStartArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.START_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    if (config.clusterHasOneShotPortMappings) {
      // Node1's gRPC endpoint is exposed via a stable Kind NodePort service created by the one-shot
      // deploy orchestrator, so skip the flaky HAProxy kubectl port-forward tunnels.
      argv.push(negatedOptionFromFlag(Flags.forcePortForward));
    }
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      ...config.consensusNodeConfiguration,
    });
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterConnectArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.context),
      config.context,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDeploymentCreateArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.namespace),
      config.namespace.name,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDeploymentAttachArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.numberOfConsensusNodes),
      config.numberOfConsensusNodes.toString(),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    if (config.deployMetricsServer) {
      argv.push(optionFromFlag(Flags.deployMetricsServer));
    }

    if (this.shouldSkipMinioSetup(config)) {
      argv.push(negatedOptionFromFlag(Flags.deployMinio));
    }

    return argvPushGlobalFlags(argv);
  }

  public static buildKeysGenerateArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.generateGossipKeys),
      'true',
      optionFromFlag(Flags.generateTlsKeys),
    );
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildImagePullArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...CacheCommandDefinition.IMAGE_PULL_COMMAND.split(' '),
      optionFromFlag(Flags.edgeEnabled),
      (!!config.edgeEnabled).toString(),

      optionFromFlag(Flags.mirrorNodeVersion),
      config.versions.mirror,

      optionFromFlag(Flags.blockNodeVersion),
      config.versions.blockNode,

      optionFromFlag(Flags.relayVersion),
      config.versions.relay,

      optionFromFlag(Flags.explorerVersion),
      config.versions.explorer,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildImageLoadArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...CacheCommandDefinition.IMAGE_LOAD_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    return argvPushGlobalFlags(argv);
  }

  public static async resolveOneShotComponentVersions(
    argv: ArgvStruct,
    useEdge: boolean,
  ): Promise<OneShotVersionsObject> {
    const configFile: SoloConfigFileVersions = this.loadVersionsFromSoloConfigFile();

    const edgeDefaults: OneShotVersionsObject = useEdge
      ? await this.resolveLatestStableEdgeVersions()
      : {
          soloChart: version.SOLO_CHART_VERSION,
          consensus: version.HEDERA_PLATFORM_VERSION,
          mirror: version.MIRROR_NODE_VERSION,
          explorer: version.EXPLORER_VERSION,
          relay: version.HEDERA_JSON_RPC_RELAY_VERSION,
          blockNode: version.BLOCK_NODE_VERSION,
        };

    return {
      soloChart: useEdge ? edgeDefaults.soloChart : version.SOLO_CHART_VERSION,
      consensus: this.resolveComponentVersion(
        argv,
        Flags.consensusNodeVersion.name,
        Flags.consensusNodeVersion.definition.defaultValue as string,
        version.HEDERA_PLATFORM_VERSION,
        edgeDefaults.consensus,
        configFile.consensusNodeVersion,
        useEdge,
      ),
      mirror: this.resolveComponentVersion(
        argv,
        Flags.mirrorNodeVersion.name,
        Flags.mirrorNodeVersion.definition.defaultValue as string,
        version.MIRROR_NODE_VERSION,
        edgeDefaults.mirror,
        configFile.mirrorNodeVersion,
        useEdge,
      ),
      explorer: this.resolveComponentVersion(
        argv,
        Flags.explorerVersion.name,
        Flags.explorerVersion.definition.defaultValue as string,
        version.EXPLORER_VERSION,
        edgeDefaults.explorer,
        configFile.explorerVersion,
        useEdge,
      ),
      relay: this.resolveComponentVersion(
        argv,
        Flags.relayVersion.name,
        Flags.relayVersion.definition.defaultValue as string,
        version.HEDERA_JSON_RPC_RELAY_VERSION,
        edgeDefaults.relay,
        configFile.relayVersion,
        useEdge,
      ),
      blockNode: this.resolveComponentVersion(
        argv,
        Flags.blockNodeVersion.name,
        Flags.blockNodeVersion.definition.defaultValue as string,
        version.BLOCK_NODE_VERSION,
        edgeDefaults.blockNode,
        configFile.blockNodeVersion,
        useEdge,
      ),
    };
  }

  private static async resolveLatestStableEdgeVersions(): Promise<OneShotVersionsObject> {
    const [consensus, mirror, explorer, relay, blockNode]: [string, string, string, string, string] = await Promise.all(
      [
        this.fetchLatestStableReleaseTag(this.CONSENSUS_RELEASES_URL, version.HEDERA_PLATFORM_EDGE_VERSION),
        this.fetchLatestStableReleaseTag(this.MIRROR_RELEASES_URL, version.MIRROR_NODE_EDGE_VERSION),
        this.fetchLatestStableReleaseTag(this.EXPLORER_RELEASES_URL, version.EXPLORER_EDGE_VERSION),
        this.fetchLatestStableReleaseTag(this.RELAY_RELEASES_URL, version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION),
        this.fetchLatestStableReleaseTag(this.BLOCK_NODE_RELEASES_URL, version.BLOCK_NODE_EDGE_VERSION),
      ],
    );

    return {
      soloChart: version.SOLO_CHART_EDGE_VERSION,
      consensus,
      mirror,
      explorer,
      relay,
      blockNode,
    };
  }

  private static async fetchLatestStableReleaseTag(releasesUrl: string, fallback: string): Promise<string> {
    try {
      const response: Response = await fetch(`${releasesUrl}?per_page=${GITHUB_RELEASES_PER_PAGE}`, {
        method: 'GET',
        headers: {
          'User-Agent': constants.SOLO_USER_AGENT_HEADER,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!response.ok) {
        return fallback;
      }

      const releases: GitHubReleaseWithMetadata[] = (await response.json()) as GitHubReleaseWithMetadata[];
      if (!Array.isArray(releases)) {
        return fallback;
      }

      let latest: SemanticVersion<string> | undefined;
      let latestTag: string | undefined;
      for (const release of releases) {
        if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') {
          continue;
        }
        let parsed: SemanticVersion<string>;
        try {
          parsed = new SemanticVersion(release.tag_name);
        } catch {
          continue;
        }
        if (parsed.preRelease) {
          continue;
        }
        if (!latest || parsed.greaterThan(latest)) {
          latest = parsed;
          latestTag = release.tag_name;
        }
      }

      return latestTag || fallback;
    } catch {
      return fallback;
    }
  }

  private static findSoloConfigFile(): string | undefined {
    const fileNames: string[] = ['solo.config.yaml', 'solo.config.json'];
    let current: string = process.cwd();

    while (true) {
      for (const name of fileNames) {
        const fullPath: string = path.join(current, name);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
      const parent: string = path.dirname(current);
      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
  }

  /**
   * Reads version overrides from the nearest {@code solo.config.yaml} or {@code solo.config.json}
   * in the current working directory chain.
   *
   * Accepted keys per component:
   * - camelCase: {@code consensusNodeVersion}, {@code mirrorNodeVersion},
   *   {@code relayVersion}, {@code explorerVersion}, {@code blockNodeVersion}
   * - kebab-case: {@code consensus-node-version}, {@code mirror-node-version},
   *   {@code relay-version}, {@code explorer-version}, {@code block-node-version}
   */
  private static loadVersionsFromSoloConfigFile(): SoloConfigFileVersions {
    const filePath: string | undefined = this.findSoloConfigFile();
    if (!filePath) {
      return {};
    }

    try {
      const content: string = fs.readFileSync(filePath, 'utf8');
      const parsed: Record<string, unknown> = filePath.endsWith('.json')
        ? (JSON.parse(content) as Record<string, unknown>)
        : (yaml.parse(content) as Record<string, unknown>);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }
      return {
        consensusNodeVersion:
          (parsed['consensusNodeVersion'] as string | undefined) ||
          (parsed['consensus-node-version'] as string | undefined),
        mirrorNodeVersion:
          (parsed['mirrorNodeVersion'] as string | undefined) || (parsed['mirror-node-version'] as string | undefined),
        relayVersion: (parsed['relayVersion'] as string | undefined) || (parsed['relay-version'] as string | undefined),
        explorerVersion:
          (parsed['explorerVersion'] as string | undefined) || (parsed['explorer-version'] as string | undefined),
        blockNodeVersion:
          (parsed['blockNodeVersion'] as string | undefined) || (parsed['block-node-version'] as string | undefined),
      };
    } catch {
      return {};
    }
  }

  private static returnFirstTruthyString(...candidates: (string | undefined)[]): string {
    for (const candidate of candidates) {
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }

  private static resolveComponentVersion(
    argv: ArgvStruct,
    flagName: string,
    flagDefaultValue: string,
    stdVersion: string,
    edgeVersion: string,
    configFileVersion: string | undefined,
    useEdge: boolean,
  ): string {
    const argvValue: string | undefined = SemanticVersion.normalizeToken(argv[flagName]);
    const normalizedConfigFileVersion: string | undefined = SemanticVersion.normalizeToken(configFileVersion);
    const isExplicit: boolean = this.isVersionFlagExplicitlySet(argvValue, flagName, flagDefaultValue);
    return this.returnFirstTruthyString(
      isExplicit ? argvValue : undefined,
      normalizedConfigFileVersion,
      useEdge ? edgeVersion : stdVersion,
    );
  }

  private static isVersionFlagExplicitlySet(
    argvValue: string | undefined,
    flagName: string,
    flagDefaultValue: string,
  ): boolean {
    if (!argvValue) {
      return false;
    }

    const flagToken: string = `--${flagName}`;
    const hasCliFlagToken: boolean = process.argv
      .slice(2)
      .some((argument: string): boolean => argument === flagToken || argument.startsWith(`${flagToken}=`));
    if (hasCliFlagToken) {
      return true;
    }

    // Fallback for tests/programmatic invocations where process.argv may not reflect parsed argv.
    return argvValue !== flagDefaultValue;
  }
}
