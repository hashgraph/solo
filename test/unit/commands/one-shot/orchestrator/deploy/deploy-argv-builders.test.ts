// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import {ConsensusCommandDefinition} from '../../../../../../src/commands/command-definitions/consensus-command-definition.js';
import {MirrorCommandDefinition} from '../../../../../../src/commands/command-definitions/mirror-command-definition.js';
import * as constants from '../../../../../../src/core/constants.js';
import * as version from '../../../../../../version.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type OneShotVersionsObject} from '../../../../../../src/commands/one-shot/one-shot-versions-object.js';
import {ClusterReferenceCommandDefinition} from '../../../../../../src/commands/command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../../../src/commands/command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../../../../src/commands/command-definitions/keys-command-definition.js';
import {DeployArgvBuilders} from '../../../../../../src/commands/one-shot/orchestrator/deploy/deploy-argv-builders.js';
import {negatedOptionFromFlag, optionFromFlag} from '../../../../../../src/commands/command-helpers.js';
import {Flags} from '../../../../../../src/commands/flags.js';
import {type AnyObject, type ArgvStruct} from '../../../../../../src/types/aliases.js';

afterEach((): void => {
  delete process.env.ONE_SHOT_WITH_BLOCK_NODE;
  delete process.env.BLOCK_STREAM_STREAM_MODE;
  delete process.env.ONE_SHOT_BLOCK_NODE_PERF;
});

function makeConfig(overrides: Partial<OneShotSingleDeployConfigClass> = {}): OneShotSingleDeployConfigClass {
  return {
    deployment: 'test-deployment',
    namespace: NamespaceName.of('test-ns'),
    clusterRef: 'test-cluster',
    parallelDeploy: false,
    deployMirrorNode: true,
    deployExplorer: true,
    deployRelay: true,
    minimalSetup: false,
    predefinedAccounts: false,
    pinger: true,
    versions: {explorer: '2.5.0', soloChart: '', consensus: '', mirror: '', relay: '', blockNode: ''},
    blockNodeConfiguration: {},
    mirrorNodeConfiguration: {},
    explorerNodeConfiguration: {},
    relayNodeConfiguration: {},
    networkConfiguration: {},
    setupConfiguration: {},
    consensusNodeConfiguration: {},
    cacheDir: '/tmp/cache',
    clusterHasOneShotPortMappings: true,
    ...overrides,
  } as OneShotSingleDeployConfigClass;
}

