// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {MirrorNodeCommand} from '../../../src/commands/mirror-node.js';
import * as constants from '../../../src/core/constants.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import * as versions from '../../../version.js';
import {resetForTest} from '../../test-container.js';
import {HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type SoloListrTask} from '../../../src/types/index.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import path from 'node:path';
import yaml from 'yaml';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {Duration} from '../../../src/core/time/duration.js';

interface MirrorNodeMemoryOverrideConfig {
  mirrorNodeVersion: string;
  chartValues: HelmChartValues;
  componentImage?: string;
}

interface MirrorNodeRemoteConfigTestState {
  clusters: {name: string; dnsBaseDomain: string}[];
  components: {
    state: {
      blockNodes: {metadata: {id: number; cluster: string; namespace: string}}[];
    };
  };
  versions?: {
    consensusNode: {greaterThanOrEqual: () => boolean};
    blockNodeChart: {greaterThanOrEqual: () => boolean};
  };
  state?: {
    tssEnabled?: boolean;
  };
}

interface MirrorNodeCommandInternal {
  remoteConfig: {
    configuration: MirrorNodeRemoteConfigTestState;
    _remoteConfig?: MirrorNodeRemoteConfigTestState;
    phase?: 'loaded' | 'not_loaded';
  };
  addMirrorNodeMemoryOverrides: (
    hasMirrorNodeMemoryImprovements: boolean,
    config: MirrorNodeMemoryOverrideConfig,
  ) => void;
  addMirrorNodeImageTagOverrides: (chartValues: HelmChartValues, mirrorNodeVersion: string) => void;
  shouldApplyMirrorNodeImageTagOverrides: (mirrorNodeChartDirectory: string) => boolean;
  configManager: {wasFlagProvidedByUser: sinon.SinonStub};
  initializeSharedPostgresDatabaseTask: () => SoloListrTask<MirrorNodeDatabaseTaskContext>;
  primePostgresSecretTask: () => SoloListrTask<MirrorNodeDatabaseTaskContext>;
  waitForMirrorNodeSchemaTask: () => SoloListrTask<MirrorNodeSchemaWaitTaskContext>;
  k8Factory: {getK8: (context: string) => {pods: () => MirrorNodeSchemaWaitPodsStub}};
  prepareBlockNodeIntegrationValues: (config: {
    cacheDir: string;
    clusterReference: string;
    forceBlockNodeIntegration?: boolean;
    mirrorNodeVersion: string;
  }) => HelmChartValues;
  shouldReuseValuesOnUpgrade: (
    currentVersion: SemanticVersion<string> | null,
    targetVersion: string,
    commandType: string,
  ) => boolean;
  prepareHelmChartValues: (config: Record<string, unknown>) => Promise<HelmChartValues>;
  isComponentImageAvailableForKind: (componentImage: string, componentImageArchive: string) => boolean;
}

interface MirrorNodeDatabaseTaskContext {
  config: {
    useExternalDatabase: boolean;
    installSharedResources: boolean;
  };
}

interface MirrorNodeSchemaWaitTaskContext {
  config: {
    releaseName: string;
    clusterContext: string;
    namespace: {name: string};
  };
}

interface MirrorNodeSchemaWaitPodsStub {
  waitForRunningPhase: sinon.SinonStub;
  waitForReadyStatus: sinon.SinonStub;
}

interface MirrorNodeChartUpgradeTestConfig {
  namespace: {name: string};
  releaseName: string;
  mirrorNodeChartDirectory?: string;
  mirrorNodeVersion: string;
  chartValues: HelmChartValues;
  clusterContext: string;
  isChartInstalled: boolean;
}

interface MirrorNodeChartUpgradeInternal {
  chartManager: {
    upgrade: sinon.SinonStub;
    uninstall: sinon.SinonStub;
  };
  upgradeMirrorNodeChart: (config: MirrorNodeChartUpgradeTestConfig, shouldReuseValues: boolean) => Promise<void>;
}

