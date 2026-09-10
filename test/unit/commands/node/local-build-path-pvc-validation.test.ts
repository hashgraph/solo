// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type ServiceEndpoint} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../../src/core/constants.js';
import {Helpers} from '../../../../src/core/helpers.js';
import {ConsensusNode} from '../../../../src/core/model/consensus-node.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';

type FakeContainer = {
  execContainer: sinon.SinonStub;
  copyTo: sinon.SinonStub;
  hasDir: sinon.SinonStub;
};

type FakeK8 = {
  containers: () => {
    readByRef: () => FakeContainer;
  };
};

type EndpointState = {
  _domainName: unknown;
  _ipAddressV4: unknown;
  _port: number;
};

type PrepareGossipContext = {
  config: {
    cacheDir?: string;
    consensusNodes: ConsensusNode[];
    endpointType: string;
    gossipEndpoints?: string;
    namespace: NamespaceName;
    nodeAlias: string;
    stagingDir: string;
  };
  gossipEndpoints?: ServiceEndpoint[];
  newNode?: {accountId: string; name: string};
};

function createNodeCommandTasksWithPvcData(persistentVolumeClaimsByContext: Record<string, string[]>): {
  tasks: NodeCommandTasks;
  showUserMessages: string[];
} {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
  const showUserMessages: string[] = [];

  (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (context: string): {pvcs: () => {list: () => Promise<string[]>}} => ({
      pvcs: (): {list: () => Promise<string[]>} => ({
        list: async (): Promise<string[]> => persistentVolumeClaimsByContext[context] ?? [],
      }),
    }),
  };

  (nodeCommandTasks as unknown as {logger: unknown}).logger = {
    showUser: (message: string): void => {
      showUserMessages.push(message);
    },
  };

  return {tasks: nodeCommandTasks, showUserMessages};
}

function invokeParseGossipFqdnRestricted(
  _nodeCommandTasks: NodeCommandTasks,
  applicationPropertiesText: string,
): boolean | undefined {
  return Helpers.parseGossipFqdnRestricted(applicationPropertiesText);
}

function invokeValidateNodePvcsForLocalBuildPath(
  nodeCommandTasks: NodeCommandTasks,
  contexts: string[],
): Promise<void> {
  const validatorFunction: (namespace: NamespaceName, contexts: string[]) => Promise<void> = (
    nodeCommandTasks as unknown as Record<string, (namespace: NamespaceName, contexts: string[]) => Promise<void>>
  ).validateNodePvcsForLocalBuildPath;

  return validatorFunction.call(nodeCommandTasks, NamespaceName.of('solo'), contexts);
}

function invokeCopyLocalBuildPathToNode(
  nodeCommandTasks: NodeCommandTasks,
  k8: FakeK8,
  configManager: {getFlag: sinon.SinonStub},
  localBuildPath: string,
): Promise<void> {
  const copyFunction: (
    k8: FakeK8,
    podReference: PodReference,
    configManager: {getFlag: sinon.SinonStub},
    localBuildPath: string,
  ) => Promise<void> = (
    nodeCommandTasks as unknown as Record<
      string,
      (
        k8: FakeK8,
        podReference: PodReference,
        configManager: {getFlag: sinon.SinonStub},
        localBuildPath: string,
      ) => Promise<void>
    >
  ).copyLocalBuildPathToNode;

  return copyFunction.call(
    nodeCommandTasks,
    k8,
    PodReference.of(NamespaceName.of('solo'), PodName.of('network-node1-0')),
    configManager,
    localBuildPath,
  );
}

function invokeBuildRefreshLiveLocalBuildJarsCommand(nodeCommandTasks: NodeCommandTasks): string {
  const builderFunction: () => string = (nodeCommandTasks as unknown as Record<string, () => string>)
    .buildRefreshLiveLocalBuildJarsCommand;

  return builderFunction.call(nodeCommandTasks);
}

