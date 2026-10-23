// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {type ClientRequest, type IncomingMessage} from 'node:http';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {VersionUpdateNotifier} from '../../../src/core/version-update-notifier.js';
import {PACKAGE_NAME} from '../../../src/core/constants.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

/** A version guaranteed to be newer than any real Solo version, so the banner should always fire. */
const NEWER_VERSION: string = '999.999.999';

/** A version guaranteed to be older than any real Solo version, so the banner should never fire. */
const OLDER_VERSION: string = '0.0.1';

const ONE_DAY_MILLISECONDS: number = 24 * 60 * 60 * 1000;
const STALE_AGE_MILLISECONDS: number = ONE_DAY_MILLISECONDS + 60 * 60 * 1000;

/** Minimal logger surface exercised by the notifier. */
interface FakeLogger {
  showUser: SinonStub;
  debug: SinonStub;
}

describe('VersionUpdateNotifier', (): void => {
  const originalReadFileSync: typeof fs.readFileSync = fs.readFileSync.bind(fs);

  let httpsGetStub: SinonStub;
  let writeFileSyncStub: SinonStub;
  let logger: FakeLogger;
  let originalIsTty: boolean;

  /** Content returned for a cache read; `undefined` simulates a missing cache file. */
  let cacheContent: string | undefined;

  beforeEach((): void => {
    originalIsTty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    cacheContent = undefined;

    httpsGetStub = sinon.stub(https, 'get');
    writeFileSyncStub = sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'mkdirSync');

    // Route cache reads to the test-controlled content while letting getSoloVersion() read the real package.json.
    sinon
      .stub(fs, 'readFileSync')
      .callsFake((path: fs.PathOrFileDescriptor, options?: BufferEncoding | object): string => {
        const pathString: string = String(path);
        if (pathString.includes('update-check.json')) {
          if (cacheContent === undefined) {
            throw new Error('ENOENT: no such file or directory');
          }
          return cacheContent;
        }
        return originalReadFileSync(path, options) as string;
      });

    logger = {showUser: sinon.stub(), debug: sinon.stub()};
  });

  afterEach((): void => {
    process.stdout.isTTY = originalIsTty;
    sinon.restore();
  });

  /** Seeds the controlled cache file with the given version and age. */
  function seedCache(latestVersion: string, ageMilliseconds: number): void {
    cacheContent = JSON.stringify({
      lastCheckEpochMilliseconds: Date.now() - ageMilliseconds,
      latestVersion,
    });
  }

  /** A stand-in for the ClientRequest https.get returns; the notifier only listens and destroys. */
  type FakeRequest = EventEmitter & {destroy: () => void};

  /** A stand-in for the IncomingMessage the notifier reads the registry payload from. */
  type FakeResponse = EventEmitter & {statusCode: number; setEncoding: () => void; resume: () => void};

  /** Builds the fake ClientRequest https.get hands back. */
  function createFakeRequest(): FakeRequest {
    // eslint-disable-next-line unicorn/prefer-event-target
    return Object.assign(new EventEmitter(), {destroy: (): void => {}});
  }

  /** Stubs the registry call to answer with the given status code and raw body. */
  function stubRegistryResponse(statusCode: number, body: string): void {
    httpsGetStub.callsFake(
      (_url: string, _options: object, callback: (response: IncomingMessage) => void): ClientRequest => {
        const request: FakeRequest = createFakeRequest();
        // eslint-disable-next-line unicorn/prefer-event-target
        const response: FakeResponse = Object.assign(new EventEmitter(), {
          statusCode,
          setEncoding: (): void => {},
          resume: (): void => {},
        });

        setImmediate((): void => {
          callback(response as unknown as IncomingMessage);
          if (statusCode === 200) {
            response.emit('data', body);
            response.emit('end');
          }
        });

        return request as unknown as ClientRequest;
      },
    );
  }

  /** Stubs a successful registry response returning the given version. */
  function stubRegistryVersion(version: string): void {
    stubRegistryResponse(200, JSON.stringify({version}));
  }

  /** Stubs the registry call to fail at the transport level, as when offline. */
  function stubRegistryError(): void {
    httpsGetStub.callsFake((): ClientRequest => {
      const request: FakeRequest = createFakeRequest();
      setImmediate((): void => {
        request.emit('error', new Error('network failure'));
      });
      return request as unknown as ClientRequest;
    });
  }

  /** Concatenates every argument passed to logger.showUser into a single searchable string. */
  function bannerText(): string {
    return logger.showUser
      .getCalls()
      .map((call): string => call.args.join(' '))
      .join('\n');
  }

  async function notify(): Promise<void> {
    await VersionUpdateNotifier.notifyIfUpdateAvailable(logger as unknown as SoloLogger);
  }

  it('does nothing when the session is not a TTY', async (): Promise<void> => {
    process.stdout.isTTY = false;

    await notify();

    expect(httpsGetStub).to.not.have.been.called;
    expect(logger.showUser).to.not.have.been.called;
  });

  it('shows the banner from a fresh cache without hitting the network', async (): Promise<void> => {
    seedCache(NEWER_VERSION, 0);

    await notify();

    expect(httpsGetStub).to.not.have.been.called;
    expect(logger.showUser).to.have.been.called;
    expect(bannerText()).to.include(NEWER_VERSION);
  });

  it('includes the upgrade guide and release notes links in the banner', async (): Promise<void> => {
    seedCache(NEWER_VERSION, 0);

    await notify();

    const output: string = bannerText();
    expect(output).to.include('https://solo.hiero.org/docs/simple-solo-setup/upgrading-solo/');
    expect(output).to.include('https://github.com/hiero-ledger/solo/releases');
  });

  it('does not show the banner when the cached version is not newer', async (): Promise<void> => {
    seedCache(OLDER_VERSION, 0);

    await notify();

    expect(httpsGetStub).to.not.have.been.called;
    expect(logger.showUser).to.not.have.been.called;
  });

  it('fetches from the registry, persists the cache, and shows the banner when a cache is absent', async (): Promise<void> => {
    stubRegistryVersion(NEWER_VERSION);

    await notify();

    expect(httpsGetStub).to.have.been.calledOnce;
    const requestedUrl: string = httpsGetStub.firstCall.args[0] as string;
    expect(requestedUrl).to.include('registry.npmjs.org');
    expect(requestedUrl).to.include(PACKAGE_NAME);

    expect(writeFileSyncStub).to.have.been.called;
    const persisted: string = writeFileSyncStub.firstCall.args[1] as string;
    expect(persisted).to.include(NEWER_VERSION);

    expect(bannerText()).to.include(NEWER_VERSION);
  });

  it('refreshes from the registry when the cache is stale', async (): Promise<void> => {
    seedCache(OLDER_VERSION, STALE_AGE_MILLISECONDS);
    stubRegistryVersion(NEWER_VERSION);

    await notify();

    expect(httpsGetStub).to.have.been.calledOnce;
    expect(bannerText()).to.include(NEWER_VERSION);
  });

  it('falls back to a stale cached version when the network is unavailable', async (): Promise<void> => {
    seedCache(NEWER_VERSION, STALE_AGE_MILLISECONDS);
    stubRegistryError();

    await notify();

    expect(httpsGetStub).to.have.been.calledOnce;
    expect(logger.showUser).to.have.been.called;
    expect(bannerText()).to.include(NEWER_VERSION);
  });

  it('stays silent when the network fails and there is no cache', async (): Promise<void> => {
    stubRegistryError();

    await notify();

    expect(logger.showUser).to.not.have.been.called;
    expect(writeFileSyncStub).to.not.have.been.called;
  });

  it('stays silent when the registry responds with a non-OK status', async (): Promise<void> => {
    stubRegistryResponse(500, '');

    await notify();

    expect(logger.showUser).to.not.have.been.called;
  });

  it('never rejects even when the registry returns malformed data', async (): Promise<void> => {
    stubRegistryResponse(200, 'not json at all');

    await notify();

    expect(logger.showUser).to.not.have.been.called;
  });

  it('requests its own socket so no pooled connection outlives the command', async (): Promise<void> => {
    stubRegistryVersion(NEWER_VERSION);

    await notify();

    // A pooled connection is torn down on the libuv thread pool after the response, which aborts the
    // process on Windows when the CLI calls process.exit() moments later while flushing logs.
    const requestOptions: {agent?: false} = httpsGetStub.firstCall.args[1] as {agent?: false};
    expect(requestOptions.agent).to.equal(false);
  });
});