describe('buildBlockNodeArgv', (): void => {
  it('includes the deployment flag and value', (): void => {
    const argv: string[] = DeployArgvBuilders.buildBlockNodeArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
  });

  it('sets values file to BLOCK_NODE_SOLO_DEV_FILE when no existing values file is provided', (): void => {
    const argv: string[] = DeployArgvBuilders.buildBlockNodeArgv(makeConfig({blockNodeConfiguration: {}}));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.BLOCK_NODE_SOLO_DEV_FILE);
  });

  it('appends BLOCK_NODE_SOLO_DEV_FILE to an existing values file', (): void => {
    const existingFile: string = '/path/to/custom.yaml';
    const valuesFileFlagName: string = optionFromFlag(Flags.valuesFile);
    const blockNodeConfiguration: Record<string, string> = {[valuesFileFlagName]: existingFile};
    const argv: string[] = DeployArgvBuilders.buildBlockNodeArgv(makeConfig({blockNodeConfiguration}));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`);
  });

  it('injects RSA bootstrap values for one-shot block node WRB/RSA deploys outside perf mode', (): void => {
    process.env.ONE_SHOT_WITH_BLOCK_NODE = 'true';
    process.env.BLOCK_STREAM_STREAM_MODE = 'BOTH';
    process.env.ONE_SHOT_BLOCK_NODE_PERF = 'false';

    const argv: string[] = DeployArgvBuilders.buildBlockNodeArgv(
      makeConfig({
        cacheDir: 'test/data/pem',
        numberOfConsensusNodes: 1,
        versions: {
          explorer: '2.5.0',
          soloChart: '0.0.0',
          consensus: 'v0.75.0',
          mirror: '0.0.0',
          relay: '0.0.0',
          blockNode: '0.37.1',
        },
      }),
    );

    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    const valuesFiles: string[] = argv[valueIndex + 1].split(',');
    expect(valuesFiles).to.have.length(2);
    expect(valuesFiles[1]).to.equal(constants.BLOCK_NODE_SOLO_DEV_FILE);

    const rsaBootstrapValues: string = fs.readFileSync(valuesFiles[0], 'utf8');
    expect(rsaBootstrapValues).to.contain('rsa-bootstrap-roster.json');
    expect(rsaBootstrapValues).to.contain('ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL');
  });

  it('does not mutate blockNodeConfiguration', (): void => {
    const originalFile: string = '/original.yaml';
    const valuesFileFlagName: string = optionFromFlag(Flags.valuesFile);
    const blockNodeConfiguration: Record<string, string> = {[valuesFileFlagName]: originalFile};
    DeployArgvBuilders.buildBlockNodeArgv(makeConfig({blockNodeConfiguration}));
    expect(blockNodeConfiguration[valuesFileFlagName]).to.equal(originalFile);
  });

  it('forwards the consensus node version and drops the non-flag key spellings', (): void => {
    const blockNodeConfiguration: AnyObject = {
      consensusNodeVersion: 'v0.73.0',
      'consensus-node-version': 'v0.73.0',
    };
    const argv: string[] = DeployArgvBuilders.buildBlockNodeArgv(makeConfig({blockNodeConfiguration}));

    const consensusNodeVersionIndex: number = argv.indexOf(optionFromFlag(Flags.consensusNodeVersion));
    expect(consensusNodeVersionIndex).to.be.greaterThan(-1);
    expect(argv[consensusNodeVersionIndex + 1]).to.equal('v0.73.0');
    expect(argv).to.not.include('consensusNodeVersion');
    expect(argv).to.not.include('consensus-node-version');
  });
});

describe('buildMirrorNodeArgv', (): void => {
  it('includes deployment flag, cluster-ref, pinger, enable-ingress', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
    expect(argv).to.include(optionFromFlag(Flags.pinger));
    expect(argv).to.include(optionFromFlag(Flags.enableIngress));
  });

  it('can omit pinger from initial mirror deployment', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig(), false);
    expect(argv).to.not.include(optionFromFlag(Flags.pinger));
  });

  it('omits pinger when pinger is disabled in config', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({pinger: false}));
    expect(argv).to.not.include(optionFromFlag(Flags.pinger));
  });

  it('includes the parallel-deploy flag', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({parallelDeploy: true}));
    expect(argv).to.include(optionFromFlag(Flags.parallelDeploy));
    expect(argv).to.include('true');
  });

  it('exposes the mirror ingress via NodePort and disables port-forward', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.enableIngress));
    expect(argv).to.include(negatedOptionFromFlag(Flags.forcePortForward));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.ingressControllerValueFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.ONE_SHOT_MIRROR_INGRESS_NODEPORT_VALUES_FILE);
  });

  it('keeps the legacy port-forward when the cluster lacks the one-shot port mappings', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({clusterHasOneShotPortMappings: false}));
    expect(argv).to.not.include(negatedOptionFromFlag(Flags.forcePortForward));
    expect(argv).to.not.include(optionFromFlag(Flags.ingressControllerValueFile));
  });

  it('sets values file to MIRROR_NODE_HIKARI_LIMITS_FILE when no existing values file', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration: {}}));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.MIRROR_NODE_HIKARI_LIMITS_FILE);
  });

  it('appends MIRROR_NODE_HIKARI_LIMITS_FILE to an existing values file', (): void => {
    const existingFile: string = '/path/to/custom.yaml';
    const valuesFileFlagName: string = optionFromFlag(Flags.valuesFile);
    const mirrorNodeConfiguration: Record<string, string> = {[valuesFileFlagName]: existingFile};
    const argv: string[] = DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration}));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`);
  });

  it('does not mutate mirrorNodeConfiguration', (): void => {
    const originalFile: string = '/original.yaml';
    const valuesFileFlagName: string = optionFromFlag(Flags.valuesFile);
    const mirrorNodeConfiguration: Record<string, string> = {[valuesFileFlagName]: originalFile};
    DeployArgvBuilders.buildMirrorNodeArgv(makeConfig({mirrorNodeConfiguration}));
    expect(mirrorNodeConfiguration[valuesFileFlagName]).to.equal(originalFile);
  });
});