interface MirrorNodeCommandTrailingCloseInternal {
  oneShotState: {isActive: () => boolean};
  taskList: {
    newTaskList: (...newTaskListParameters: unknown[]) => unknown;
    registerCloseFunction: (trailingCloseFunction: () => Promise<void>) => void;
  };
  accountManager: {close: () => Promise<void>};
}

type MirrorNodeDatabaseSkip = (context: MirrorNodeDatabaseTaskContext) => boolean;

function getSkipFunction(task: SoloListrTask<MirrorNodeDatabaseTaskContext>): MirrorNodeDatabaseSkip {
  expect(task.skip).to.be.a('function');
  return task.skip as MirrorNodeDatabaseSkip;
}

function stubImporterPods(
  command: MirrorNodeCommand,
  podsStub: MirrorNodeSchemaWaitPodsStub,
): MirrorNodeCommandInternal {
  const mirrorNodeCommandInternal: MirrorNodeCommandInternal = command as unknown as MirrorNodeCommandInternal;
  mirrorNodeCommandInternal.k8Factory = {
    getK8: (): {pods: () => MirrorNodeSchemaWaitPodsStub} => ({
      pods: (): MirrorNodeSchemaWaitPodsStub => podsStub,
    }),
  };
  return mirrorNodeCommandInternal;
}

function buildChartUpgradeConfig(isChartInstalled: boolean): MirrorNodeChartUpgradeTestConfig {
  return {
    namespace: {name: 'one-shot'},
    releaseName: 'mirror-1',
    mirrorNodeVersion: 'v0.159.0',
    chartValues: new HelmChartValues(),
    clusterContext: 'kind-kind',
    isChartInstalled,
  };
}

function stubChartUpgrade(command: MirrorNodeCommand): MirrorNodeChartUpgradeInternal {
  // collapse the retry backoff so the test does not wait for the real delay
  const ofSecondsStub: sinon.SinonStub = sinon.stub(Duration, 'ofSeconds');
  ofSecondsStub.callThrough();
  ofSecondsStub.withArgs(constants.MIRROR_NODE_CHART_UPGRADE_RETRY_DELAY_SECS).returns(Duration.ofMillis(1));

  const mirrorNodeCommandInternal: MirrorNodeChartUpgradeInternal =
    command as unknown as MirrorNodeChartUpgradeInternal;
  mirrorNodeCommandInternal.chartManager = {
    upgrade: sinon.stub().resolves(true),
    uninstall: sinon.stub().resolves(true),
  };
  return mirrorNodeCommandInternal;
}

interface MirrorNodeIntegrationValues {
  importer: {
    env: {
      SPRING_PROFILES_ACTIVE: string;
      HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST?: string;
    };
    config: {
      hiero: {
        mirror: {
          importer: {
            block?: {
              nodes: {
                endpoints: {
                  host: string;
                  port: number;
                }[];
              }[];
            };
            downloader: {
              record: {enabled: boolean};
              balance: {enabled: boolean};
            };
          };
        };
      };
    };
  };
}

