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
import {type PackageDownloader} from '../../../../src/core/package-downloader.js';
import {type SoloListrTask} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';
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

const engine: ContainerEngineClient = {
  loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
  removeImage: async (): Promise<void> => undefined,
  listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
  resumeStoppedClusterNode: async (): Promise<ClusterNodeResumeOutcome> => ClusterNodeResumeOutcome.UNCHANGED,
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

async function runPull(handler: ImageCacheHandler): Promise<{config: {results: unknown[]}}> {
  const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
  const context: {config: {results: unknown[]}} = {config: {results: []}};

  for (const subtask of subtasks) {
    await subtask.task(context as never, {title: subtask.title} as never);
  }

  return context;
}

async function exists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then((): boolean => true)
    .catch((): boolean => false);
}

describe('ImageCacheHandler pull', (): void => {
  let temporaryDirectory: string;
  let archivePath: string;
  let hashPath: string;
  let loggerStub: sinon.SinonStubbedInstance<SoloPinoLogger>;
  let logger: SoloLogger;
  let store: CacheCatalogStore;
  let inspector: CacheHealthInspector;

  beforeEach(async (): Promise<void> => {
    temporaryDirectory = await fs.mkdtemp(PathEx.join(os.tmpdir(), 'solo-image-cache-'));
    archivePath = PathEx.join(temporaryDirectory, TAR_FILE);
    hashPath = `${archivePath}.sha256`;

    loggerStub = sinon.createStubInstance(SoloPinoLogger);
    loggerStub.getMessageGroupKeys.returns([]);
    logger = loggerStub as unknown as SoloLogger;

    store = {
      save: async (): Promise<void> => undefined,
      load: async (): Promise<never> => ({items: []}) as never,
      exists: async (): Promise<boolean> => true,
      clear: async (): Promise<void> => undefined,
      resolvePath: (): string => archivePath,
    };

    inspector = {
      exists: async (path: string): Promise<boolean> =>
        fs
          .access(path)
          .then((): boolean => true)
          .catch((): boolean => false),
      getSize: async (): Promise<number> => 0,
      filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
    };
  });

  afterEach(async (): Promise<void> => {
    sinon.restore();
    await fs.rm(temporaryDirectory, {recursive: true, force: true});
  });

  /** Writes whatever the fake CDN serves for each URL when fetchFile is called. */
  function stubDownloader(files: Record<string, string>): SinonStub {
    const fetchFile: SinonStub = sinon.stub();
    fetchFile.callsFake(async (url: string, destinationPath: string): Promise<string> => {
      if (!(url in files)) {
        throw new Error(`404 for ${url}`);
      }
      await fs.writeFile(destinationPath, files[url]);
      return destinationPath;
    });

    return fetchFile;
  }

  function createHandler(fetchFile: SinonStub): ImageCacheHandler {
    return new ImageCacheHandler(engine, new StaticCacheTargetProvider([target]), store, inspector, logger, {
      fetchFile,
    } as unknown as PackageDownloader);
  }

  it('downloads the archive and its hash file, then verifies both', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}`]: ARCHIVE_CONTENTS,
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}.sha256`]: `${ARCHIVE_HASH}  ${TAR_FILE}\n`,
    });

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(fetchFile).to.have.been.calledTwice;
    expect(context.config.results).to.have.lengthOf(1);
    expect(await fs.readFile(archivePath, 'utf8')).to.equal(ARCHIVE_CONTENTS);
    // The hash file is kept next to the archive so it can be re-checked without another download.
    expect(await exists(hashPath)).to.equal(true);
  });

  it('skips the download when a valid archive is already cached', async (): Promise<void> => {
    await fs.writeFile(archivePath, ARCHIVE_CONTENTS);
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({});

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(fetchFile).to.not.have.been.called;
    expect(context.config.results).to.have.lengthOf(1);
    expect(await exists(archivePath)).to.equal(true);
  });

  it('deletes a cached archive whose hash no longer matches the manifest', async (): Promise<void> => {
    await fs.writeFile(archivePath, 'corrupted on disk');
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({});

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(await exists(archivePath)).to.equal(false);
    expect(context.config.results).to.have.lengthOf(0);
    expect(loggerStub.warn).to.have.been.called;
  });

  it('deletes a downloaded archive that does not match its expected hash', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}`]: 'corrupted in transit',
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}.sha256`]: ARCHIVE_HASH,
    });

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(await exists(archivePath)).to.equal(false);
    expect(await exists(hashPath)).to.equal(false);
    expect(context.config.results).to.have.lengthOf(0);
    expect(loggerStub.warn).to.have.been.called;
  });

  it('does not download the archive when the manifest and the published hash disagree', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}`]: ARCHIVE_CONTENTS,
      [`https://cdn.solo.hashgraph.io/${TAR_FILE}.sha256`]: 'c'.repeat(64),
    });

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(fetchFile).to.have.been.calledOnce;
    expect(fetchFile.firstCall.args[0]).to.equal(`https://cdn.solo.hashgraph.io/${TAR_FILE}.sha256`);
    expect(await exists(archivePath)).to.equal(false);
    expect(await exists(hashPath)).to.equal(false);
    expect(context.config.results).to.have.lengthOf(0);
  });

  it('skips an image the manifest does not list', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([]);
    const fetchFile: SinonStub = stubDownloader({});

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(fetchFile).to.not.have.been.called;
    expect(context.config.results).to.have.lengthOf(0);
    expect(loggerStub.addMessageGroupMessage).to.have.been.called;
  });

  it('caches nothing and never throws when the manifest is unavailable', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').rejects(new Error('manifest not published'));
    const fetchFile: SinonStub = stubDownloader({});

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(fetchFile).to.not.have.been.called;
    expect(context.config.results).to.have.lengthOf(0);
    expect(loggerStub.addMessageGroupMessage).to.have.been.called;
  });

  it('records a failure and never throws when a download fails', async (): Promise<void> => {
    sinon.stub(CacheManifestClient, 'fetchImages').resolves([manifestImage()]);
    const fetchFile: SinonStub = stubDownloader({});

    const context: {config: {results: unknown[]}} = await runPull(createHandler(fetchFile));

    expect(context.config.results).to.have.lengthOf(0);
    expect(await exists(archivePath)).to.equal(false);
    expect(loggerStub.addMessageGroupMessage).to.have.been.called;
  });
});
