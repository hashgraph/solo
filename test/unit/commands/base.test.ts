// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';

import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {BaseCommand} from '../../../src/commands/base.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import sinon, {type SinonSandbox, type SinonStub, type SinonStubbedInstance} from 'sinon';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ClusterReferences, type Context, type SoloListrTask} from '../../../src/types/index.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type AnyListrContext, type NodeAlias} from '../../../src/types/aliases.js';
import {type HelmClient} from '../../../src/integration/helm/helm-client.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {RemoteConfigRuntimeState} from '../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {OperatingSystem} from '../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type KindClient} from '../../../src/integration/kind/kind-client.js';

interface BaseCommandInternal {
  isLocalImageReference: (imageReference: string) => boolean;
  kindClusterNameFromContext: (clusterContext: string) => string | undefined;
  kindLoadComponentImage: (
    componentImage: string,
    clusterContext: string,
    additionalContexts?: Context[],
  ) => Promise<void>;
  kindLoadComponentImageArchive: (componentImageArchive: string, clusterContext: Context) => Promise<void>;
  loadComponentImage: (
    componentImage: string | undefined,
    componentImageArchive: string | undefined,
    clusterContext: Context,
  ) => Promise<void>;
  logger: SoloLogger;
  remoteConfig: {getContexts: () => Context[]};
  depManager: {getExecutable: (dependency: string) => Promise<string>};
  k8Factory: K8Factory;
  kindBuilder: {
    executable: (executable: string) => {
      build: () => Promise<KindClient>;
    };
  };
}

/** Builds a K8Factory whose default kubeconfig resolves a context to the given cluster entry names. */
function stubK8FactoryWithClusterEntries(clusterEntriesByContext: Record<string, string>): K8Factory {
  return {
    default: (): unknown => ({
      contexts: (): unknown => ({
        readClusterOfContext: (context: string): string => clusterEntriesByContext[context] ?? '',
      }),
    }),
  } as unknown as K8Factory;
}

class TestBaseCommand extends BaseCommand {
  public async close(): Promise<void> {}

  public async runDockerDesktopPreflightTask(): Promise<void> {
    const task: SoloListrTask<AnyListrContext> = this.dockerDesktopPreflightTask();
    await (task.task as () => Promise<void>)();
  }
}