describe('NodeCommandTasks local build path PVC validation', (): void => {
  it('warns when local build path is used without node PVCs', async (): Promise<void> => {
    const {tasks, showUserMessages} = createNodeCommandTasksWithPvcData({
      'kind-solo': [],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(tasks, ['kind-solo'])).to.eventually.be.fulfilled;
    expect(showUserMessages).to.have.length(1);
    expect(showUserMessages[0]).to.include('--pvcs true');
  });

  it('passes when node PVCs exist for each context', async (): Promise<void> => {
    const {tasks} = createNodeCommandTasksWithPvcData({
      'kind-alpha': ['data-node1'],
      'kind-beta': ['data-node2'],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(tasks, ['kind-alpha', 'kind-beta'])).to.eventually.be
      .fulfilled;
  });
});

describe('NodeCommandTasks platform software fetch routing', (): void => {
  it('uploads local build software when upgrade version is empty', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const uploadResult: object = {};
    const validateNodePvcsStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'validateNodePvcsForLocalBuildPath')
      .resolves();
    const uploadPlatformSoftwareStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, '_uploadPlatformSoftware')
      .returns(uploadResult);

    try {
      const fetchPlatformSoftwareTask: ReturnType<NodeCommandTasks['fetchPlatformSoftware']> =
        nodeCommandTasks.fetchPlatformSoftware('nodeAliases');
      const result: unknown = await fetchPlatformSoftwareTask.task(
        {
          config: {
            consensusNodes: [{name: 'node1', context: 'kind-solo'}],
            localBuildPath: '/tmp/local-build/data',
            namespace: NamespaceName.of('solo'),
            nodeAliases: ['node1'],
            podRefs: {},
            releaseTag: 'v0.74.0',
            stagingDir: '/tmp/staging',
            upgradeVersion: '',
          },
        } as never,
        {} as never,
      );

      expect(result).to.equal(uploadResult);
      expect(validateNodePvcsStub.calledOnceWith(NamespaceName.of('solo'), ['kind-solo'])).to.equal(true);
      expect(uploadPlatformSoftwareStub.calledOnce).to.equal(true);
    } finally {
      sinon.restore();
    }
  });
});

