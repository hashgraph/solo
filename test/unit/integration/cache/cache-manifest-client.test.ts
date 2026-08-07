// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {afterEach, describe, it} from 'mocha';
import {CacheManifestClient} from '../../../../src/integration/cache/impl/cache-manifest-client.js';
import {type CacheManifestImage} from '../../../../src/integration/cache/models/impl/cache-manifest-image.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

const SOLO_VERSION: string = '0.86.0';
const HASH: string = 'a'.repeat(64);
const OTHER_HASH: string = 'b'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    soloVersion: SOLO_VERSION,
    images: [
      {
        image: 'docker.io/library/busybox:1.36.1',
        tarFile: 'docker.io__library__busybox__1.36.1.tar',
        hashFile: 'docker.io__library__busybox__1.36.1.tar.sha256',
        sha256: HASH,
      },
      {
        image: 'ghcr.io/hiero-ledger/solo-containers/hello:0.1.0',
        tarFile: 'ghcr.io__hiero-ledger__solo-containers__hello__0.1.0.tar',
        hashFile: 'ghcr.io__hiero-ledger__solo-containers__hello__0.1.0.tar.sha256',
        sha256: OTHER_HASH,
      },
    ],
    ...overrides,
  };
}

/** Stubs the global fetch that GitHubApiClient uses, so no test touches the network. */
function stubFetch(body: string, ok: boolean = true, status: number = 200): SinonStub {
  const stub: SinonStub = sinon.stub(globalThis, 'fetch');
  stub.resolves({
    ok,
    status,
    headers: new Headers(),
    text: async (): Promise<string> => body,
  } as unknown as Response);
  return stub;
}

async function expectInvalidManifest(body: string, messageFragment: string): Promise<void> {
  stubFetch(body);
  try {
    await CacheManifestClient.fetchImages(SOLO_VERSION);
    expect.fail('expected the manifest to be rejected');
  } catch (error) {
    expect(error).to.be.instanceOf(SoloError);
    expect((error as SoloError).message).to.contain(messageFragment);
  }
}

