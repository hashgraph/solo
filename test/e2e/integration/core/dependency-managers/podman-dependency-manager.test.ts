// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, beforeEach, afterEach, describe, it} from 'mocha';
import fs from 'node:fs';
import path from 'node:path';
import sinon, {type SinonStub} from 'sinon';
import {PodmanDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../../src/core/constants.js';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {platform} from 'node:process';
import {ShellRunner} from '../../../../../src/core/shell-runner.js';

// Test data constants
const PODMAN_VERSION: string = version.PODMAN_VERSION.replace('v', '');
const PODMAN_LOW_VERSION: string = '0.1.0';
const MOCK_RELEASE_TAG: string = `v${PODMAN_VERSION}`;
const MOCK_RELEASE_URL: string = `https://github.com/containers/podman/releases/tag/${MOCK_RELEASE_TAG}`;
const MOCK_DOWNLOAD_URL_BASE: string = `https://github.com/containers/podman/releases/download/${MOCK_RELEASE_TAG}`;
const MOCK_LINUX_ASSET_NAME: string = 'podman-remote-static-linux_amd64.tar.gz';
const MOCK_WINDOWS_ASSET_NAME: string = 'podman-remote-release-windows_amd64.zip';
const MOCK_DARWIN_ARM64_ASSET_NAME: string = 'podman-remote-release-darwin_arm64.zip';
const MOCK_LINUX_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_LINUX_ASSET_NAME}`;
const MOCK_WINDOWS_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_WINDOWS_ASSET_NAME}`;
const MOCK_DARWIN_ARM64_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_DARWIN_ARM64_ASSET_NAME}`;
const MOCK_CHECKSUM: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MOCK_CHECKSUM_WITH_PREFIX: string = `sha256:${MOCK_CHECKSUM}`;

// Mock GitHub API response for fetchReleaseInfo
const MOCK_GITHUB_RELEASES_RESPONSE: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<
    {
      tag_name: string;
      html_url: string;
      assets: (
        | {name: string; browser_download_url: string; content_type: string; size: number; digest: string}
        | {
            name: string;
            browser_download_url: string;
            content_type: string;
            size: number;
            digest: string;
          }
        | {name: string; browser_download_url: string; content_type: string; size: number; digest: string}
      )[];
    }[]
  > => [
    {
      tag_name: MOCK_RELEASE_TAG,
      html_url: MOCK_RELEASE_URL,
      assets: [
        {
          name: MOCK_LINUX_ASSET_NAME,
          browser_download_url: MOCK_LINUX_DOWNLOAD_URL,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
        {
          name: MOCK_WINDOWS_ASSET_NAME,
          browser_download_url: MOCK_WINDOWS_DOWNLOAD_URL,
          content_type: 'application/zip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
        {
          name: MOCK_DARWIN_ARM64_ASSET_NAME,
          browser_download_url: MOCK_DARWIN_ARM64_DOWNLOAD_URL,
          content_type: 'application/zip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
      ],
    },
  ],
};

// Mock GitHub API response with no matching assets
const MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<
    {
      tag_name: string;
      html_url: string;
      assets: {name: string; browser_download_url: string; content_type: string; size: number; digest: string}[];
    }[]
  > => [
    {
      tag_name: MOCK_RELEASE_TAG,
      html_url: MOCK_RELEASE_URL,
      assets: [
        {
          name: 'some-other-asset.tar.gz',
          browser_download_url: `${MOCK_DOWNLOAD_URL_BASE}/some-other-asset.tar.gz`,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
      ],
    },
  ],
};

// Mock GitHub API error response
const MOCK_GITHUB_ERROR_RESPONSE: {
  ok: boolean;
  status: number;
} = {
  ok: false,
  status: 404,
};

// Mock GitHub API empty releases response
const MOCK_GITHUB_EMPTY_RELEASES: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<any[]> => [],
};

describe('PodmanDependencyManager', (): void => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  const originalPlatform: NodeJS.Platform = platform;
  let sandbox: sinon.SinonSandbox;

  before((): void => {
    fs.mkdirSync(temporaryDirectory, {recursive: true});
    sandbox = sinon.createSandbox();
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('should return podman version', (): void => {
    const podmanDependencyManager: PodmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(podmanDependencyManager.getRequiredVersion()).to.equal(version.PODMAN_VERSION);
  });

  it('should be able to check when podman not installed', (): void => {
    const podmanDependencyManager: PodmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(podmanDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when podman is installed', async (): Promise<void> => {
    const podmanDependencyManager: PodmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    fs.writeFileSync(PathEx.join(temporaryDirectory, constants.PODMAN), '');
    expect(podmanDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('PodmanDependencyManager system methods', (): void => {
    let podmanDependencyManager: PodmanDependencyManager;
    let fetchStub: SinonStub;
    let originalFetch: typeof globalThis.fetch;

    beforeEach((): void => {
      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        process.arch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      // Mock fetch for fetchReleaseInfo
      originalFetch = globalThis.fetch;
      globalThis.fetch = sandbox.stub() as any;
      fetchStub = globalThis.fetch as SinonStub;
    });

    afterEach((): void => {
      globalThis.fetch = originalFetch;
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      sandbox.restore();
    });

    it('getVersion should return version from podman --version output', async (): Promise<void> => {
      const executableWithPath: string = '/usr/local/bin/podman';
      sandbox
        .stub(ShellRunner.prototype, 'run')
        .withArgs(executableWithPath, ['--version'])
        .resolves([`podman version ${PODMAN_VERSION}`]);
      const version: string = await podmanDependencyManager.getVersion(executableWithPath);
      expect(version).to.equal(PODMAN_VERSION);
    });

    it('getVersion should throw error when command fails', async (): Promise<void> => {
      sandbox.stub(ShellRunner.prototype, 'run').rejects(new Error('Command failed'));
      try {
        await podmanDependencyManager.getVersion('/usr/local/bin/podman');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check podman version');
      }
    });

    it('getVersion should throw error when version pattern not found', async (): Promise<void> => {
      sandbox.stub(ShellRunner.prototype, 'run').resolves(['Invalid output']);
      try {
        await podmanDependencyManager.getVersion('/usr/local/bin/podman');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check podman version');
      }
    });

    it('shouldInstall should return false when Docker is installed', async (): Promise<void> => {
      sandbox
        .stub(ShellRunner.prototype, 'run')
        .withArgs(constants.DOCKER, ['--version'])
        .resolves(['Docker version 20.10.8']);
      const result: boolean = await podmanDependencyManager.shouldInstall();
      expect(result).to.be.false;
    });

    it('shouldInstall should return true when Docker is not installed', async (): Promise<void> => {
      sandbox
        .stub(ShellRunner.prototype, 'run')
        .withArgs(constants.DOCKER, ['--version'])
        .rejects(new Error('Docker not found'));
      const result: boolean = await podmanDependencyManager.shouldInstall();
      expect(result).to.be.true;
    });

    it('getArch should normalize architecture names', (): void => {
      // Test x64 to amd64 conversion
      let manager: PodmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'x64',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('amd64');

      // Test arm64 conversion
      manager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'arm64',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');

      // Test aarch64 to arm64 conversion
      manager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'aarch64',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');
    });

    it('fetchReleaseInfo should parse GitHub API response correctly', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_LINUX});

      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'x64',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      // @ts-expect-error TS2341: Property fetchReleaseInfo is private
      const releaseInfo: ReleaseInfo = await podmanDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);

      expect(releaseInfo.downloadUrl).to.equal(MOCK_DOWNLOAD_URL_BASE);
      expect(releaseInfo.assetName).to.equal(MOCK_LINUX_ASSET_NAME);
      expect(releaseInfo.checksum).to.equal(MOCK_CHECKSUM);
      expect(releaseInfo.version).to.equal(PODMAN_VERSION);
    });

    it('fetchReleaseInfo should handle API error', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_ERROR_RESPONSE);

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await podmanDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('GitHub API request');
        expect(error.message).to.include('returned HTTP 404');
      }
    });

    it('fetchReleaseInfo should handle empty releases array', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_EMPTY_RELEASES);

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await podmanDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('No releases found');
      }
    });

    it('fetchReleaseInfo should handle no matching asset', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET);

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await podmanDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('No matching GitHub release asset found');
      }
    });
  });

  describe('when podman is installed globally', (): void => {
    let podmanDependencyManager: PodmanDependencyManager;
    let runStub: SinonStub;
    let existsSyncStub: SinonStub;
    let fetchStub: SinonStub;
    let originalFetch: typeof globalThis.fetch;

    beforeEach((): void => {
      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        process.arch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      podmanDependencyManager.uninstallLocal();
      runStub = sandbox.stub(podmanDependencyManager, 'run');

      // Mock fetch for fetchReleaseInfo
      originalFetch = globalThis.fetch;
      globalThis.fetch = sandbox.stub();
      fetchStub = globalThis.fetch as SinonStub;

      // Configure fetch to return valid mock response
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);

      // Add stubs for file system operations
      sandbox.stub(fs, 'cpSync').returns();
      sandbox.stub(fs, 'chmodSync').returns();
      existsSyncStub = sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(fs, 'rmSync').returns();
    });

    afterEach((): void => {
      globalThis.fetch = originalFetch;
      sandbox.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      sandbox.stub(podmanDependencyManager, 'shouldInstall').resolves(true);

      const fakeGlobalBinDirectory: string = '/test-solo-global-bin';
      const fakeGlobalPodmanPath: string = `${fakeGlobalBinDirectory}/podman`;
      const originalPath: string = process.env.PATH ?? '';
      process.env.PATH = `${fakeGlobalBinDirectory}${path.delimiter}${originalPath}`;
      sandbox.stub(fs, 'accessSync').callsFake((filePath: Parameters<typeof fs.accessSync>[0]): void => {
        if (String(filePath) === fakeGlobalPodmanPath) {
          return;
        }
        throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
      });
      runStub.withArgs(fakeGlobalPodmanPath, ['--version']).resolves([`podman version ${version.PODMAN_VERSION}`]);
      existsSyncStub.withArgs(`${temporaryDirectory}/podman`).returns(false);

      try {
        // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
        const result: boolean = await podmanDependencyManager.isInstalledGloballyAndMeetsRequirements();
        expect(result).to.be.true;

        expect(await podmanDependencyManager.install(getTestCacheDirectory())).to.be.true;

        // Should return global path since it meets requirements
        expect(await podmanDependencyManager.getExecutable()).to.equal(fakeGlobalPodmanPath);
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it('should install podman locally if the global installation does not meet the requirements', async (): Promise<void> => {
      const fakeGlobalBinDirectory: string = '/test-solo-global-bin';
      const fakeGlobalPodmanPath: string = `${fakeGlobalBinDirectory}/podman`;
      const originalPath: string = process.env.PATH ?? '';
      process.env.PATH = `${fakeGlobalBinDirectory}${path.delimiter}${originalPath}`;
      sandbox.stub(fs, 'accessSync').callsFake((filePath: Parameters<typeof fs.accessSync>[0]): void => {
        if (String(filePath) === fakeGlobalPodmanPath) {
          return;
        }
        throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
      });
      runStub.withArgs(fakeGlobalPodmanPath, ['--version']).resolves([`podman version ${PODMAN_LOW_VERSION}`]);
      runStub
        .withArgs(PathEx.join(temporaryDirectory, 'podman'), ['--version'])
        .resolves([`podman version ${PODMAN_LOW_VERSION}`]);
      existsSyncStub.withArgs(PathEx.join(temporaryDirectory, 'podman')).returns(true);

      try {
        // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
        const result: boolean = await podmanDependencyManager.isInstalledGloballyAndMeetsRequirements();
        expect(result).to.be.false;

        expect(await podmanDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(fs.existsSync(PathEx.join(temporaryDirectory, 'podman'))).to.be.ok;
        expect(await podmanDependencyManager.getExecutable()).to.equal(
          PathEx.join(temporaryDirectory, constants.PODMAN),
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
});