describe('NodeCommandTasks local build path copy', (): void => {
  it('builds a start preflight that refreshes and validates local build jars', (): void => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const hapiPath: string = constants.HEDERA_HAPI_PATH;
    const applicationDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libraryDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_LIB_DIR}`;
    const applicationJar: string = `${applicationDirectory}/${constants.HEDERA_APP_NAME}`;
    const upgradeDirectory: string = `${hapiPath}/data/upgrade/current`;
    const upgradeApplicationDirectory: string = `${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}`;
    const upgradeLibraryDirectory: string = `${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}`;
    const upgradeApplicationJar: string = `${upgradeApplicationDirectory}/${constants.HEDERA_APP_NAME}`;

    const command: string = invokeBuildRefreshLiveLocalBuildJarsCommand(nodeCommandTasks);

    expect(command).to.include(`if [ -f "${upgradeApplicationJar}" ]; then`);
    expect(command).to.include(`rm -f "${applicationDirectory}"/*.jar "${libraryDirectory}"/*.jar`);
    expect(command).to.include(`cp -f "${upgradeApplicationDirectory}"/*.jar "${applicationDirectory}/"`);
    expect(command).to.include(`cp -f "${upgradeLibraryDirectory}"/*.jar "${libraryDirectory}/"`);
    expect(command).to.include(`chown -R hedera:hedera "${applicationDirectory}" "${libraryDirectory}"`);
    expect(command).to.include(`chmod -R u+rwX,g+rX,o+rX "${applicationDirectory}" "${libraryDirectory}"`);
    expect(command).to.include(`test -f "${applicationJar}"`);
    expect(command).to.include(
      `/command/s6-setuidgid hedera unzip -l "${applicationJar}" "com/hedera/node/app/ServicesMain.class" | ` +
        'grep -q "com/hedera/node/app/ServicesMain.class"',
    );
  });

  it('stops the network node and disables autostart before replacing jars', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const execContainerStub: sinon.SinonStub = sinon.stub().resolves('');
    const copyToStub: sinon.SinonStub = sinon.stub().resolves();
    const hasDirectoryStub: sinon.SinonStub = sinon.stub().resolves(false);
    const k8: FakeK8 = {
      containers: (): {readByRef: () => FakeContainer} => ({
        readByRef: (): FakeContainer => ({
          execContainer: execContainerStub,
          copyTo: copyToStub,
          hasDir: hasDirectoryStub,
        }),
      }),
    };
    const configManager: {getFlag: sinon.SinonStub} = {getFlag: sinon.stub().returns('')};

    await expect(invokeCopyLocalBuildPathToNode(nodeCommandTasks, k8, configManager, '/tmp/local-build/data')).to
      .eventually.be.fulfilled;

    expect(execContainerStub.callCount).to.equal(4);
    const expectedStopCommand: string = [
      'test -x "/command/network-node-lifecycle" || { ' +
        'echo "missing /command/network-node-lifecycle; update solo-container image" >&2; exit 1; }',
      '"/command/network-node-lifecycle" stop-and-disable-autostart',
    ].join('\n');
    expect(execContainerStub.firstCall.args[0]).to.deep.equal(['bash', '-c', expectedStopCommand]);
    const expectedJarRemovalCommand: string =
      `rm -rf ${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_LIB_DIR}/*.jar ` +
      `${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_APPS_DIR}/*.jar`;
    expect(execContainerStub.secondCall.args[0]).to.deep.equal(['bash', '-c', expectedJarRemovalCommand]);
    expect(execContainerStub.thirdCall.args[0]).to.deep.equal([
      'bash',
      '-c',
      [
        `chown -R hedera:hedera "${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_APPS_DIR}" "${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_LIB_DIR}"`,
        `chmod -R u+rwX,g+rX,o+rX "${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_APPS_DIR}" "${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_LIB_DIR}"`,
      ].join('\n'),
    ]);
    expect(execContainerStub.getCall(3).args[0]).to.deep.equal(['sync', constants.HEDERA_HAPI_PATH]);
    expect(hasDirectoryStub.calledOnceWith(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current`)).to.equal(true);
    expect(copyToStub.calledOnceWith('/tmp/local-build/data', constants.HEDERA_HAPI_PATH)).to.equal(true);
  });

  it('copies local build jars into the prepared upgrade directory when present', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const execContainerStub: sinon.SinonStub = sinon.stub().resolves('');
    const copyToStub: sinon.SinonStub = sinon.stub().resolves();
    const hasDirectoryStub: sinon.SinonStub = sinon.stub().resolves(true);
    const k8: FakeK8 = {
      containers: (): {readByRef: () => FakeContainer} => ({
        readByRef: (): FakeContainer => ({
          execContainer: execContainerStub,
          copyTo: copyToStub,
          hasDir: hasDirectoryStub,
        }),
      }),
    };
    const configManager: {getFlag: sinon.SinonStub} = {getFlag: sinon.stub().returns('')};

    await expect(invokeCopyLocalBuildPathToNode(nodeCommandTasks, k8, configManager, '/tmp/local-build/data')).to
      .eventually.be.fulfilled;

    const upgradeDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
    const expectedUpgradeJarRemovalCommand: string =
      `rm -rf ${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}/*.jar ` +
      `${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}/*.jar`;

    expect(execContainerStub.callCount).to.equal(6);
    expect(execContainerStub.getCall(3).args[0]).to.deep.equal(['bash', '-c', expectedUpgradeJarRemovalCommand]);
    expect(execContainerStub.getCall(4).args[0]).to.deep.equal([
      'bash',
      '-c',
      [
        `chown -R hedera:hedera "${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}" "${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}"`,
        `chmod -R u+rwX,g+rX,o+rX "${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}" "${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}"`,
      ].join('\n'),
    ]);
    expect(execContainerStub.getCall(5).args[0]).to.deep.equal(['sync', constants.HEDERA_HAPI_PATH]);
    expect(copyToStub.firstCall.args[0]).to.equal('/tmp/local-build/data');
    expect(copyToStub.firstCall.args[1]).to.equal(constants.HEDERA_HAPI_PATH);
    expect(copyToStub.secondCall.args[0]).to.equal('/tmp/local-build/data');
    expect(copyToStub.secondCall.args[1]).to.equal(upgradeDirectory);
  });
});

describe('NodeCommandTasks gossipFqdnRestricted resolution', (): void => {
  const configMapFalseData: {data: Record<string, string>} = {
    data: {[constants.APPLICATION_PROPERTIES]: 'nodes.gossipFqdnRestricted=false\n'},
  };
  const emptyConfigMapData: {data: Record<string, string>} = {data: {}};

  function invokeGetGossipFqdnRestricted(
    nodeCommandTasks: NodeCommandTasks,
    config: {namespace: NamespaceName; stagingDir: string},
    k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
  ): Promise<boolean> {
    const getterFunction: (
      config: {namespace: NamespaceName; stagingDir: string},
      k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
    ) => Promise<boolean> = (
      nodeCommandTasks as unknown as Record<
        string,
        (
          config: {namespace: NamespaceName; stagingDir: string},
          k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
        ) => Promise<boolean>
      >
    ).getGossipFqdnRestricted;
    return getterFunction.call(nodeCommandTasks, config, k8);
  }

  it('parses true/false values with surrounding whitespace', (): void => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

    expect(invokeParseGossipFqdnRestricted(nodeCommandTasks, 'nodes.gossipFqdnRestricted=true')).to.equal(true);
    expect(invokeParseGossipFqdnRestricted(nodeCommandTasks, ' nodes.gossipFqdnRestricted = false ')).to.equal(false);
  });

  it('prefers ConfigMap value over staged application.properties', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-configmap-'));
    const templatesDirectory: string = path.join(stagingDirectory, 'templates');
    fs.mkdirSync(templatesDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(templatesDirectory, constants.APPLICATION_PROPERTIES),
      'nodes.gossipFqdnRestricted=true\n',
    );

    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<{data?: Record<string, string>}> => configMapFalseData,
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(false);
    } finally {
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });

  it('falls back to staged application.properties when ConfigMap is unavailable', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-staged-'));
    const templatesDirectory: string = path.join(stagingDirectory, 'templates');
    fs.mkdirSync(templatesDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(templatesDirectory, constants.APPLICATION_PROPERTIES),
      'nodes.gossipFqdnRestricted=false\n',
    );

    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<never> => {
          throw new Error('config map missing');
        },
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(false);
    } finally {
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });

  it('defaults to true when neither ConfigMap nor staged file provides a value', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-default-'));
    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<{data?: Record<string, string>}> => emptyConfigMapData,
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    // Stub fs.existsSync to return false for all paths (no cache/repo files exist)
    const existsSyncStub: sinon.SinonStub = sinon.stub(fs, 'existsSync').returns(false);
    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(true);
      expect(existsSyncStub.callCount).to.be.greaterThanOrEqual(1);
    } finally {
      sinon.restore();
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });
});

describe('NodeCommandTasks generated gossip endpoints', (): void => {
  it('creates a load balancer service and uses IP SDK endpoints for multi-context generated gossip endpoints', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-gossip-endpoints-'));
    let serviceCreated: boolean = false;
    const listServicesStub: sinon.SinonStub = sinon.stub().callsFake(async (): Promise<object[]> => {
      if (!serviceCreated) {
        return [];
      }

      return [
        {
          metadata: {
            name: 'network-node4-svc',
          },
          spec: {
            type: 'LoadBalancer',
          },
          status: {
            loadBalancer: {
              ingress: [
                {
                  ip: '172.19.1.8',
                },
              ],
            },
          },
        },
      ];
    });
    const applyManifestStub: sinon.SinonStub = sinon.stub().callsFake(async (manifestPath: string): Promise<void> => {
      const manifest: {
        metadata: {
          annotations: Record<string, string>;
          labels: Record<string, string>;
          name: string;
          namespace: string;
        };
        spec: {selector: Record<string, string>; type: string};
      } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.metadata.name).to.equal('network-node4-svc');
      expect(manifest.metadata.namespace).to.equal('dual-cluster-full');
      expect(manifest.metadata.annotations['meta.helm.sh/release-name']).to.equal(constants.SOLO_DEPLOYMENT_CHART);
      expect(manifest.metadata.labels['app.kubernetes.io/managed-by']).to.equal('Helm');
      expect(manifest.metadata.labels['solo.hedera.com/account-id']).to.equal('3.2.6');
      expect(manifest.metadata.labels['solo.hedera.com/node-id']).to.equal('3');
      expect(manifest.metadata.labels['solo.hedera.com/node-name']).to.equal('node4');
      expect(manifest.metadata.labels['solo.hedera.com/type']).to.equal('network-node-svc');
      expect(manifest.spec.selector.app).to.equal('network-node4');
      expect(manifest.spec.type).to.equal('LoadBalancer');

      serviceCreated = true;
    });
    const k8: object = {
      manifests: (): {applyManifest: sinon.SinonStub} => ({
        applyManifest: applyManifestStub,
      }),
      services: (): {list: sinon.SinonStub} => ({
        list: listServicesStub,
      }),
    };

    (nodeCommandTasks as unknown as {k8Factory: {getK8: (context: string) => object}}).k8Factory = {
      getK8: (context: string): object => {
        expect(context).to.equal('context-a');
        return k8;
      },
    };
    (nodeCommandTasks as unknown as {getGossipFqdnRestricted: () => Promise<boolean>}).getGossipFqdnRestricted =
      async (): Promise<boolean> => false;

    const context_: PrepareGossipContext = {
      config: {
        cacheDir: stagingDirectory,
        consensusNodes: [
          new ConsensusNode(
            'node1',
            0,
            'dual-cluster-full',
            undefined,
            'context-a',
            'cluster.local',
            '',
            'network-node1-svc.dual-cluster-full.svc.cluster.local',
            [],
            [],
          ),
          new ConsensusNode(
            'node3',
            2,
            'dual-cluster-full',
            undefined,
            'context-b',
            'cluster.local',
            '',
            'network-node3-svc.dual-cluster-full.svc.cluster.local',
            [],
            [],
          ),
        ],
        endpointType: constants.ENDPOINT_TYPE_FQDN,
        namespace: NamespaceName.of('dual-cluster-full'),
        nodeAlias: 'node4',
        stagingDir: stagingDirectory,
      },
      newNode: {accountId: '3.2.6', name: 'node4'},
    };

    try {
      await nodeCommandTasks.prepareGossipEndpoints().task(context_ as never, undefined as never);
    } finally {
      fs.rmSync(stagingDirectory, {force: true, recursive: true});
    }

    expect(applyManifestStub).to.have.been.calledOnce;
    expect(listServicesStub).to.have.been.calledThrice;

    const gossipEndpoints: ServiceEndpoint[] = context_.gossipEndpoints ?? [];
    expect(gossipEndpoints).to.have.lengthOf(2);

    const internalEndpointState: EndpointState = gossipEndpoints[0] as unknown as EndpointState;
    const externalEndpointState: EndpointState = gossipEndpoints[1] as unknown as EndpointState;

    expect(internalEndpointState._domainName).to.be.null;
    expect([...(internalEndpointState._ipAddressV4 as Uint8Array)]).to.deep.equal([127, 0, 0, 1]);
    expect(internalEndpointState._port).to.equal(+constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT);
    expect(externalEndpointState._domainName).to.be.null;
    expect([...(externalEndpointState._ipAddressV4 as Uint8Array)]).to.deep.equal([172, 19, 1, 8]);
    expect(externalEndpointState._port).to.equal(+constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT);
  });
});
