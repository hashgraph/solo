// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {ImageCacheHandler} from '../../../../src/integration/cache/impl/image-cache-handler.js';
import {CacheManifestClient} from '../../../../src/integration/cache/impl/cache-manifest-client.js';
import {CacheManifestImage} from '../../../../src/integration/cache/models/impl/cache-manifest-image.js';
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
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {ErrorCodeRegistry} from '../../../../src/core/errors/error-code-registry.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

const IMAGE_REFERENCE: string = 'docker.io/library/busybox:1.36.1';
const TAR_FILE: string = 'docker.io__library__busybox__1.36.1.tar';
const ARCHIVE_CONTENTS: string = 'a pretend image archive';
const ARCHIVE_HASH: string = createHash('sha256').update(ARCHIVE_CONTENTS).digest('hex');

const target: {type: CacheArtifactEnum; name: string; version: string; source: string | undefined} = {
  type: CacheArtifactEnum.IMAGE,
  name: 'docker.io/library/busybox',
  version: '1.36.1',
  source: undefined,
};

function manifestImage(sha256: string = ARCHIVE_HASH): CacheManifestImage {
  return new CacheManifestImage(
    IMAGE_REFERENCE,
    TAR_FILE,
    `${TAR_FILE}.sha256`,
    sha256,
    `https://cdn.solo.hashgraph.io/${TAR_FILE}`,
    `https://cdn.solo.hashgraph.io/${TAR_FILE}.sha256`,
  );
}

async function exists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then((): boolean => true)
    .catch((): boolean => false);
}

/** Replaces the default no-manifest stub with one that resolves the given entries. */
function stubManifest(...images: CacheManifestImage[]): void {
  (CacheManifestClient.fetchImages as SinonStub).resolves(images);
}

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

describe('ImageCacheHandler load', (): void => {
  const inspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => true,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  let temporaryDirectory: string;
  let archivePath: string;
  let store: CacheCatalogStore;
  let loggerStub: sinon.SinonStubbedInstance<SoloPinoLogger>;
  let logger: SoloLogger;

  beforeEach(async (): Promise<void> => {
    temporaryDirectory = await fs.mkdtemp(PathEx.join(os.tmpdir(), 'solo-image-cache-load-'));
    archivePath = PathEx.join(temporaryDirectory, TAR_FILE);

    store = {
      save: async (): Promise<void> => undefined,
      load: async (): Promise<never> => ({items: []}) as never,
      exists: async (): Promise<boolean> => true,
      clear: async (): Promise<void> => undefined,
      resolvePath: (): string => archivePath,
    };

    loggerStub = sinon.createStubInstance(SoloPinoLogger);
    loggerStub.getMessageGroupKeys.returns([]);
    logger = loggerStub as unknown as SoloLogger;

    // Default for the existing cases: no manifest is reachable, which is the state of every Solo release
    // until the manifest publishing workflow lands.
    sinon.stub(CacheManifestClient, 'fetchImages').rejects(new Error('manifest not published'));
  });

  afterEach(async (): Promise<void> => {
    sinon.restore();
    await fs.rm(temporaryDirectory, {recursive: true, force: true});
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

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly(archivePath, 'my-cluster');
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

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly(archivePath, 'my-cluster');
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

  it('loads an archive whose hash still matches the manifest', async (): Promise<void> => {
    await fs.writeFile(archivePath, ARCHIVE_CONTENTS);
    stubManifest(manifestImage());

    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({loadImageArchiveIntoCluster: loadArchiveStub}),
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly(archivePath, 'my-cluster');
  });

  it('aborts the load and deletes the archive when its hash no longer matches the manifest', async (): Promise<void> => {
    await fs.writeFile(archivePath, 'corrupted after it was downloaded');
    await fs.writeFile(`${archivePath}.sha256`, ARCHIVE_HASH);
    stubManifest(manifestImage());

    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({loadImageArchiveIntoCluster: loadArchiveStub}),
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    let thrown: unknown;
    try {
      await runReturnedLoadTasks(handler, 'my-cluster');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(SoloError);
    expect((thrown as SoloError).message).to.contain(archivePath);
    expect((thrown as SoloError).message).to.contain(IMAGE_REFERENCE);
    expect((thrown as SoloError).getFormattedCode()).to.equal(ErrorCodeRegistry.CACHE_ARCHIVE_HASH_MISMATCH);
    expect(loadArchiveStub).to.not.have.been.called;

    // Discarded so the next `solo cache image pull` downloads it again.
    expect(await exists(archivePath)).to.equal(false);
    expect(await exists(`${archivePath}.sha256`)).to.equal(false);
  });

  it('loads the archive when the manifest does not list the image', async (): Promise<void> => {
    await fs.writeFile(archivePath, ARCHIVE_CONTENTS);
    stubManifest();

    const loadArchiveStub: SinonStub = sinon.stub().resolves();
    const handler: ImageCacheHandler = new ImageCacheHandler(
      createEngine({loadImageArchiveIntoCluster: loadArchiveStub}),
      new StaticCacheTargetProvider([target]),
      store,
      inspector,
      logger,
    );

    await runReturnedLoadTasks(handler, 'my-cluster');

    expect(loadArchiveStub).to.have.been.calledOnceWithExactly(archivePath, 'my-cluster');
  });
});