describe('MirrorNodeCommand unit tests', (): void => {
  let mirrorNodeCommand: MirrorNodeCommand;

  beforeEach((): void => {
    resetForTest();
    mirrorNodeCommand = container.resolve(MirrorNodeCommand);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should keep the legacy web3 image override on arm64 for versions below mirror node 0.155.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);
    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override the web3 image on arm64 for mirror node 0.155.0 and above', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: versions.MINIMUM_MIRROR_NODE_VERSION_FOR_ARM64_WEB3_NATIVE_IMAGE,
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.not.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override the web3 image on amd64 even for versions below mirror node 0.155.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('x64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.not.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override module image registry/repository when componentImage is provided for legacy versions', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
      componentImage: 'docker.io/library/custom-mirror:dev',
    };

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(false, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(
      valuesArguments.some((argument: string): boolean =>
        argument.includes(`.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`),
      ),
    ).to.equal(false);
    expect(
      valuesArguments.some((argument: string): boolean =>
        argument.includes(`.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}`),
      ),
    ).to.equal(false);
    expect(valuesArguments).to.include(`grpc.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_GRPC}`);
  });

  it('should not override arm64 web3 image registry/repository when componentImage is provided', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
      componentImage: 'docker.io/library/custom-mirror:dev',
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should pin mirror node image tags to the selected mirror node version', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const chartValues: HelmChartValues = new HelmChartValues();

    mirrorNodeCommandInternal.addMirrorNodeImageTagOverrides(chartValues, 'v0.157.0');

    const valuesArguments: string[] = chartValues.toArguments();
    expect(valuesArguments).to.include('grpc.image.tag=0.157.0');
    expect(valuesArguments).to.include('importer.image.tag=0.157.0');
    expect(valuesArguments).to.include('monitor.image.tag=0.157.0');
    expect(valuesArguments).to.include('pinger.image.tag=0.157.0');
    expect(valuesArguments).to.include('rest.image.tag=0.157.0');
    expect(valuesArguments).to.include('restjava.image.tag=0.157.0');
    expect(valuesArguments).to.include('web3.image.tag=0.157.0');
  });

  it('should configure every Mirror Node module image from an archive with a Never pull policy', async (): Promise<void> => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    sinon.stub(mirrorNodeCommandInternal, 'prepareBlockNodeIntegrationValues').returns(new HelmChartValues());
    sinon.stub(mirrorNodeCommandInternal, 'isComponentImageAvailableForKind').returns(true);

    const chartValues: HelmChartValues = await mirrorNodeCommandInternal.prepareHelmChartValues({
      valuesFile: '',
      mirrorNodeVersion: '0.157.0',
      componentImage: 'ghcr.io/hiero-ledger/hiero-mirror:0.157.0',
      componentImageArchive: '/artifacts/hiero-mirror.tar',
      mirrorNodeChartDirectory: '',
      storageBucket: '',
      storageBucketPrefix: '',
      storageType: constants.StorageType.MINIO_ONLY,
      storageReadAccessKey: '',
      storageReadSecrets: '',
      storageEndpoint: '',
      storageBucketRegion: '',
      domainName: undefined,
      useExternalDatabase: false,
      namespace: NamespaceName.of('mirror'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    const pullPolicyArguments: string[] = valueArguments.filter((argument: string): boolean =>
      argument.endsWith('.image.pullPolicy=Never'),
    );

    expect(valueArguments).to.include('importer.image.registry=ghcr.io');
    expect(valueArguments).to.include('importer.image.repository=hiero-ledger/hiero-mirror');
    expect(pullPolicyArguments).to.have.length(6);
  });

  it('should apply mirror node image tag overrides when no local chart directory is used', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;

    expect(mirrorNodeCommandInternal.shouldApplyMirrorNodeImageTagOverrides('')).to.equal(true);
  });

  it('should skip mirror node image tag overrides for a local chart directory when the version flag was not provided', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    mirrorNodeCommandInternal.configManager = {wasFlagProvidedByUser: sinon.stub().returns(false)};

    expect(
      mirrorNodeCommandInternal.shouldApplyMirrorNodeImageTagOverrides('/home/user/hiero-mirror-node/charts'),
    ).to.equal(false);
  });

  it('should apply mirror node image tag overrides for a local chart directory when the version flag was explicitly provided', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    mirrorNodeCommandInternal.configManager = {wasFlagProvidedByUser: sinon.stub().returns(true)};

    expect(
      mirrorNodeCommandInternal.shouldApplyMirrorNodeImageTagOverrides('/home/user/hiero-mirror-node/charts'),
    ).to.equal(true);
  });

  it('should use block node importer endpoint properties for mirror node 0.157.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-mirror-node-'));
    mirrorNodeCommandInternal.remoteConfig = {
      configuration: {
        components: {
          state: {
            blockNodes: [{metadata: {cluster: 'cluster-a', id: 1, namespace: 'solo'}}],
          },
        },
        clusters: [{name: 'cluster-a', dnsBaseDomain: 'cluster.local'}],
        versions: {
          consensusNode: {
            greaterThanOrEqual: (): boolean => true,
          },
          blockNodeChart: {
            greaterThanOrEqual: (): boolean => true,
          },
        },
      },
    };

    const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
      cacheDir: temporaryDirectory,
      clusterReference: 'cluster-a',
      forceBlockNodeIntegration: true,
      mirrorNodeVersion: '0.157.0',
    });
    const valuesFilePath: string = chartValues.toArguments()[1];
    const valuesFileContents: string = fs.readFileSync(valuesFilePath, 'utf8');
    const values: MirrorNodeIntegrationValues = yaml.parse(valuesFileContents) as MirrorNodeIntegrationValues;

    expect(valuesFileContents).to.not.include('HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST:');
    expect(valuesFileContents).to.not.include('HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_ENDPOINTS_0_HOST:');
    expect(values.importer.config.hiero.mirror.importer.block.nodes[0].endpoints[0].host).to.equal(
      'block-node-1.solo.svc.cluster.local',
    );
    expect(values.importer.config.hiero.mirror.importer.block.nodes[0].endpoints[0].port).to.equal(
      constants.BLOCK_NODE_PORT,
    );

    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('should keep legacy block node importer properties before mirror node 0.157.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-mirror-node-'));
    mirrorNodeCommandInternal.remoteConfig = {
      configuration: {
        components: {
          state: {
            blockNodes: [{metadata: {cluster: 'cluster-a', id: 1, namespace: 'solo'}}],
          },
        },
        clusters: [{name: 'cluster-a', dnsBaseDomain: 'cluster.local'}],
        versions: {
          consensusNode: {
            greaterThanOrEqual: (): boolean => true,
          },
          blockNodeChart: {
            greaterThanOrEqual: (): boolean => true,
          },
        },
      },
    };

    const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
      cacheDir: temporaryDirectory,
      clusterReference: 'cluster-a',
      forceBlockNodeIntegration: true,
      mirrorNodeVersion: '0.156.0',
    });
    const valuesFilePath: string = chartValues.toArguments()[1];
    const valuesFileContents: string = fs.readFileSync(valuesFilePath, 'utf8');

    expect(valuesFileContents).to.include('HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST');
    expect(valuesFileContents).to.not.include('HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_ENDPOINTS_0_HOST');

    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('should not reuse values when upgrading across mirror node block node endpoint property boundary', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;

    const shouldReuseValues: boolean = mirrorNodeCommandInternal.shouldReuseValuesOnUpgrade(
      new SemanticVersion<string>('0.156.0'),
      '0.157.0',
      'upgrade',
    );

    expect(shouldReuseValues).to.equal(false);
  });

  it('should reuse values when upgrading within the mirror node block node endpoint property shape', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;

    const shouldReuseValues: boolean = mirrorNodeCommandInternal.shouldReuseValuesOnUpgrade(
      new SemanticVersion<string>('0.157.0'),
      '0.157.1',
      'upgrade',
    );

    expect(shouldReuseValues).to.equal(true);
  });

  it('should run shared postgres initialization when shared resources already exist', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const task: SoloListrTask<MirrorNodeDatabaseTaskContext> =
      mirrorNodeCommandInternal.initializeSharedPostgresDatabaseTask();
    const context: MirrorNodeDatabaseTaskContext = {
      config: {
        useExternalDatabase: false,
        installSharedResources: false,
      },
    };

    expect(getSkipFunction(task)(context)).to.equal(false);
  });

  it('should run postgres secret priming when shared resources already exist', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const task: SoloListrTask<MirrorNodeDatabaseTaskContext> = mirrorNodeCommandInternal.primePostgresSecretTask();
    const context: MirrorNodeDatabaseTaskContext = {
      config: {
        useExternalDatabase: false,
        installSharedResources: false,
      },
    };

    expect(getSkipFunction(task)(context)).to.equal(false);
  });

  it('should skip shared postgres tasks for external database deployments', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const context: MirrorNodeDatabaseTaskContext = {
      config: {
        useExternalDatabase: true,
        installSharedResources: false,
      },
    };

    expect(getSkipFunction(mirrorNodeCommandInternal.initializeSharedPostgresDatabaseTask())(context)).to.equal(true);
    expect(getSkipFunction(mirrorNodeCommandInternal.primePostgresSecretTask())(context)).to.equal(true);
  });

  it('should disable record and balance downloaders when block node integration is enabled', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const cacheDirection: string = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-bn-values-'));

    try {
      mirrorNodeCommandInternal.remoteConfig = {
        configuration: {
          clusters: [{name: 'kind-a', dnsBaseDomain: 'cluster.local'}],
          components: {
            state: {
              blockNodes: [{metadata: {id: 1, cluster: 'kind-a', namespace: 'solo'}}],
            },
          },
          versions: {
            consensusNode: {
              greaterThanOrEqual: (): boolean => true,
            },
            blockNodeChart: {
              greaterThanOrEqual: (): boolean => true,
            },
          },
        },
      };

      const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
        cacheDir: cacheDirection,
        clusterReference: 'kind-a',
        mirrorNodeVersion: versions.MIRROR_NODE_VERSION,
      });

      const valuesArguments: string[] = chartValues.toArguments();
      const fileArgumentIndex: number = valuesArguments.indexOf('--values');
      expect(fileArgumentIndex, 'expected block-node integration values file').to.be.greaterThan(-1);

      const valuesFilePath: string = valuesArguments[fileArgumentIndex + 1];
      const values: MirrorNodeIntegrationValues = yaml.parse(
        fs.readFileSync(valuesFilePath, 'utf8'),
      ) as MirrorNodeIntegrationValues;

      expect(values.importer.env.SPRING_PROFILES_ACTIVE).to.equal(constants.SPRING_PROFILES_ACTIVE);
      expect(values.importer.env.HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST).to.equal(undefined);
      expect(values.importer.config.hiero.mirror.importer.block.nodes[0].endpoints[0].host).to.equal(
        'block-node-1.solo.svc.cluster.local',
      );
      expect(values.importer.config.hiero.mirror.importer.block.nodes[0].endpoints[0].port).to.equal(
        constants.BLOCK_NODE_PORT,
      );
      expect(values.importer.config.hiero.mirror.importer.downloader.record.enabled).to.equal(false);
      expect(values.importer.config.hiero.mirror.importer.downloader.balance.enabled).to.equal(false);
    } finally {
      fs.rmSync(cacheDirection, {recursive: true, force: true});
    }
  });

  it('should leave mirror node on consensus streams when consensus node version is not supported', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const cacheDirection: string = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-bn-values-'));

    try {
      mirrorNodeCommandInternal.remoteConfig._remoteConfig = {
        clusters: [{name: 'kind-a', dnsBaseDomain: 'cluster.local'}],
        components: {
          state: {
            blockNodes: [{metadata: {id: 1, cluster: 'kind-a', namespace: 'solo'}}],
          },
        },
        versions: {
          consensusNode: {
            greaterThanOrEqual: (): boolean => false,
          },
          blockNodeChart: {
            greaterThanOrEqual: (): boolean => true,
          },
        },
      };
      mirrorNodeCommandInternal.remoteConfig.phase = 'loaded';

      const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
        cacheDir: cacheDirection,
        clusterReference: 'kind-a',
        mirrorNodeVersion: versions.MIRROR_NODE_VERSION,
      });

      expect(chartValues.toArguments()).to.deep.equal([]);
    } finally {
      fs.rmSync(cacheDirection, {recursive: true, force: true});
    }
  });

  it('should leave mirror node on consensus streams when TSS is disabled', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const cacheDirection: string = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-bn-values-'));

    try {
      mirrorNodeCommandInternal.remoteConfig = {
        configuration: {
          clusters: [{name: 'kind-a', dnsBaseDomain: 'cluster.local'}],
          components: {
            state: {
              blockNodes: [{metadata: {id: 1, cluster: 'kind-a', namespace: 'solo'}}],
            },
          },
          versions: {
            consensusNode: {
              greaterThanOrEqual: (): boolean => true,
            },
            blockNodeChart: {
              greaterThanOrEqual: (): boolean => true,
            },
          },
          state: {
            tssEnabled: false,
          },
        },
      };

      const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
        cacheDir: cacheDirection,
        clusterReference: 'kind-a',
        mirrorNodeVersion: versions.MIRROR_NODE_VERSION,
      });

      expect(chartValues.toArguments()).to.deep.equal([]);
    } finally {
      fs.rmSync(cacheDirection, {recursive: true, force: true});
    }
  });

  describe('waitForMirrorNodeSchemaTask', (): void => {
    const schemaWaitContext: MirrorNodeSchemaWaitTaskContext = {
      config: {
        releaseName: 'mirror-1',
        clusterContext: 'kind-a',
        namespace: {name: 'solo'},
      },
    };

    it('should wait for importer readiness with the schema budget once the importer pod is running', async (): Promise<void> => {
      const podsStub: MirrorNodeSchemaWaitPodsStub = {
        waitForRunningPhase: sinon.stub().resolves([{}]),
        waitForReadyStatus: sinon.stub().resolves([{}]),
      };
      const mirrorNodeCommandInternal: MirrorNodeCommandInternal = stubImporterPods(mirrorNodeCommand, podsStub);

      const task: SoloListrTask<MirrorNodeSchemaWaitTaskContext> =
        mirrorNodeCommandInternal.waitForMirrorNodeSchemaTask();
      await (task.task as (context: MirrorNodeSchemaWaitTaskContext) => Promise<void>)(schemaWaitContext);

      const expectedLabels: string[] = ['app.kubernetes.io/component=importer', 'app.kubernetes.io/instance=mirror-1'];
      expect(podsStub.waitForRunningPhase.calledOnce).to.equal(true);
      expect(podsStub.waitForReadyStatus.calledOnce).to.equal(true);
      expect(podsStub.waitForReadyStatus.firstCall.args[1]).to.deep.equal(expectedLabels);
      expect(podsStub.waitForReadyStatus.firstCall.args[2]).to.equal(constants.MIRROR_NODE_SCHEMA_READY_MAX_ATTEMPTS);
      expect(podsStub.waitForReadyStatus.firstCall.args[3]).to.equal(constants.MIRROR_NODE_SCHEMA_READY_DELAY);
    });

    it('should skip the schema wait when no importer pod appears', async (): Promise<void> => {
      const podsStub: MirrorNodeSchemaWaitPodsStub = {
        waitForRunningPhase: sinon.stub().rejects(new Error('no pods found')),
        waitForReadyStatus: sinon.stub().resolves([{}]),
      };
      const mirrorNodeCommandInternal: MirrorNodeCommandInternal = stubImporterPods(mirrorNodeCommand, podsStub);

      const task: SoloListrTask<MirrorNodeSchemaWaitTaskContext> =
        mirrorNodeCommandInternal.waitForMirrorNodeSchemaTask();
      await (task.task as (context: MirrorNodeSchemaWaitTaskContext) => Promise<void>)(schemaWaitContext);

      expect(podsStub.waitForReadyStatus.called).to.equal(false);
    });
  });

  describe('upgradeMirrorNodeChart', (): void => {
    const transientError: Error = new Error(
      'Post "https://127.0.0.1:33745/api/v1/namespaces/one-shot/secrets?fieldManager=helm": unexpected EOF',
    );

    it('retries the chart upgrade after a transient failure and cleans up the fresh install', async (): Promise<void> => {
      const mirrorNodeCommandInternal: MirrorNodeChartUpgradeInternal = stubChartUpgrade(mirrorNodeCommand);
      mirrorNodeCommandInternal.chartManager.upgrade.onFirstCall().rejects(transientError);

      await mirrorNodeCommandInternal.upgradeMirrorNodeChart(buildChartUpgradeConfig(false), false);

      expect(mirrorNodeCommandInternal.chartManager.upgrade.callCount).to.equal(2);
      expect(mirrorNodeCommandInternal.chartManager.uninstall.callCount).to.equal(1);
      expect(mirrorNodeCommandInternal.chartManager.uninstall.firstCall.args[1]).to.equal('mirror-1');
    });

    it('does not uninstall a previously installed release between retries', async (): Promise<void> => {
      const mirrorNodeCommandInternal: MirrorNodeChartUpgradeInternal = stubChartUpgrade(mirrorNodeCommand);
      mirrorNodeCommandInternal.chartManager.upgrade.onFirstCall().rejects(transientError);

      await mirrorNodeCommandInternal.upgradeMirrorNodeChart(buildChartUpgradeConfig(true), true);

      expect(mirrorNodeCommandInternal.chartManager.upgrade.callCount).to.equal(2);
      expect(mirrorNodeCommandInternal.chartManager.uninstall.called).to.equal(false);
    });

    it('throws the last error once all attempts are exhausted', async (): Promise<void> => {
      const mirrorNodeCommandInternal: MirrorNodeChartUpgradeInternal = stubChartUpgrade(mirrorNodeCommand);
      mirrorNodeCommandInternal.chartManager.upgrade.rejects(transientError);

      let thrownError: Error | undefined;
      try {
        await mirrorNodeCommandInternal.upgradeMirrorNodeChart(buildChartUpgradeConfig(false), false);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).to.equal(transientError);
      expect(mirrorNodeCommandInternal.chartManager.upgrade.callCount).to.equal(
        constants.MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS,
      );
    });
  });

  describe('upgrade trailing close function', (): void => {
    it('should tolerate a missing lease when one-shot deactivates before the trailing close runs', async (): Promise<void> => {
      const mirrorNodeCommandInternal: MirrorNodeCommandTrailingCloseInternal =
        mirrorNodeCommand as unknown as MirrorNodeCommandTrailingCloseInternal;
      const isActiveStub: sinon.SinonStub = sinon
        .stub(mirrorNodeCommandInternal.oneShotState, 'isActive')
        .returns(true);
      sinon.stub(mirrorNodeCommandInternal.taskList, 'newTaskList').returns({isRoot: (): boolean => false});
      let trailingCloseFunction: (() => Promise<void>) | undefined;
      sinon
        .stub(mirrorNodeCommandInternal.taskList, 'registerCloseFunction')
        .callsFake((closeFunction: () => Promise<void>): void => {
          trailingCloseFunction = closeFunction;
        });
      const accountManagerCloseStub: sinon.SinonStub = sinon
        .stub(mirrorNodeCommandInternal.accountManager, 'close')
        .resolves();

      expect(await mirrorNodeCommand.upgrade({} as ArgvStruct)).to.equal(true);
      expect(trailingCloseFunction).to.be.a('function');

      // one-shot deactivates before trailing close functions run, so the release guard must tolerate a missing lease
      isActiveStub.returns(false);
      await trailingCloseFunction();
      expect(accountManagerCloseStub.calledOnce).to.equal(true);
    });
  });
});
