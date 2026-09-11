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

// Runs the per-image load subtasks the way the command's Listr does.
async function runReturnedLoadTasks(handler: ImageCacheHandler, clusterName: string): Promise<void> {
  const tasks: readonly SoloListrTask<AnyListrContext>[] = await handler.load(clusterName);
  for (const subtask of tasks) {
    await subtask.task({} as never, {title: subtask.title} as never);
  }
}

function createEngine(overrides: Partial<ContainerEngineClient> = {}): ContainerEngineClient {
  return {
    loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
    removeImage: async (): Promise<void> => undefined,
    listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
    resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
    ...overrides,
  };
}

describe('ImageCacheHandler pull', (): void => {
  const inspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => false,
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

  // Registry pulls were removed; until the CDN download lands, pull must add nothing to the cache and
  // must report that plainly rather than failing the run.
  it('caches nothing and records why', async (): Promise<void> => {
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine(),
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    expect(subtasks).to.have.lengthOf(1);

    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(context.config.results).to.have.lengthOf(0);
    expect(loggerStub.addMessageGroupMessage).to.have.been.called;
  });
});

describe('ImageCacheHandler load', (): void => {
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
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({loadImageArchiveIntoCluster: loadArchiveStub}),
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
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({
        loadImageArchiveIntoCluster: loadArchiveStub,
        listLoadedImagesInCluster: async (): Promise<readonly string[]> => ['docker.io/library/busybox:1.36.1'],
      }),
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
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({
        loadImageArchiveIntoCluster: loadArchiveStub,
        listLoadedImagesInCluster: async (): Promise<readonly string[]> => {
          throw new Error('cluster unreachable');
        },
      }),
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly('/tmp/busybox.tar', 'my-cluster');
  });

  it('records a failure and never throws when a load fails', async (): Promise<void> => {
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({loadImageArchiveIntoCluster: sinon.stub().rejects(new Error('unrecognized image format'))}),
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
