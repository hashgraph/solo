// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ImageCacheHandler} from '../../../../src/integration/cache/impl/image-cache-handler.js';
import {StaticCacheTargetProvider} from '../../../../src/integration/cache/target-providers/static-cache-target-provider.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {type CacheCatalogStore} from '../../../../src/integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../../../../src/integration/cache/api/cache-health-inspector.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {type ContainerEngineClient} from '../../../../src/integration/container-engine/container-engine-client.js';
import {ClusterNodeResumeOutcome} from '../../../../src/integration/container-engine/cluster-node-resume-outcome.js';
import {type SoloListrTask} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

// Runs the per-image load subtasks the way the command's Listr does.
async function runReturnedLoadTasks(handler: ImageCacheHandler, clusterName: string): Promise<void> {
  const tasks: readonly SoloListrTask<AnyListrContext>[] = await handler.load(clusterName);
  for (const subtask of tasks) {
    await subtask.task({} as never, {title: subtask.title} as never);
  }
}

describe('ImageCacheHandler pull', (): void => {
  const mirrorRegistryEnvironmentVariable: string = 'KIND_DOCKER_REGISTRY_MIRRORS';
  const defaultMirrorRegistry: string = 'mirror.gcr.io';
  const configuredMirrorRegistry: string = 'custom.registry.example.com';
  let previousMirrorRegistry: string | undefined;

  const target: {
    type: CacheArtifactEnum;
    name: string;
    version: string;
    source: string | undefined;
  } = {
    type: CacheArtifactEnum.IMAGE,
    name: 'docker.io/library/busybox',
    version: '1.36.1',
    source: undefined,
  };

  const store: CacheCatalogStore = {
    save: async (): Promise<void> => undefined,
    load: async (): Promise<never> => ({items: []}) as never,
    exists: async (): Promise<boolean> => true,
    clear: async (): Promise<void> => undefined,
    resolvePath: (): string => '/tmp/busybox.tar',
  };

  const inspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => false,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  const logger: SoloLogger = {
    setDevMode: (): void => undefined,
    isDevMode: (): boolean => false,
    nextTraceId: (): void => undefined,
    setLogBinding: (): void => undefined,
    addLogBindings: (): void => undefined,
    clearLogBindings: (): void => undefined,
    prepMeta: (meta?: object): object => meta ?? {},
    showUser: (): void => undefined,
    showUserUnlessOneShot: (): void => undefined,
    beginDeferredUserOutput: (): void => undefined,
    flushDeferredUserOutput: (): void => undefined,
    showUserError: (): void => undefined,
    error: (): void => undefined,
    warn: (): void => undefined,
    info: (): void => undefined,
    debug: (): void => undefined,
    showList: (): void => undefined,
    showListIfNotEmpty: (): void => undefined,
    showJSON: (): void => undefined,
    addMessageGroup: (): void => undefined,
    getMessageGroup: (): string[] => [],
    addMessageGroupMessage: (): void => undefined,
    showMessageGroup: (): void => undefined,
    getMessageGroupKeys: (): string[] => [],
    showAllMessageGroups: (): void => undefined,
    flush: (callback: (error?: Error) => void): void => callback(),
  };

  beforeEach((): void => {
    previousMirrorRegistry = process.env[mirrorRegistryEnvironmentVariable];
    process.env[mirrorRegistryEnvironmentVariable] = configuredMirrorRegistry;
  });

  afterEach((): void => {
    if (previousMirrorRegistry === undefined) {
      delete process.env[mirrorRegistryEnvironmentVariable];
    } else {
      process.env[mirrorRegistryEnvironmentVariable] = previousMirrorRegistry;
    }
  });

  it('should fail when saveImage fails due to rate limiting', async (): Promise<void> => {
    const rateLimitCause: Error = new Error('TOOMANYREQUESTS: You have reached your unauthenticated pull rate limit.');
    const rateLimitError: Error = new Error('crane pull failed', {cause: rateLimitCause});
    const saveImageStub: SinonStub = sinon.stub().rejects(rateLimitError);
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: saveImageStub,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await expect(subtasks[0].task(context as never, {title: 'task'} as never)).to.be.rejectedWith('crane pull failed');

    expect(saveImageStub).to.have.been.calledThrice;
    expect(saveImageStub.firstCall.args[0]).to.equal(`${configuredMirrorRegistry}/library/busybox:1.36.1`);
    expect(saveImageStub.secondCall.args[0]).to.equal('docker.io/library/busybox:1.36.1');
    expect(saveImageStub.thirdCall.args[0]).to.equal('registry-1.docker.io/library/busybox:1.36.1');
    expect(context.config.results).to.have.lengthOf(0);
  });

  it('should continue without registering cached result when saveImage fails without rate limiting', async (): Promise<void> => {
    const saveImageStub: SinonStub = sinon.stub().rejects(new Error('temporary network failure'));
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: saveImageStub,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(saveImageStub).to.have.been.calledThrice;
    expect(context.config.results).to.have.lengthOf(0);
  });

  it('should use the first kind-config mirror by default when no mirror override is set', async (): Promise<void> => {
    delete process.env[mirrorRegistryEnvironmentVariable];

    const saveImageStub: SinonStub = sinon.stub().resolves();
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: saveImageStub,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(saveImageStub).to.have.been.calledOnceWithExactly(
      `${defaultMirrorRegistry}/library/busybox:1.36.1`,
      '/tmp/busybox.tar',
    );
    expect(context.config.results).to.have.lengthOf(1);
  });

  it('should register cached result when saveImage succeeds', async (): Promise<void> => {
    const saveImageStub: SinonStub = sinon.stub().resolves();
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: saveImageStub,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(saveImageStub).to.have.been.calledOnceWithExactly(
      `${configuredMirrorRegistry}/library/busybox:1.36.1`,
      '/tmp/busybox.tar',
    );
    expect(context.config.results).to.have.lengthOf(1);
  });
});