describe('buildMirrorNodePingerUpgradeArgv', (): void => {
  it('builds a mirror node upgrade command with pinger enabled', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodePingerUpgradeArgv(makeConfig());
    for (const commandToken of MirrorCommandDefinition.UPGRADE_COMMAND.split(' ')) {
      expect(argv).to.include(commandToken);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
    expect(argv).to.include(optionFromFlag(Flags.pinger));
    expect(argv).to.include(optionFromFlag(Flags.enableIngress));
  });

  it('preserves mirror values file handling for the delayed pinger upgrade', (): void => {
    const existingFile: string = '/path/to/custom.yaml';
    const valuesFileFlagName: string = optionFromFlag(Flags.valuesFile);
    const mirrorNodeConfiguration: Record<string, string> = {[valuesFileFlagName]: existingFile};
    const argv: string[] = DeployArgvBuilders.buildMirrorNodePingerUpgradeArgv(makeConfig({mirrorNodeConfiguration}));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.valuesFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`);
  });

  it('keeps the mirror ingress on its NodePort and disables port-forward on upgrade', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodePingerUpgradeArgv(makeConfig());
    expect(argv).to.include(negatedOptionFromFlag(Flags.forcePortForward));
    const valueIndex: number = argv.indexOf(optionFromFlag(Flags.ingressControllerValueFile));
    expect(valueIndex).to.be.greaterThan(-1);
    expect(argv[valueIndex + 1]).to.equal(constants.ONE_SHOT_MIRROR_INGRESS_NODEPORT_VALUES_FILE);
  });

  it('keeps the legacy port-forward on upgrade when the cluster lacks the one-shot port mappings', (): void => {
    const argv: string[] = DeployArgvBuilders.buildMirrorNodePingerUpgradeArgv(
      makeConfig({clusterHasOneShotPortMappings: false}),
    );
    expect(argv).to.not.include(negatedOptionFromFlag(Flags.forcePortForward));
    expect(argv).to.not.include(optionFromFlag(Flags.ingressControllerValueFile));
  });
});

describe('buildExplorerArgv', (): void => {
  it('includes deployment and cluster-ref flags', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
  });

  it('includes --mirror-node-id set to 1', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.mirrorNodeId));
    const idIndex: number = argv.indexOf(optionFromFlag(Flags.mirrorNodeId));
    expect(argv[idIndex + 1]).to.equal('1');
  });

  it('includes --mirror-namespace set to namespace name', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.mirrorNamespace));
    const namespaceIndex: number = argv.indexOf(optionFromFlag(Flags.mirrorNamespace));
    expect(argv[namespaceIndex + 1]).to.equal('test-ns');
  });

  it('includes --explorer-version set to config versions.explorer', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.explorerVersion));
    const versionIndex: number = argv.indexOf(optionFromFlag(Flags.explorerVersion));
    expect(argv[versionIndex + 1]).to.equal('2.5.0');
  });

  it('disables port-forward in favor of the one-shot NodePort service', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig());
    expect(argv).to.include(negatedOptionFromFlag(Flags.forcePortForward));
  });

  it('keeps the legacy port-forward when the cluster lacks the one-shot port mappings', (): void => {
    const argv: string[] = DeployArgvBuilders.buildExplorerArgv(makeConfig({clusterHasOneShotPortMappings: false}));
    expect(argv).to.not.include(negatedOptionFromFlag(Flags.forcePortForward));
  });
});

describe('buildRelayArgv', (): void => {
  it('includes deployment, cluster-ref, and hardcoded node1 alias', (): void => {
    const argv: string[] = DeployArgvBuilders.buildRelayArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
    expect(argv).to.include(optionFromFlag(Flags.nodeAliasesUnparsed));
    expect(argv).to.include('node1');
  });

  it('includes --mirror-node-id set to 1', (): void => {
    const argv: string[] = DeployArgvBuilders.buildRelayArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.mirrorNodeId));
    const idIndex: number = argv.indexOf(optionFromFlag(Flags.mirrorNodeId));
    expect(argv[idIndex + 1]).to.equal('1');
  });

  it('includes --mirror-namespace set to namespace name', (): void => {
    const argv: string[] = DeployArgvBuilders.buildRelayArgv(makeConfig());
    expect(argv).to.include(optionFromFlag(Flags.mirrorNamespace));
    const namespaceIndex: number = argv.indexOf(optionFromFlag(Flags.mirrorNamespace));
    expect(argv[namespaceIndex + 1]).to.equal('test-ns');
  });

  it('disables port-forward in favor of the one-shot NodePort service', (): void => {
    const argv: string[] = DeployArgvBuilders.buildRelayArgv(makeConfig());
    expect(argv).to.include(negatedOptionFromFlag(Flags.forcePortForward));
  });

  it('keeps the legacy port-forward when the cluster lacks the one-shot port mappings', (): void => {
    const argv: string[] = DeployArgvBuilders.buildRelayArgv(makeConfig({clusterHasOneShotPortMappings: false}));
    expect(argv).to.not.include(negatedOptionFromFlag(Flags.forcePortForward));
  });
});

describe('buildConsensusDeployArgv', (): void => {
  it('includes consensus deploy command tokens and --deployment flag', (): void => {
    const argv: string[] = DeployArgvBuilders.buildConsensusDeployArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.DEPLOY_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
  });
});

describe('buildConsensusSetupArgv', (): void => {
  it('includes consensus setup command tokens and --deployment flag', (): void => {
    const argv: string[] = DeployArgvBuilders.buildConsensusSetupArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.SETUP_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
  });
});

describe('buildConsensusStartArgv', (): void => {
  it('includes consensus start command tokens and --deployment flag', (): void => {
    const argv: string[] = DeployArgvBuilders.buildConsensusStartArgv(makeConfig());
    for (const token of ConsensusCommandDefinition.START_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
  });

  it('disables port-forward in favor of the one-shot NodePort service', (): void => {
    const argv: string[] = DeployArgvBuilders.buildConsensusStartArgv(makeConfig());
    expect(argv).to.include(negatedOptionFromFlag(Flags.forcePortForward));
  });

  it('keeps the legacy port-forward when the cluster lacks the one-shot port mappings', (): void => {
    const argv: string[] = DeployArgvBuilders.buildConsensusStartArgv(
      makeConfig({clusterHasOneShotPortMappings: false}),
    );
    expect(argv).to.not.include(negatedOptionFromFlag(Flags.forcePortForward));
  });
});

describe('buildClusterConnectArgv', (): void => {
  it('includes cluster connect command tokens and --cluster-ref and --context flags', (): void => {
    const config: OneShotSingleDeployConfigClass = makeConfig({
      context: 'kind-test-context',
    });
    const argv: string[] = DeployArgvBuilders.buildClusterConnectArgv(config);
    for (const token of ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
    expect(argv).to.include(optionFromFlag(Flags.context));
    expect(argv).to.include('kind-test-context');
  });
});

describe('buildDeploymentCreateArgv', (): void => {
  it('includes deployment create command tokens, --deployment, and --namespace flags', (): void => {
    const argv: string[] = DeployArgvBuilders.buildDeploymentCreateArgv(makeConfig());
    for (const token of DeploymentCommandDefinition.CREATE_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.namespace));
    expect(argv).to.include('test-ns');
  });
});

describe('buildDeploymentAttachArgv', (): void => {
  it('includes deployment attach command tokens, --deployment, --cluster-ref, and --num-consensus-nodes flags', (): void => {
    const config: OneShotSingleDeployConfigClass = makeConfig({numberOfConsensusNodes: 3});
    const argv: string[] = DeployArgvBuilders.buildDeploymentAttachArgv(config);
    for (const token of DeploymentCommandDefinition.ATTACH_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
    expect(argv).to.include(optionFromFlag(Flags.numberOfConsensusNodes));
    expect(argv).to.include('3');
  });
});

describe('buildClusterSetupArgv', (): void => {
  it('includes cluster setup command tokens and --cluster-ref flag', (): void => {
    const argv: string[] = DeployArgvBuilders.buildClusterSetupArgv(makeConfig());
    for (const token of ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.clusterRef));
    expect(argv).to.include('test-cluster');
  });

  it('adds --no-minio when ONE_SHOT_WITH_BLOCK_NODE is enabled', (): void => {
    process.env.ONE_SHOT_WITH_BLOCK_NODE = 'true';
    const argv: string[] = DeployArgvBuilders.buildClusterSetupArgv(
      makeConfig({
        versions: {
          explorer: '2.5.0',
          soloChart: '0.0.0',
          consensus: 'v0.74.0',
          mirror: '0.0.0',
          relay: '0.0.0',
          blockNode: '0.0.0',
        },
      }),
    );

    expect(argv).to.include(negatedOptionFromFlag(Flags.deployMinio));
  });

  it('does not add --no-minio when block node one-shot uses BOTH stream mode', (): void => {
    process.env.ONE_SHOT_WITH_BLOCK_NODE = 'true';
    process.env.BLOCK_STREAM_STREAM_MODE = 'BOTH';
    const argv: string[] = DeployArgvBuilders.buildClusterSetupArgv(
      makeConfig({
        versions: {
          explorer: '2.5.0',
          soloChart: '0.0.0',
          consensus: 'v0.74.0',
          mirror: '0.0.0',
          relay: '0.0.0',
          blockNode: '0.0.0',
        },
      }),
    );

    expect(argv).to.not.include(negatedOptionFromFlag(Flags.deployMinio));
  });

  it('does not add --no-minio when ONE_SHOT_WITH_BLOCK_NODE is disabled', (): void => {
    process.env.ONE_SHOT_WITH_BLOCK_NODE = 'false';
    const argv: string[] = DeployArgvBuilders.buildClusterSetupArgv(
      makeConfig({
        versions: {
          explorer: '2.5.0',
          soloChart: '0.0.0',
          consensus: 'v0.73.9',
          mirror: '0.0.0',
          relay: '0.0.0',
          blockNode: '0.0.0',
        },
      }),
    );

    expect(argv).to.not.include(negatedOptionFromFlag(Flags.deployMinio));
  });
});

describe('buildKeysGenerateArgv', (): void => {
  it('includes keys command tokens, --deployment, --gossip-keys, and --tls-keys flags', (): void => {
    const argv: string[] = DeployArgvBuilders.buildKeysGenerateArgv(makeConfig());
    for (const token of KeysCommandDefinition.KEYS_COMMAND.split(' ')) {
      expect(argv).to.include(token);
    }
    expect(argv).to.include(optionFromFlag(Flags.deployment));
    expect(argv).to.include('test-deployment');
    expect(argv).to.include(optionFromFlag(Flags.generateGossipKeys));
    expect(argv).to.include(optionFromFlag(Flags.generateTlsKeys));
  });
});

describe('resolveOneShotComponentVersions', (): void => {
  afterEach((): void => {
    sinon.restore();
    delete process.env.ONE_SHOT_WITH_BLOCK_NODE;
  });

  it('returns non-edge defaults when edge is disabled', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: [],
      [Flags.consensusNodeVersion.name]: '',
      [Flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
      [Flags.relayVersion.name]: '',
      [Flags.explorerVersion.name]: version.EXPLORER_VERSION,
      [Flags.blockNodeVersion.name]: '',
    };
    const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(argv, false);
    expect(versions.consensus).to.equal(version.HEDERA_PLATFORM_VERSION);
    expect(versions.mirror).to.equal(version.MIRROR_NODE_VERSION);
    expect(versions.relay).to.equal(version.HEDERA_JSON_RPC_RELAY_VERSION);
    expect(versions.explorer).to.equal(version.EXPLORER_VERSION);
    expect(versions.blockNode).to.equal(version.BLOCK_NODE_VERSION);
  });

  it('uses latest non-prerelease tags from GitHub responses when edge is enabled', async (): Promise<void> => {
    const fetchStub: sinon.SinonStub = sinon.stub(globalThis, 'fetch');
    // consensus
    fetchStub.onCall(0).resolves(
      Response.json([
        {tag_name: 'v0.80.0-rc1', prerelease: true, draft: false},
        {tag_name: 'v0.79.0', prerelease: false, draft: false},
        {tag_name: 'v0.78.9', prerelease: false, draft: false},
      ]),
    );
    // mirror
    fetchStub.onCall(1).resolves(Response.json([{tag_name: 'v0.200.1', prerelease: false, draft: false}]));
    // explorer
    fetchStub.onCall(2).resolves(Response.json([{tag_name: 'v31.0.0', prerelease: false, draft: false}]));
    // relay
    fetchStub.onCall(3).resolves(Response.json([{tag_name: 'v0.90.0', prerelease: false, draft: false}]));
    // block node
    fetchStub.onCall(4).resolves(
      Response.json([
        {tag_name: 'v0.40.0-rc2', prerelease: true, draft: false},
        {tag_name: 'v0.39.0', prerelease: false, draft: false},
      ]),
    );

    const argv: ArgvStruct = {
      _: [],
      [Flags.consensusNodeVersion.name]: '',
      [Flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
      [Flags.relayVersion.name]: '',
      [Flags.explorerVersion.name]: version.EXPLORER_VERSION,
      [Flags.blockNodeVersion.name]: '',
    };
    const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(argv, true);
    expect(versions.consensus).to.equal('v0.79.0');
    expect(versions.mirror).to.equal('v0.200.1');
    expect(versions.explorer).to.equal('v31.0.0');
    expect(versions.relay).to.equal('v0.90.0');
    expect(versions.blockNode).to.equal('v0.39.0');
    expect(versions.soloChart).to.equal(version.SOLO_CHART_EDGE_VERSION);
  });

  it('normalizes duplicate argv values emitted as arrays for version flags', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: [],
      [Flags.consensusNodeVersion.name]: ['v0.73.0', 'v0.73.0'] as unknown as string,
      [Flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
      [Flags.relayVersion.name]: '',
      [Flags.explorerVersion.name]: version.EXPLORER_VERSION,
      [Flags.blockNodeVersion.name]: '',
    };

    const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(argv, false);
    expect(versions.consensus).to.equal('v0.73.0');
  });

  it('normalizes duplicate comma-joined argv values for version flags', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: [],
      [Flags.consensusNodeVersion.name]: 'v0.73.0,v0.73.0',
      [Flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
      [Flags.relayVersion.name]: '',
      [Flags.explorerVersion.name]: version.EXPLORER_VERSION,
      [Flags.blockNodeVersion.name]: '',
    };

    const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(argv, false);
    expect(versions.consensus).to.equal('v0.73.0');
  });

  it('normalizes prerelease argv values emitted as arrays and preserves selected token format', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: [],
      [Flags.consensusNodeVersion.name]: ['0.45.3-alpha.1', 'v0.74.0-rc.5'] as unknown as string,
      [Flags.mirrorNodeVersion.name]: version.MIRROR_NODE_VERSION,
      [Flags.relayVersion.name]: '',
      [Flags.explorerVersion.name]: version.EXPLORER_VERSION,
      [Flags.blockNodeVersion.name]: '',
    };

    const versions: OneShotVersionsObject = await DeployArgvBuilders.resolveOneShotComponentVersions(argv, false);
    expect(versions.consensus).to.equal('v0.74.0-rc.5');
  });
});