describe('CacheManifestClient', (): void => {
  afterEach((): void => {
    sinon.restore();
    delete process.env[CacheManifestClient.CDN_BASE_URL_ENVIRONMENT_VARIABLE];
  });

  describe('getManifestUrl', (): void => {
    it('builds the release asset URL, adding the tag prefix', (): void => {
      expect(CacheManifestClient.getManifestUrl(SOLO_VERSION)).to.equal(
        'https://github.com/hiero-ledger/solo/releases/download/v0.86.0/cache-manifest.json',
      );
    });

    it('keeps an already prefixed version as-is', (): void => {
      expect(CacheManifestClient.getManifestUrl('v0.86.0')).to.equal(
        'https://github.com/hiero-ledger/solo/releases/download/v0.86.0/cache-manifest.json',
      );
    });
  });

  describe('getCdnBaseUrl', (): void => {
    it('defaults to the Solo CDN', (): void => {
      expect(CacheManifestClient.getCdnBaseUrl()).to.equal('https://cdn.solo.hashgraph.io');
    });

    it('honours the override environment variable and trims trailing slashes', (): void => {
      process.env[CacheManifestClient.CDN_BASE_URL_ENVIRONMENT_VARIABLE] = 'https://staging.example.com/cache///';

      expect(CacheManifestClient.getCdnBaseUrl()).to.equal('https://staging.example.com/cache');
    });
  });

  describe('fetchImages', (): void => {
    it('parses every entry and resolves flat CDN URLs', async (): Promise<void> => {
      const fetchStub: SinonStub = stubFetch(JSON.stringify(manifest()));

      const images: readonly CacheManifestImage[] = await CacheManifestClient.fetchImages(SOLO_VERSION);

      expect(fetchStub.firstCall.args[0]).to.equal(
        'https://github.com/hiero-ledger/solo/releases/download/v0.86.0/cache-manifest.json',
      );
      expect(images).to.have.lengthOf(2);
      expect(images[0].image).to.equal('docker.io/library/busybox:1.36.1');
      expect(images[0].tarFile).to.equal('docker.io__library__busybox__1.36.1.tar');
      expect(images[0].hashFile).to.equal('docker.io__library__busybox__1.36.1.tar.sha256');
      expect(images[0].sha256).to.equal(HASH);
      expect(images[0].tarUrl).to.equal('https://cdn.solo.hashgraph.io/docker.io__library__busybox__1.36.1.tar');
      expect(images[0].hashUrl).to.equal(
        'https://cdn.solo.hashgraph.io/docker.io__library__busybox__1.36.1.tar.sha256',
      );
      expect(images[1].sha256).to.equal(OTHER_HASH);
    });

    it('builds CDN URLs from the override base URL', async (): Promise<void> => {
      process.env[CacheManifestClient.CDN_BASE_URL_ENVIRONMENT_VARIABLE] = 'https://staging.example.com/cache';
      stubFetch(JSON.stringify(manifest()));

      const images: readonly CacheManifestImage[] = await CacheManifestClient.fetchImages(SOLO_VERSION);

      expect(images[0].tarUrl).to.equal('https://staging.example.com/cache/docker.io__library__busybox__1.36.1.tar');
      expect(images[0].hashUrl).to.equal(
        'https://staging.example.com/cache/docker.io__library__busybox__1.36.1.tar.sha256',
      );
    });

    it('reports a download failure when the release asset is missing', async (): Promise<void> => {
      stubFetch('not found', false, 404);

      try {
        await CacheManifestClient.fetchImages(SOLO_VERSION);
        expect.fail('expected the download to fail');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect((error as SoloError).message).to.contain('Failed to download the image cache manifest');
      }
    });

    it('rejects a manifest that is not JSON', async (): Promise<void> => {
      await expectInvalidManifest('<html>404</html>', 'not valid JSON');
    });

    it('rejects an unsupported schema version', async (): Promise<void> => {
      await expectInvalidManifest(JSON.stringify(manifest({schemaVersion: 2})), 'unsupported schemaVersion');
    });

    it('rejects a manifest published for a different Solo version', async (): Promise<void> => {
      await expectInvalidManifest(JSON.stringify(manifest({soloVersion: '0.85.0'})), 'does not match the requested');
    });

    it('accepts a manifest whose soloVersion carries the tag prefix', async (): Promise<void> => {
      stubFetch(JSON.stringify(manifest({soloVersion: `v${SOLO_VERSION}`})));

      const images: readonly CacheManifestImage[] = await CacheManifestClient.fetchImages(SOLO_VERSION);

      expect(images).to.have.lengthOf(2);
    });

    it('rejects an empty image list', async (): Promise<void> => {
      await expectInvalidManifest(JSON.stringify(manifest({images: []})), 'images must be a non-empty array');
    });

    it('rejects an entry with a missing field', async (): Promise<void> => {
      await expectInvalidManifest(
        JSON.stringify(manifest({images: [{image: 'busybox:1', tarFile: 'busybox.tar', sha256: HASH}]})),
        'images[0].hashFile must be a non-empty string',
      );
    });

    it('rejects a hash that is not a SHA-256 hex digest', async (): Promise<void> => {
      await expectInvalidManifest(
        JSON.stringify(
          manifest({
            images: [
              {image: 'busybox:1', tarFile: 'busybox.tar', hashFile: 'busybox.tar.sha256', sha256: 'not-a-hash'},
            ],
          }),
        ),
        'images[0].sha256 must be a 64 character lowercase hex SHA-256',
      );
    });

    it('rejects a file name that would escape the flat CDN layout', async (): Promise<void> => {
      await expectInvalidManifest(
        JSON.stringify(
          manifest({
            images: [
              {
                image: 'busybox:1',
                tarFile: '../../etc/passwd',
                hashFile: 'busybox.tar.sha256',
                sha256: HASH,
              },
            ],
          }),
        ),
        'must be a bare file name without path separators',
      );
    });
  });
});