describe('ImageCacheHandler load', (): void => {
  const target: {type: CacheArtifactEnum; name: string; version: string; source: string | undefined} = {
    type: CacheArtifactEnum.IMAGE,
    name: 'docker.io/library/busybox',
    version: '1.36.1',
    source: undefined,
  };

  const store: CacheCatalogStore = {
    save: async (): Promise<void> => undefined,
    load: async (): Promise<never> => ({items: []}) as never,
    exists: async (): Promise<boolean> => true,
    clear: async (): Promise<void> => undefined,
    resolvePath: (): string => '/tmp/busybox.tar',
  };

  const inspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => true,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  let loggerStub: sinon.SinonStubbedInstance<SoloPinoLogger>;
  let logger: SoloLogger;

  beforeEach((): void => {
    loggerStub = sinon.createStubInstance(SoloPinoLogger);
    loggerStub.getMessageGroupKeys.returns([]);
    logger = loggerStub as unknown as SoloLogger;
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('loads each cached archive into the cluster', async (): Promise<void> => {
    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: async (): Promise<void> => undefined,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: loadArchiveStub,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const handler: ImageCacheHandler = new ImageCacheHandler(
      engine,
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly('/tmp/busybox.tar', 'my-cluster');
  });

  it('skips loading an archive already present in the cluster', async (): Promise<void> => {
    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: async (): Promise<void> => undefined,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: loadArchiveStub,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => ['docker.io/library/busybox:1.36.1'],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const handler: ImageCacheHandler = new ImageCacheHandler(
      engine,
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.not.have.been.called;
  });

  it('loads the archive when listing the cluster images fails', async (): Promise<void> => {
    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: async (): Promise<void> => undefined,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: loadArchiveStub,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => {
        throw new Error('cluster unreachable');
      },
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const handler: ImageCacheHandler = new ImageCacheHandler(
      engine,
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly('/tmp/busybox.tar', 'my-cluster');
  });

  it('records a failure and never throws when a load fails', async (): Promise<void> => {
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      saveImageArchive: async (): Promise<void> => undefined,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: sinon.stub().rejects(new Error('unrecognized image format')),
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
      resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    };

    const handler: ImageCacheHandler = new ImageCacheHandler(
      engine,
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    // The failure is recorded for the end-of-run summary rather than thrown.
    expect(loggerStub.addMessageGroupMessage).to.have.been.called;
  });
});