describe('BaseCommand', (): void => {
  let helm: HelmClient;
  let chartManager: ChartManager;
  let configManager: ConfigManager;
  let depManager: DependencyManager;
  let localConfig: LocalConfigRuntimeState;
  let remoteConfig: RemoteConfigRuntimeStateApi;
  let sandbox: SinonSandbox = sinon.createSandbox();
  let testLogger: SoloLogger;

  let baseCmd: BaseCommand;

  describe('runShell', (): void => {
    before(async (): Promise<void> => {
      resetForTest();
      testLogger = container.resolve(InjectTokens.SoloLogger);
      helm = container.resolve(InjectTokens.Helm);
      chartManager = container.resolve(InjectTokens.ChartManager);
      configManager = container.resolve(InjectTokens.ConfigManager);
      depManager = container.resolve(InjectTokens.DependencyManager);
      localConfig = container.resolve(InjectTokens.LocalConfigRuntimeState);
      remoteConfig = container.resolve(InjectTokens.RemoteConfigRuntimeState);

      sandbox = sinon.createSandbox();
      sandbox.stub(K8Client.prototype, 'init').callsFake(function (this: K8Client): K8Client {
        // eslint-disable-next-line unicorn/no-this-outside-of-class
        return this;
      });
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);

      // @ts-expect-error - allow to create instance of abstract class
      baseCmd = new BaseCommand({
        logger: testLogger,
        helm,
        k8Factory,
        chartManager,
        configManager,
        depManager,
        localConfig,
        remoteConfig,
      });

      await localConfig.load();
    });

    after((): void => {
      sandbox.restore();
    });

    it('should fail during invalid program check', async (): Promise<void> => {
      await expect(baseCmd.run('INVALID_PROGRAM')).to.be.rejected;
    });
    it('should succeed during valid program check', async (): Promise<void> => {
      await expect(baseCmd.run('echo')).to.eventually.not.be.null;
    });
    it('getConfig tracks property usage', (): void => {
      const flagsList: CommandFlag[] = [flags.releaseTag, flags.tlsClusterIssuerType, flags.valuesFile];
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.releaseTag, 'releaseTag1');
      argv.setArg(flags.tlsClusterIssuerType, 'self-signed');
      argv.setArg(flags.valuesFile, 'file3');
      configManager.update(argv.build());

      const extraVariables: string[] = ['var1', 'var2'];

      interface newClassInstance {
        releaseTag: string;
        tlsClusterIssuerType: string;
        valuesFile: string;
        var1: string;
        var2: string;
        getUnusedConfigs: () => string[];
      }

      const NEW_CLASS1_NAME: string = 'newClassInstance1';
      const newClassInstance1: newClassInstance = baseCmd.configManager.getConfig(
        NEW_CLASS1_NAME,
        flagsList,
        extraVariables,
      ) as newClassInstance;
      expect(newClassInstance1.releaseTag).to.equal('releaseTag1');
      expect(newClassInstance1.tlsClusterIssuerType).to.equal('self-signed');
      expect(newClassInstance1.valuesFile).to.equal('file3');
      expect(newClassInstance1.var1).to.equal('');
      expect(newClassInstance1.var2).to.equal('');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS1_NAME)).to.deep.equal([]);

      const NEW_CLASS2_NAME: string = 'newClassInstance2';
      const newClassInstance2: newClassInstance = baseCmd.configManager.getConfig(
        NEW_CLASS2_NAME,
        flagsList,
        extraVariables,
      ) as newClassInstance;
      newClassInstance2.var1 = 'var1';
      newClassInstance2.var2 = 'var2';
      expect(newClassInstance2.var1).to.equal('var1');
      expect(newClassInstance2.var2).to.equal('var2');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS2_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.tlsClusterIssuerType.constName,
        flags.valuesFile.constName,
      ]);

      const NEW_CLASS3_NAME: string = 'newClassInstance3';
      const newClassInstance3: newClassInstance = baseCmd.configManager.getConfig(
        NEW_CLASS3_NAME,
        flagsList,
        extraVariables,
      ) as newClassInstance;
      newClassInstance3.var1 = 'var1';
      expect(newClassInstance3.var1).to.equal('var1');
      expect(newClassInstance3.tlsClusterIssuerType).to.equal('self-signed');
      expect(baseCmd.configManager.getUnusedConfigs(NEW_CLASS3_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.valuesFile.constName,
        'var2',
      ]);

      const newClassInstance4: newClassInstance = baseCmd.configManager.getConfig(
        'newClassInstance4',
        [],
      ) as newClassInstance;
      expect(newClassInstance4.getUnusedConfigs()).to.deep.equal([]);
    });
  });

  describe('get consensus nodes', (): void => {
    before((): void => {
      const testLogger: SinonStub = sinon.stub();
      const helm: SinonStub = sinon.stub();
      const chartManager: SinonStub = sinon.stub();
      const configManager: SinonStub = sinon.stub();
      const depManager: SinonStub = sinon.stub();
      const localConfig: LocalConfigRuntimeState = sinon.stub() as unknown as LocalConfigRuntimeState;

      // @ts-expect-error - TS2540: to mock
      localConfig.clusterRefs = sandbox.stub().returns({cluster: 'context1', cluster2: 'context2'});
      const remoteConfig: SinonStubbedInstance<RemoteConfigRuntimeState> =
        sinon.createStubInstance(RemoteConfigRuntimeState);

      const mockConsensusNodes: ConsensusNode[] = [
        new ConsensusNode(
          'name' as NodeAlias,
          0,
          'namespace',
          'cluster',
          'context1',
          'dnsBaseDomain',
          'dnsConsensusNodePattern',
          'fullyQualifiedDomainName',
          [],
          [],
        ),
        new ConsensusNode(
          'node2',
          1,
          'namespace',
          'cluster2',
          'context2',
          'dnsBaseDomain',
          'dnsConsensusNodePattern',
          'fullyQualifiedDomainName',
          [],
          [],
        ),
      ];

      remoteConfig.getConsensusNodes.returns(mockConsensusNodes);
      remoteConfig.getContexts.returns(mockConsensusNodes.map((node: ConsensusNode): Context => node.context));
      const mockedClusterReferenceMap: ClusterReferences = new Map<string, string>([
        ['cluster', 'context1'],
        ['cluster2', 'context2'],
      ]);
      remoteConfig.getClusterRefs.returns(mockedClusterReferenceMap);

      const k8Factory: SinonStub = sinon.stub();

      // @ts-expect-error - allow to create instance of abstract class
      baseCmd = new BaseCommand(
        testLogger,
        helm,
        k8Factory,
        chartManager,
        configManager,
        depManager,
        localConfig,
        remoteConfig,
      );
    });

    it('should return consensus nodes', (): void => {
      // @ts-expect-error - TS2445: to access private property
      const consensusNodes: ConsensusNode[] = baseCmd.remoteConfig.getConsensusNodes();
      expect(consensusNodes).to.be.an('array');
      expect(consensusNodes[0].context).to.equal('context1');
      expect(consensusNodes[1].context).to.equal('context2');
      expect(consensusNodes[0].name).to.equal('name');
      expect(consensusNodes[1].name).to.equal('node2');
      expect(consensusNodes[0].namespace).to.equal('namespace');
      expect(consensusNodes[1].namespace).to.equal('namespace');
      expect(consensusNodes[0].nodeId).to.equal(0);
      expect(consensusNodes[1].nodeId).to.equal(1);
      expect(consensusNodes[0].cluster).to.equal('cluster');
      expect(consensusNodes[1].cluster).to.equal('cluster2');
    });

    it('should return contexts', (): void => {
      // @ts-expect-error - TS2445: to access private property
      const contexts: Context[] = baseCmd.remoteConfig.getContexts();
      expect(contexts).to.be.an('array');
      expect(contexts[0]).to.equal('context1');
      expect(contexts[1]).to.equal('context2');
    });

    it('should return clusters references', (): void => {
      const expectedClusterReferences: Record<string, string> = {cluster: 'context1', cluster2: 'context2'};
      // @ts-expect-error - TS2445: to access private property
      const clusterReferences: ClusterReferences = baseCmd.remoteConfig.getClusterRefs();
      for (const [clusterReference] of clusterReferences) {
        expect(clusterReferences.get(clusterReference)).to.equal(expectedClusterReferences[clusterReference]);
      }
    });
  });

  describe('isLocalImageReference', (): void => {
    before((): void => {
      resetForTest();
      // @ts-expect-error - allow to create instance of abstract class
      baseCmd = new BaseCommand();
    });

    const localCases: string[] = [
      'block-node-server:0.36.0-SNAPSHOT',
      'hiero-explorer:my-build',
      'hiero-json-rpc-relay:local',
      'myimage:latest',
      'localhost:5001/block-node-server',
      'localhost:5001/block-node-server:0.38.0',
    ];

    const registryCases: string[] = [
      'ghcr.io/hiero-ledger/block-node-server:0.36.0',
      'docker.io/library/redis:7',
      'registry.example.com/org/image:v1',
    ];

    for (const reference of localCases) {
      it(`should identify '${reference}' as local`, (): void => {
        // @ts-expect-error - TS2445: protected method
        expect(baseCmd.isLocalImageReference(reference)).to.be.true;
      });
    }

    for (const reference of registryCases) {
      it(`should identify '${reference}' as registry`, (): void => {
        // @ts-expect-error - TS2445: protected method
        expect(baseCmd.isLocalImageReference(reference)).to.be.false;
      });
    }
  });

  describe('kindLoadComponentImage', (): void => {
    let baseCommandInternal: BaseCommandInternal;
    let loadDockerImageStub: SinonStub;
    let warnStub: SinonStub;

    beforeEach((): void => {
      baseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      loadDockerImageStub = sinon.stub().resolves();
      warnStub = sinon.stub();
      const kindClient: KindClient = {loadDockerImage: loadDockerImageStub} as unknown as KindClient;

      baseCommandInternal.logger = {warn: warnStub, debug: sinon.stub()} as unknown as SoloLogger;
      baseCommandInternal.k8Factory = stubK8FactoryWithClusterEntries({
        'kind-first': 'kind-first',
        'kind-second': 'kind-second',
        'kind-stale': 'kind-stale',
        'renamed-first': 'kind-first',
        'renamed-second': 'kind-second',
        'remote-cluster': 'remote-cluster-entry',
      });
      baseCommandInternal.remoteConfig = {
        getContexts: (): Context[] => ['kind-first', 'kind-second'],
      };
      baseCommandInternal.depManager = {
        getExecutable: async (dependency: string): Promise<string> => {
          expect(dependency).to.equal('kind');
          return 'kind';
        },
      };
      baseCommandInternal.kindBuilder = {
        executable: (executable: string): {build: () => Promise<KindClient>} => {
          expect(executable).to.equal('kind');
          return {build: async (): Promise<KindClient> => kindClient};
        },
      };
    });

    it('should load a local image only into the caller-supplied Kind context', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first');

      expect(loadDockerImageStub).to.have.been.calledOnce;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(warnStub).to.not.have.been.called;
    });

    it('should preload additional Kind contexts and deduplicate the caller-supplied context', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', [
        'kind-first',
        'kind-second',
      ]);

      expect(loadDockerImageStub).to.have.been.calledTwice;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(loadDockerImageStub).to.have.been.calledWith(
        'block-node-server:0.38.0',
        sinon.match.has('name', 'second'),
      );
      expect(warnStub).to.not.have.been.called;
    });

    it('should warn and continue when preloading into a stale additional Kind context fails', async (): Promise<void> => {
      loadDockerImageStub
        .withArgs('block-node-server:0.38.0', sinon.match.has('name', 'stale'))
        .rejects(new Error('failed to list nodes for cluster "stale"'));

      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', [
        'kind-stale',
        'kind-second',
      ]);

      expect(loadDockerImageStub).to.have.been.calledThrice;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(loadDockerImageStub).to.have.been.calledWith(
        'block-node-server:0.38.0',
        sinon.match.has('name', 'second'),
      );
      expect(warnStub).to.have.been.calledOnce;
      expect(warnStub.firstCall.args[0]).to.include('kind-stale');
    });

    it('should skip non-Kind additional contexts with a warning', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', ['remote-cluster']);

      expect(loadDockerImageStub).to.have.been.calledOnce;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(warnStub).to.have.been.calledOnce;
      expect(warnStub.firstCall.args[0]).to.include('remote-cluster');
    });

    it('should fail when loading into the caller-supplied Kind context fails', async (): Promise<void> => {
      loadDockerImageStub
        .withArgs('block-node-server:0.38.0', sinon.match.has('name', 'first'))
        .rejects(new Error('failed to list nodes for cluster "first"'));

      await expect(
        baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', ['kind-second']),
      ).to.be.rejectedWith('failed to list nodes for cluster "first"');

      expect(loadDockerImageStub).to.have.been.calledOnce;
    });

    it('should explain how to make an image available to a non-Kind target context', async (): Promise<void> => {
      await expect(
        baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'remote-cluster'),
      ).to.be.rejectedWith(
        "Component image source 'block-node-server:0.38.0' from --component-image requires Kind image loading, but target " +
          "cluster context(s) 'remote-cluster' are not Kind clusters. Push the image to a registry reachable from every target cluster",
      );

      expect(loadDockerImageStub).to.not.have.been.called;
    });

    it('should load a local image through a Kind context renamed without the kind- prefix', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'renamed-first');

      expect(loadDockerImageStub).to.have.been.calledOnce;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(warnStub).to.not.have.been.called;
    });

    it('should preload an additional Kind context renamed without the kind- prefix', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', ['renamed-second']);

      expect(loadDockerImageStub).to.have.been.calledTwice;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(loadDockerImageStub).to.have.been.calledWith(
        'block-node-server:0.38.0',
        sinon.match.has('name', 'second'),
      );
      expect(warnStub).to.not.have.been.called;
    });

    it('should load once when an additional context resolves to the same Kind cluster', async (): Promise<void> => {
      await baseCommandInternal.kindLoadComponentImage('block-node-server:0.38.0', 'kind-first', ['renamed-first']);

      expect(loadDockerImageStub).to.have.been.calledOnce;
      expect(loadDockerImageStub).to.have.been.calledWith('block-node-server:0.38.0', sinon.match.has('name', 'first'));
      expect(warnStub).to.not.have.been.called;
    });
  });

  describe('kindLoadComponentImageArchive', (): void => {
    it('should load an image archive into every Kind target context', async (): Promise<void> => {
      const baseCommandInternal: BaseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-component-image-archive-test-'));
      const componentImageArchive: string = PathEx.join(temporaryDirectory, 'block-node-server.tar');
      fs.writeFileSync(componentImageArchive, 'image archive');

      try {
        const loadImageArchiveStub: SinonStub = sinon.stub().resolves();
        const kindClient: KindClient = {loadImageArchive: loadImageArchiveStub} as unknown as KindClient;

        baseCommandInternal.remoteConfig = {
          getContexts: (): Context[] => ['kind-first', 'kind-second'],
        };
        baseCommandInternal.depManager = {
          getExecutable: async (): Promise<string> => 'kind',
        };
        baseCommandInternal.kindBuilder = {
          executable: (): {build: () => Promise<KindClient>} => ({
            build: async (): Promise<KindClient> => kindClient,
          }),
        };

        await baseCommandInternal.kindLoadComponentImageArchive(componentImageArchive, 'kind-first');

        expect(loadImageArchiveStub).to.have.been.calledTwice;
        expect(loadImageArchiveStub).to.have.been.calledWith(componentImageArchive, sinon.match.has('name', 'first'));
        expect(loadImageArchiveStub).to.have.been.calledWith(componentImageArchive, sinon.match.has('name', 'second'));
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('should load an image archive once through a renamed context that resolves to an already-covered Kind cluster', async (): Promise<void> => {
      const baseCommandInternal: BaseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-component-image-archive-test-'));
      const componentImageArchive: string = PathEx.join(temporaryDirectory, 'block-node-server.tar');
      fs.writeFileSync(componentImageArchive, 'image archive');

      try {
        const loadImageArchiveStub: SinonStub = sinon.stub().resolves();
        const kindClient: KindClient = {loadImageArchive: loadImageArchiveStub} as unknown as KindClient;

        baseCommandInternal.k8Factory = stubK8FactoryWithClusterEntries({
          'kind-first': 'kind-first',
          'kind-second': 'kind-second',
          'renamed-first': 'kind-first',
        });
        baseCommandInternal.remoteConfig = {
          getContexts: (): Context[] => ['renamed-first', 'kind-second'],
        };
        baseCommandInternal.depManager = {
          getExecutable: async (): Promise<string> => 'kind',
        };
        baseCommandInternal.kindBuilder = {
          executable: (): {build: () => Promise<KindClient>} => ({
            build: async (): Promise<KindClient> => kindClient,
          }),
        };

        await baseCommandInternal.kindLoadComponentImageArchive(componentImageArchive, 'kind-first');

        expect(loadImageArchiveStub).to.have.been.calledTwice;
        expect(loadImageArchiveStub).to.have.been.calledWith(componentImageArchive, sinon.match.has('name', 'first'));
        expect(loadImageArchiveStub).to.have.been.calledWith(componentImageArchive, sinon.match.has('name', 'second'));
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('should reject an image archive when the selected target context is not a Kind cluster', async (): Promise<void> => {
      const baseCommandInternal: BaseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      baseCommandInternal.remoteConfig = {
        getContexts: (): Context[] => ['kind-first'],
      };

      await expect(
        baseCommandInternal.kindLoadComponentImageArchive('/tmp/block-node-server.tar', 'remote-cluster'),
      ).to.be.rejectedWith(
        "Component image source '/tmp/block-node-server.tar' from --component-image-archive requires Kind image loading",
      );
    });

    it('should require an image reference with an image archive', async (): Promise<void> => {
      const baseCommandInternal: BaseCommandInternal = baseCmd as unknown as BaseCommandInternal;

      await expect(
        baseCommandInternal.loadComponentImage(undefined, '/tmp/block-node-server.tar', 'kind-first'),
      ).to.be.rejectedWith(
        '--component-image-archive requires --component-image to identify the image in the archive.',
      );
    });

    it('should reject a missing image archive path', async (): Promise<void> => {
      const baseCommandInternal: BaseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      const missingArchivePath: string = PathEx.join(os.tmpdir(), 'missing-block-node-server.tar');

      await expect(
        baseCommandInternal.loadComponentImage('block-node-server:0.38.0', missingArchivePath, 'kind-first'),
      ).to.be.rejectedWith(`File does not exist: ${missingArchivePath}`);
    });
  });

  describe('kindClusterNameFromContext', (): void => {
    let baseCommandInternal: BaseCommandInternal;

    before((): void => {
      resetForTest();
      // @ts-expect-error - allow to create instance of abstract class
      baseCmd = new BaseCommand();
      baseCommandInternal = baseCmd as unknown as BaseCommandInternal;
      baseCommandInternal.k8Factory = stubK8FactoryWithClusterEntries({
        'renamed-context': 'kind-solo-cluster',
        'my-cluster': 'my-cluster-entry',
      });
    });

    it('should strip kind- prefix from context', (): void => {
      expect(baseCommandInternal.kindClusterNameFromContext('kind-solo-cluster')).to.equal('solo-cluster');
    });

    it('should resolve a renamed context through its kubeconfig cluster entry', (): void => {
      expect(baseCommandInternal.kindClusterNameFromContext('renamed-context')).to.equal('solo-cluster');
    });

    it('should return undefined when neither context nor cluster entry is Kind-named', (): void => {
      expect(baseCommandInternal.kindClusterNameFromContext('my-cluster')).to.be.undefined;
    });
  });

  describe('dockerDesktopPreflightTask', (): void => {
    let command: TestBaseCommand;
    let temporaryDirectory: string;
    let warnStub: SinonStub;

    beforeEach((): void => {
      resetForTest();
      sandbox = sinon.createSandbox();
      temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-docker-desktop-test-'));
      command = new TestBaseCommand();
      warnStub = sandbox.stub();
      command.logger = {warn: warnStub} as unknown as SoloLogger;
    });

    afterEach((): void => {
      sandbox.restore();
      if (fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true});
      }
    });

    it('does not warn when running on Linux', async (): Promise<void> => {
      sandbox.stub(OperatingSystem, 'isLinux').returns(true);

      await command.runDockerDesktopPreflightTask();

      expect(warnStub).to.not.have.been.called;
    });

    it('does not warn when no Docker Desktop settings file exists', async (): Promise<void> => {
      sandbox.stub(OperatingSystem, 'isLinux').returns(false);
      sandbox.stub(os, 'homedir').returns(PathEx.join(temporaryDirectory, 'nonexistent'));

      await command.runDockerDesktopPreflightTask();

      expect(warnStub).to.not.have.been.called;
    });

    it('does not warn when useContainerdSnapshotter is false', async (): Promise<void> => {
      sandbox.stub(OperatingSystem, 'isLinux').returns(false);
      const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
      fs.mkdirSync(dockerDirectory, {recursive: true});
      fs.writeFileSync(
        PathEx.join(dockerDirectory, 'settings-store.json'),
        JSON.stringify({useContainerdSnapshotter: false}),
      );
      sandbox.stub(os, 'homedir').returns(temporaryDirectory);

      await command.runDockerDesktopPreflightTask();

      expect(warnStub).to.not.have.been.called;
    });

    it('warns when useContainerdSnapshotter is true', async (): Promise<void> => {
      sandbox.stub(OperatingSystem, 'isLinux').returns(false);
      const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
      fs.mkdirSync(dockerDirectory, {recursive: true});
      fs.writeFileSync(
        PathEx.join(dockerDirectory, 'settings-store.json'),
        JSON.stringify({useContainerdSnapshotter: true}),
      );
      sandbox.stub(os, 'homedir').returns(temporaryDirectory);

      await command.runDockerDesktopPreflightTask();

      expect(warnStub).to.have.been.calledOnce;
      expect(warnStub.firstCall.args[0]).to.include('Docker Desktop');
      expect(warnStub.firstCall.args[0]).to.include('containerd');
    });

    it('skips invalid JSON and continues checking settings files', async (): Promise<void> => {
      sandbox.stub(OperatingSystem, 'isLinux').returns(false);
      const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
      fs.mkdirSync(dockerDirectory, {recursive: true});
      fs.writeFileSync(PathEx.join(dockerDirectory, 'settings-store.json'), '{not valid json}');
      fs.writeFileSync(
        PathEx.join(dockerDirectory, 'settings.json'),
        JSON.stringify({useContainerdSnapshotter: false}),
      );
      sandbox.stub(os, 'homedir').returns(temporaryDirectory);

      await command.runDockerDesktopPreflightTask();

      expect(warnStub).to.not.have.been.called;
    });
  });
});
