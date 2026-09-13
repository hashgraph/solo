// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import * as constants from '../../../src/core/constants.js';
import {type SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {ClusterSchema} from '../../../src/data/schema/model/common/cluster-schema.js';
import {DeploymentPhase} from '../../../src/data/schema/model/remote/deployment-phase.js';
import {BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentStateMetadataSchema} from '../../../src/data/schema/model/remote/state/component-state-metadata-schema.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {Templates} from '../../../src/core/templates.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../src/business/utils/path-ex.js';

interface BlockNodeK8Stub {
  services: () => BlockNodeServicesStub;
  manifests: () => BlockNodeManifestsStub;
}

interface BlockNodeServicesStub {
  read: (namespace: NamespaceName, name: string) => Promise<{spec: {clusterIP: string}}>;
}

interface BlockNodeManifestsStub {
  patchObject: sinon.SinonStub;
}

interface BlockNodeCommandInternal {
  chartManager: {
    isChartInstalled: sinon.SinonStub;
  };
  k8Factory: {
    getK8: (context: string) => BlockNodeK8Stub;
  };
  remoteConfig: {
    getClusterRefs?: () => Record<string, string>;
    getConsensusNodes?: () => Array<{name: string}>;
    configuration: {
      clusters: ClusterSchema[];
      versions?: {
        consensusNode: SemanticVersion<string> | string;
      };
      state: {
        tssEnabled: boolean;
        blockNodes: {
          metadata: {
            id: number;
            cluster: string;
          };
        }[];
        mirrorNodes?: {
          metadata: {
            id: number;
          };
        }[];
      };
    };
  };
  patchBlockNodePeerHostAliases: (clusterReference: string, patchEmptyAliases: boolean) => Promise<boolean>;
  inferDestroyData: (
    id: number,
    namespace: NamespaceName,
    context: string,
  ) => Promise<{id: number; releaseName: string; isChartInstalled: boolean; isLegacyChartInstalled: boolean}>;
  prepareValuesArgForBlockNode: (configuration: Record<string, unknown>) => Promise<HelmChartValues>;
  getLivenessCheckPortNumber: (chartVersion: string, componentImage?: string, componentImageArchive?: string) => number;
  isLocalImageAvailableInDocker: (componentImage: string) => boolean;
  updateBlockNodeVersionInRemoteConfig: (config: Record<string, unknown>) => Promise<void>;
}

describe('BlockNodeCommand unit tests', (): void => {
  let blockNodeCommand: BlockNodeCommand;
  let testCacheDirectory: string | undefined;

  beforeEach((): void => {
    resetForTest();
    blockNodeCommand = container.resolve(BlockNodeCommand);
  });

  afterEach((): void => {
    if (testCacheDirectory) {
      fs.rmSync(testCacheDirectory, {recursive: true, force: true});
      testCacheDirectory = undefined;
    }
  });

  it('should configure peer block node sources under the chart backfill values path', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        versions: {
          consensusNode: '0.75.1',
        },
        state: {
          tssEnabled: false,
          blockNodes: [
            {
              metadata: {
                id: 1,
                cluster: 'cluster-a',
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: false,
      valuesFile: undefined,
      releaseName: 'block-node-2',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.include('blockNode.backfill.sources[0].address=block-node-1.solo-ns.svc.cluster.local');
    expect(valueArguments).to.include(`blockNode.backfill.sources[0].port=${constants.BLOCK_NODE_PORT}`);
    expect(valueArguments).to.include('blockNode.backfill.sources[0].priority=1');
    expect(valueArguments).to.not.include('blockNode.sources[0].address=block-node-1.solo-ns.svc.cluster.local');
  });

  it('should use the compatible readiness port for block node chart versions', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(blockNodeCommandInternal.getLivenessCheckPortNumber('0.38.0')).to.equal(constants.BLOCK_NODE_PORT);
    expect(blockNodeCommandInternal.getLivenessCheckPortNumber('0.39.0')).to.equal(constants.BLOCK_NODE_HEALTH_PORT);
  });

  it('should use a semver tag on a Kind-attached local registry image to pick the readiness port', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(
      blockNodeCommandInternal.getLivenessCheckPortNumber('0.38.0', 'localhost:5001/block-node-server:0.40.0'),
    ).to.equal(constants.BLOCK_NODE_HEALTH_PORT);
  });

  it('should ignore a tagless local registry ref (implicit latest) when picking the readiness port', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(blockNodeCommandInternal.getLivenessCheckPortNumber('0.38.0', 'localhost:5001/block-node-server')).to.equal(
      constants.BLOCK_NODE_PORT,
    );
  });

  it('should ignore a plain remote-registry componentImage tag when picking the readiness port', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(
      blockNodeCommandInternal.getLivenessCheckPortNumber('0.38.0', 'ghcr.io/hiero-ledger/block-node-server:0.40.0'),
    ).to.equal(constants.BLOCK_NODE_PORT);
  });

  it('should use a semver tag on an archive-sourced remote-registry componentImage to pick the readiness port', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(
      blockNodeCommandInternal.getLivenessCheckPortNumber(
        '0.38.0',
        'ghcr.io/hiero-ledger/block-node-server:0.40.0',
        '/tmp/block-node-server.tar',
      ),
    ).to.equal(constants.BLOCK_NODE_HEALTH_PORT);
  });

  it('should not throw for a tagless archive-sourced remote-registry componentImage when picking the readiness port', (): void => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    expect(
      blockNodeCommandInternal.getLivenessCheckPortNumber(
        '0.38.0',
        'ghcr.io/hiero-ledger/block-node-server',
        '/tmp/block-node-server.tar',
      ),
    ).to.equal(constants.BLOCK_NODE_PORT);
  });

  it('should record an archive-sourced remote-registry componentImage version in remote config', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const updateComponentVersionStub: sinon.SinonStub = sinon.stub();
    blockNodeCommandInternal.remoteConfig = {
      updateComponentVersion: updateComponentVersionStub,
      persist: sinon.stub().resolves(),
    } as unknown as BlockNodeCommandInternal['remoteConfig'];

    await blockNodeCommandInternal.updateBlockNodeVersionInRemoteConfig({
      chartVersion: '0.38.0',
      componentImage: 'ghcr.io/hiero-ledger/block-node-server:0.40.0',
      componentImageArchive: '/tmp/block-node-server.tar',
    });

    expect(updateComponentVersionStub).to.have.been.calledOnce;
    const [, version]: [unknown, SemanticVersion<string>] = updateComponentVersionStub.firstCall.args as [
      unknown,
      SemanticVersion<string>,
    ];
    expect(version.toString()).to.equal('0.40.0');
  });

  it('should not throw for a tagless archive-sourced remote-registry componentImage when recording the remote config version', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const updateComponentVersionStub: sinon.SinonStub = sinon.stub();
    blockNodeCommandInternal.remoteConfig = {
      updateComponentVersion: updateComponentVersionStub,
      persist: sinon.stub().resolves(),
    } as unknown as BlockNodeCommandInternal['remoteConfig'];

    await blockNodeCommandInternal.updateBlockNodeVersionInRemoteConfig({
      chartVersion: '0.38.0',
      componentImage: 'ghcr.io/hiero-ledger/block-node-server',
      componentImageArchive: '/tmp/block-node-server.tar',
    });

    expect(updateComponentVersionStub).to.have.been.calledOnce;
    const [, version]: [unknown, SemanticVersion<string>] = updateComponentVersionStub.firstCall.args as [
      unknown,
      SemanticVersion<string>,
    ];
    expect(version.toString()).to.equal('0.38.0');
  });

  it('should ignore a plain remote-registry componentImage without an archive when recording the remote config version', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const updateComponentVersionStub: sinon.SinonStub = sinon.stub();
    blockNodeCommandInternal.remoteConfig = {
      updateComponentVersion: updateComponentVersionStub,
      persist: sinon.stub().resolves(),
    } as unknown as BlockNodeCommandInternal['remoteConfig'];

    await blockNodeCommandInternal.updateBlockNodeVersionInRemoteConfig({
      chartVersion: '0.38.0',
      componentImage: 'ghcr.io/hiero-ledger/block-node-server:0.40.0',
    });

    expect(updateComponentVersionStub).to.have.been.calledOnce;
    const [, version]: [unknown, SemanticVersion<string>] = updateComponentVersionStub.firstCall.args as [
      unknown,
      SemanticVersion<string>,
    ];
    expect(version.toString()).to.equal('0.38.0');
  });

  it('should configure the RSA mirror bootstrap source for block-stream consensus versions', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.75.1',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
          mirrorNodes: [
            {
              metadata: {
                id: 2,
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.include('--set-literal');
    expect(valueArguments).to.include(
      'blockNode.config.ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL=http://mirror-2-restjava:80',
    );
  });

  it('should inject the RSA bootstrap file when cache keys are available', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    testCacheDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-block-node-test-'));
    const keysDirectory: string = PathEx.join(testCacheDirectory, 'keys');
    fs.mkdirSync(keysDirectory, {recursive: true});
    fs.copyFileSync(
      PathEx.joinWithRealPath('test', 'data', 'pem', 'keys', 's-public-node1.pem'),
      PathEx.join(keysDirectory, 's-public-node1.pem'),
    );

    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [
        {
          name: 'node1',
        },
      ],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.75.1',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      cacheDir: testCacheDirectory,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    const valuesFile: string | undefined = valueArguments.find((argument: string): boolean =>
      argument.endsWith('block-node-1-rsa-bootstrap-values.yaml'),
    );

    expect(valuesFile).to.not.equal(undefined);
    if (!valuesFile) {
      throw new Error('RSA bootstrap values file was not generated');
    }
    const rsaBootstrapValues: string = fs.readFileSync(valuesFile, 'utf8');
    expect(rsaBootstrapValues).to.contain('rsa-bootstrap-roster.json');
    expect(rsaBootstrapValues).to.contain('[ ! -s /application-state-pvc/rsa-bootstrap-roster.json ]');
    expect(rsaBootstrapValues).to.contain('RSAPubKey');
    expect(rsaBootstrapValues).to.contain('application-state-storage');
  });

  it('should not configure the RSA mirror bootstrap source before TSS-era consensus versions', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.73.0',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
          mirrorNodes: [
            {
              metadata: {
                id: 2,
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.not.include(
      'blockNode.config.ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL=http://mirror-2-restjava:80',
    );
  });

  it('should configure a Kind-attached local registry image with a Never pull policy', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        state: {
          tssEnabled: false,
          blockNodes: [],
        },
      },
    };
    sinon.stub(blockNodeCommandInternal, 'isLocalImageAvailableInDocker').returns(true);

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: false,
      componentImage: 'localhost:5001/block-node-server:0.38.0',
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    expect(valueArguments).to.include('image.registry=localhost:5001');
    expect(valueArguments).to.include('image.repository=block-node-server');
    expect(valueArguments).to.include('image.tag=0.38.0');
    expect(valueArguments).to.include('image.pullPolicy=Never');
  });

  it('should configure an archived image with a Never pull policy', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    testCacheDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-block-node-image-archive-test-'));
    const componentImageArchive: string = PathEx.join(testCacheDirectory, 'block-node-server.tar');
    fs.writeFileSync(componentImageArchive, 'image archive');
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        state: {
          tssEnabled: false,
          blockNodes: [],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: false,
      componentImage: 'ghcr.io/hiero-ledger/block-node-server:0.38.0',
      componentImageArchive,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    expect(valueArguments).to.include('image.registry=ghcr.io');
    expect(valueArguments).to.include('image.repository=hiero-ledger/block-node-server');
    expect(valueArguments).to.include('image.tag=0.38.0');
    expect(valueArguments).to.include('image.pullPolicy=Never');
  });

  it('should preserve tagless local registry refs with implicit latest tags', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        state: {
          tssEnabled: false,
          blockNodes: [],
        },
      },
    };
    sinon.stub(blockNodeCommandInternal, 'isLocalImageAvailableInDocker').returns(true);

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: false,
      componentImage: 'localhost:5001/block-node-server',
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    expect(valueArguments).to.include('image.registry=localhost:5001');
    expect(valueArguments).to.include('image.repository=block-node-server');
    expect(valueArguments).to.include('image.tag=latest');
    expect(valueArguments).to.include('image.pullPolicy=Never');
  });

  it('should use the block node release name as the Helm instance label selector', (): void => {
    const labels: string[] = Templates.renderBlockNodeLabels(1);

    expect(labels).to.deep.equal(['app.kubernetes.io/instance=block-node-1']);
  });

  it('should patch block node StatefulSets with peer host aliases', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const patchObjectStub: sinon.SinonStub = sinon.stub().resolves();

    blockNodeCommandInternal.k8Factory = {
      getK8: (context: string): BlockNodeK8Stub => {
        expect(context).to.equal('kind-cluster-a');
        return {
          services: (): BlockNodeServicesStub => {
            return {
              read: async (namespace: NamespaceName, name: string): Promise<{spec: {clusterIP: string}}> => {
                expect(namespace.name).to.equal('solo-ns');
                return {spec: {clusterIP: name === 'block-node-1' ? '10.96.0.1' : '10.96.0.2'}};
              },
            };
          },
          manifests: (): BlockNodeManifestsStub => {
            return {
              patchObject: patchObjectStub,
            };
          },
        };
      },
    };
    blockNodeCommandInternal.remoteConfig = {
      getClusterRefs: (): Record<string, string> => {
        return {'cluster-a': 'kind-cluster-a'};
      },
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(2, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const patched: boolean = await blockNodeCommandInternal.patchBlockNodePeerHostAliases('cluster-a', true);

    expect(patched).to.equal(true);
    expect(patchObjectStub).to.have.callCount(2);
    expect(patchObjectStub.firstCall.firstArg).to.deep.equal({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        namespace: 'solo-ns',
        name: 'block-node-1',
      },
      spec: {
        template: {
          spec: {
            hostAliases: [
              {
                ip: '10.96.0.2',
                hostnames: ['block-node-2.solo-ns.svc.cluster.local', 'block-node-2'],
              },
            ],
          },
        },
      },
    });
  });

  it('should skip host alias patching when upgrading a single block node without peers', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const patchObjectStub: sinon.SinonStub = sinon.stub().resolves();

    blockNodeCommandInternal.k8Factory = {
      getK8: (): BlockNodeK8Stub => {
        return {
          services: (): BlockNodeServicesStub => {
            return {
              read: async (): Promise<{spec: {clusterIP: string}}> => {
                return {spec: {clusterIP: '10.96.0.1'}};
              },
            };
          },
          manifests: (): BlockNodeManifestsStub => {
            return {
              patchObject: patchObjectStub,
            };
          },
        };
      },
    };
    blockNodeCommandInternal.remoteConfig = {
      getClusterRefs: (): Record<string, string> => {
        return {'cluster-a': 'kind-cluster-a'};
      },
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const patched: boolean = await blockNodeCommandInternal.patchBlockNodePeerHostAliases('cluster-a', false);

    expect(patched).to.equal(false);
    expect(patchObjectStub).to.have.callCount(0);
  });

  it('should ignore missing block node StatefulSets when patching peer host aliases', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const patchObjectStub: sinon.SinonStub = sinon.stub();
    patchObjectStub.onFirstCall().resolves();
    patchObjectStub
      .onSecondCall()
      .rejects(
        new Error(
          'HTTP-Code: 404 Message: Unsuccessful HTTP Request Body: ' +
            String.raw`"{\"message\":\"statefulsets.apps \\\"block-node-2\\\" not found\"}"`,
        ),
      );

    blockNodeCommandInternal.k8Factory = {
      getK8: (): BlockNodeK8Stub => {
        return {
          services: (): BlockNodeServicesStub => {
            return {
              read: async (_namespace: NamespaceName, name: string): Promise<{spec: {clusterIP: string}}> => {
                return {spec: {clusterIP: name === 'block-node-1' ? '10.96.0.1' : '10.96.0.2'}};
              },
            };
          },
          manifests: (): BlockNodeManifestsStub => {
            return {
              patchObject: patchObjectStub,
            };
          },
        };
      },
    };
    blockNodeCommandInternal.remoteConfig = {
      getClusterRefs: (): Record<string, string> => {
        return {'cluster-a': 'kind-cluster-a'};
      },
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(2, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const patched: boolean = await blockNodeCommandInternal.patchBlockNodePeerHostAliases('cluster-a', true);

    expect(patched).to.equal(true);
    expect(patchObjectStub).to.have.callCount(2);
  });

  it('should prefer the current block node release when destroying id 1', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    blockNodeCommandInternal.chartManager = {
      isChartInstalled: sinon
        .stub()
        .callsFake(async (_namespace: NamespaceName, releaseName: string): Promise<boolean> => {
          return releaseName === 'block-node-1' || releaseName === 'block-node-0';
        }),
    };
    blockNodeCommandInternal.remoteConfig = {
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const inferredData: {
      id: number;
      releaseName: string;
      isChartInstalled: boolean;
      isLegacyChartInstalled: boolean;
    } = await blockNodeCommandInternal.inferDestroyData(1, NamespaceName.of('solo-ns'), 'kind-cluster-a');

    expect(inferredData).to.deep.equal({
      id: 1,
      releaseName: 'block-node-1',
      isChartInstalled: true,
      isLegacyChartInstalled: false,
    });
    expect(blockNodeCommandInternal.chartManager.isChartInstalled.firstCall.args[1]).to.equal('block-node-1');
  });
});
