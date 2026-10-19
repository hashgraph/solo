// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {ImageCacheWarmUp} from '../../../src/core/image-cache-warm-up.js';
import {CacheManifestClient} from '../../../src/integration/cache/impl/cache-manifest-client.js';
import {CacheManifestImage} from '../../../src/integration/cache/models/impl/cache-manifest-image.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type GitHubRequestOptions} from '../../../src/core/git-hub-request-options.js';
import {getSoloVersion} from '../../../version.js';

const MARKER_FILE_NAME: string = 'image-cache-warm-up.json';
const COMMAND_ARGV: string[] = ['node', 'solo', 'deployment', 'config', 'list'];

/** Minimal logger surface exercised by the warm-up. */
interface FakeLogger {
  showUser: SinonStub;
  debug: SinonStub;
}

function image(name: string, size?: number): CacheManifestImage {
  return new CacheManifestImage(name, `${name}.tar`, `${name}.tar.sha256`, 'a'.repeat(64), 'tar-url', 'hash-url', size);
}

describe('ImageCacheWarmUp', (): void => {
  const originalReadFileSync: typeof fs.readFileSync = fs.readFileSync.bind(fs);

  let fetchImagesStub: SinonStub;
  let writeFileSyncStub: SinonStub;
  let pull: SinonStub;
  let confirm: SinonStub;
  let logger: FakeLogger;
  let originalStdoutIsTty: boolean;
  let originalStdinIsTty: boolean;

  /** Content returned for a marker read; `undefined` simulates a missing marker file. */
  let markerContent: string | undefined;

  function writtenOutcome(): string | undefined {
    const call: sinon.SinonSpyCall | undefined = writeFileSyncStub
      .getCalls()
      .find((candidate: sinon.SinonSpyCall): boolean => String(candidate.args[0]).includes(MARKER_FILE_NAME));
    return call ? (JSON.parse(call.args[1] as string) as {outcome: string}).outcome : undefined;
  }

  async function offer(argv: string[] = COMMAND_ARGV): Promise<void> {
    await ImageCacheWarmUp.offerIfFirstRun(argv, logger as unknown as SoloLogger, pull, confirm);
  }

  beforeEach((): void => {
    originalStdoutIsTty = process.stdout.isTTY;
    originalStdinIsTty = process.stdin.isTTY;
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    markerContent = undefined;

    fetchImagesStub = sinon.stub(CacheManifestClient, 'fetchImages').resolves([image('busybox'), image('hello')]);
    writeFileSyncStub = sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'mkdirSync');
    pull = sinon.stub().resolves();
    confirm = sinon.stub().resolves(true);
    logger = {showUser: sinon.stub(), debug: sinon.stub()};

    // Route marker reads to the test-controlled content while letting getSoloVersion() read the real package.json.
    sinon
      .stub(fs, 'readFileSync')
      .callsFake((path: fs.PathOrFileDescriptor, options?: BufferEncoding | object): string => {
        if (String(path).includes(MARKER_FILE_NAME)) {
          if (markerContent === undefined) {
            throw new Error('ENOENT: no such file or directory');
          }
          return markerContent;
        }
        return originalReadFileSync(path, options) as string;
      });
  });

  afterEach((): void => {
    process.stdout.isTTY = originalStdoutIsTty;
    process.stdin.isTTY = originalStdinIsTty;
    sinon.restore();
  });

  it('pulls when the user accepts the first-run offer', async (): Promise<void> => {
    await offer();

    expect(confirm.calledOnce).to.be.true;
    expect(confirm.firstCall.args[0]).to.contain('2 container images');
    expect(pull.calledOnce).to.be.true;
    expect(writtenOutcome()).to.equal('accepted');
  });

  it('shows the total download size when the manifest records every archive size', async (): Promise<void> => {
    fetchImagesStub.resolves([image('busybox', 1_000_000_000), image('hello', 2_500_000_000)]);

    await offer();

    expect(confirm.firstCall.args[0]).to.contain('2 container images (3.5 GB)');
  });

  it('records a decline and does not pull', async (): Promise<void> => {
    confirm.resolves(false);

    await offer();

    expect(pull.called).to.be.false;
    expect(writtenOutcome()).to.equal('declined');
    expect(logger.showUser.firstCall.args[0]).to.contain('solo cache image pull');
  });

  it('prints a notice instead of prompting in quiet mode', async (): Promise<void> => {
    await offer([...COMMAND_ARGV, '--quiet-mode']);

    expect(confirm.called).to.be.false;
    expect(pull.called).to.be.false;
    expect(logger.showUser.firstCall.args[0]).to.contain("Run 'solo cache image pull'");
    expect(writtenOutcome()).to.equal('notified');
  });

  it('prints a notice instead of prompting when the session is not a TTY', async (): Promise<void> => {
    process.stdin.isTTY = false;

    await offer();

    expect(confirm.called).to.be.false;
    expect(pull.called).to.be.false;
    expect(writtenOutcome()).to.equal('notified');
  });

  it('does nothing once an outcome is recorded', async (): Promise<void> => {
    markerContent = JSON.stringify({outcome: 'declined', soloVersion: '0.0.1'});

    await offer();

    expect(fetchImagesStub.called).to.be.false;
    expect(confirm.called).to.be.false;
    expect(writeFileSyncStub.called).to.be.false;
  });

  it('records an unavailable manifest without prompting', async (): Promise<void> => {
    fetchImagesStub.rejects(new Error('404'));

    await offer();

    expect(confirm.called).to.be.false;
    expect(logger.showUser.called).to.be.false;
    expect(writtenOutcome()).to.equal('unavailable');
  });

  it('does not re-check an unavailable manifest for the same version', async (): Promise<void> => {
    markerContent = JSON.stringify({outcome: 'unavailable', soloVersion: getSoloVersion()});

    await offer();

    expect(fetchImagesStub.called).to.be.false;
  });

  it('re-checks an unavailable manifest after an upgrade', async (): Promise<void> => {
    markerContent = JSON.stringify({outcome: 'unavailable', soloVersion: '0.0.1'});

    await offer();

    expect(fetchImagesStub.calledOnce).to.be.true;
    expect(confirm.calledOnce).to.be.true;
  });

  it('fetches the manifest with a timeout and closes the connection', async (): Promise<void> => {
    await offer();

    const options: GitHubRequestOptions = fetchImagesStub.firstCall.args[1] as GitHubRequestOptions;
    expect(options.timeout.toMillis()).to.equal(5000);
    expect(options.closeConnection).to.be.true;
  });

  it('skips cache commands', async (): Promise<void> => {
    await offer(['node', 'solo', 'cache', 'image', 'status']);

    expect(fetchImagesStub.called).to.be.false;
  });

  it('skips JSON and YAML output', async (): Promise<void> => {
    await offer([...COMMAND_ARGV, '-o', 'json']);
    await offer([...COMMAND_ARGV, '--output=yaml']);

    expect(fetchImagesStub.called).to.be.false;
  });

  it('warns and does not throw when the pull fails', async (): Promise<void> => {
    pull.rejects(new Error('network down'));

    await offer();

    expect(logger.showUser.firstCall.args[0]).to.contain('was not fully populated');
  });

  it('records a successful pull', (): void => {
    ImageCacheWarmUp.recordPulled(logger as unknown as SoloLogger);

    expect(writtenOutcome()).to.equal('pulled');
  });
});
