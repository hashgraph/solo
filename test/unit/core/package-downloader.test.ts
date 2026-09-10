// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {Readable} from 'node:stream';
import got, {type OptionsInit} from 'got';

import {PackageDownloader} from '../../../src/core/package-downloader.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {ResourceNotFoundError} from '../../../src/core/errors/classes/system/resource-not-found-error.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';

describe('PackageDownloader', (): void => {
  const testLogger: SoloPinoLogger = new SoloPinoLogger('debug', true);
  const downloader: PackageDownloader = new PackageDownloader(testLogger);
  let sandbox: SinonSandbox;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
  });

  afterEach((): void => {
    delete process.env.PACKAGE_DOWNLOADER_URL_EXISTS_TIMEOUT_MS;
    delete process.env.PACKAGE_DOWNLOADER_DOWNLOAD_CONNECT_TIMEOUT_MS;
    delete process.env.PACKAGE_DOWNLOADER_DOWNLOAD_RESPONSE_TIMEOUT_MS;
    sandbox.restore();
  });

  // stubs fetchFile so that it writes the given content instead of hitting the network
  function stubFetchFile(content: string): SinonStub {
    return sandbox
      .stub(downloader, 'fetchFile')
      .callsFake(async (_url: string, destinationPath: string): Promise<string> => {
        fs.writeFileSync(destinationPath, content);
        return destinationPath;
      });
  }

  // stubs fetchFile so that each URL writes its own content instead of hitting the network
  function stubFetchFileByURL(contentByURL: Record<string, string>): SinonStub {
    return sandbox
      .stub(downloader, 'fetchFile')
      .callsFake(async (url: string, destinationPath: string): Promise<string> => {
        fs.writeFileSync(destinationPath, contentByURL[url]);
        return destinationPath;
      });
  }

  describe('urlExists', (): void => {
    it('should return true if source URL is valid', async (): Promise<void> => {
      const url: string = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.sha384';
      await expect(downloader.urlExists(url)).to.eventually.equal(true);
    });
    it('should return false if source URL is invalid', async (): Promise<void> => {
      const url: string = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.INVALID';
      await expect(downloader.urlExists(url)).to.eventually.equal(false);
    });
  });

  describe('fetchFile', (): void => {
    it('should fail if source URL is missing', async (): Promise<void> => {
      await expect(downloader.fetchFile('', os.tmpdir())).to.be.rejectedWith('package URL is required');
    });

    it('should fail if destination path is missing', async (): Promise<void> => {
      await expect(downloader.fetchFile('https://localhost', '')).to.be.rejectedWith('destination path is required');
    });

    it('should fail with a malformed URL', async (): Promise<void> => {
      await expect(downloader.fetchFile('INVALID_URL', os.tmpdir())).to.be.rejectedWith(
        IllegalArgumentError,
        "package URL 'INVALID_URL' is invalid",
      );
    });

    it('should fail with an invalid URL', async (): Promise<void> => {
      await expect(downloader.fetchFile('https://localhost/INVALID_FILE', os.tmpdir())).to.be.rejectedWith(
        ResourceNotFoundError,
        'Resource not found: https://localhost/INVALID_FILE',
      );
    });

    it('should succeed with a valid release artifact URL', async (): Promise<void> => {
      // eslint-disable-next-line no-useless-catch
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));

        const tag: string = 'v0.42.5';
        const destinationPath: string = `${temporaryDirectory}/build-${tag}.sha384`;

        // we use the build-<tag>.sha384 file URL to test downloading a small file
        const url: string = `https://builds.hedera.com/node/software/v0.42/build-${tag}.sha384`;
        await expect(downloader.fetchFile(url, destinationPath)).to.eventually.equal(destinationPath);
        expect(fs.existsSync(destinationPath)).to.be.ok;

        // remove the file to reduce disk usage
        fs.rmSync(temporaryDirectory, {recursive: true});
      } catch (error) {
        throw error;
      }
    });

    it('should pass env override download timeouts to got.stream', async (): Promise<void> => {
      process.env.PACKAGE_DOWNLOADER_DOWNLOAD_CONNECT_TIMEOUT_MS = '1234';
      process.env.PACKAGE_DOWNLOADER_DOWNLOAD_RESPONSE_TIMEOUT_MS = '5678';

      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
      const destinationPath: string = PathEx.join(temporaryDirectory, 'artifact.txt');
      const urlExistsStub: SinonStub = sandbox.stub(downloader, 'urlExists').resolves(true);
      const gotStreamStub: SinonStub = sandbox
        .stub(got, 'stream')
        .callsFake((...arguments_: unknown[]): ReturnType<typeof got.stream> => {
          const options: OptionsInit | undefined =
            arguments_.length > 1 ? (arguments_[1] as OptionsInit) : (arguments_[0] as OptionsInit);
          expect(options?.followRedirect).to.equal(true);
          expect(options?.timeout).to.deep.equal({
            connect: 1234,
            response: 5678,
          });
          return Readable.from(['payload']) as ReturnType<typeof got.stream>;
        });

      await expect(downloader.fetchFile('https://example.com/artifact.txt', destinationPath)).to.eventually.equal(
        destinationPath,
      );
      expect(fs.readFileSync(destinationPath, 'utf8')).to.equal('payload');
      expect(urlExistsStub.calledOnce).to.equal(true);
      expect(gotStreamStub.calledOnce).to.equal(true);

      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    it('should continue download when GitHub release HEAD check reports missing URL', async (): Promise<void> => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
      const destinationPath: string = PathEx.join(temporaryDirectory, 'artifact.txt');
      const urlExistsStub: SinonStub = sandbox.stub(downloader, 'urlExists').resolves(false);
      const gotStreamStub: SinonStub = sandbox
        .stub(got, 'stream')
        .returns(Readable.from(['payload']) as ReturnType<typeof got.stream>);

      await expect(
        downloader.fetchFile(
          'https://github.com/google/go-containerregistry/releases/download/v0.21.4/go-containerregistry_Linux_x86_64.tar.gz',
          destinationPath,
        ),
      ).to.eventually.equal(destinationPath);
      expect(fs.readFileSync(destinationPath, 'utf8')).to.equal('payload');
      expect(urlExistsStub.calledOnce).to.equal(true);
      expect(gotStreamStub.calledOnce).to.equal(true);

      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });
  });

  describe('fetchPackage', (): void => {
    const packageURL: string = 'https://example.com/build-v0.0.1.zip';
    const packageContent: string = 'a complete package payload';
    const packageChecksum: string = crypto.createHash('sha256').update(packageContent).digest('hex');

    let temporaryDirectory: string;
    let packageFile: string;

    beforeEach((): void => {
      temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
      packageFile = PathEx.join(temporaryDirectory, 'build-v0.0.1.zip');
    });

    afterEach((): void => {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    it('should reuse an existing file whose checksum matches without downloading', async (): Promise<void> => {
      fs.writeFileSync(packageFile, packageContent);
      const fetchFileStub: SinonStub = stubFetchFile(packageContent);

      await expect(
        downloader.fetchPackage(packageURL, packageChecksum, temporaryDirectory, true, 'sha256'),
      ).to.eventually.equal(packageFile);
      expect(fetchFileStub.called).to.equal(false);
    });

    it('should re-download a truncated existing file', async (): Promise<void> => {
      fs.writeFileSync(packageFile, packageContent.slice(0, 5));
      const fetchFileStub: SinonStub = stubFetchFile(packageContent);

      await expect(
        downloader.fetchPackage(packageURL, packageChecksum, temporaryDirectory, true, 'sha256'),
      ).to.eventually.equal(packageFile);
      expect(fetchFileStub.calledOnceWith(packageURL, packageFile)).to.equal(true);
      expect(fs.readFileSync(packageFile, 'utf8')).to.equal(packageContent);
    });

    it('should fail and remove the file when the downloaded replacement is also corrupt', async (): Promise<void> => {
      fs.writeFileSync(packageFile, packageContent.slice(0, 5));
      const fetchFileStub: SinonStub = stubFetchFile('still corrupt');

      await expect(
        downloader.fetchPackage(packageURL, packageChecksum, temporaryDirectory, true, 'sha256'),
      ).to.be.rejectedWith(SoloError, packageURL);
      expect(fetchFileStub.calledOnce).to.equal(true);
      expect(fs.existsSync(packageFile)).to.equal(false);
    });

    it('should download over an existing valid file when force is true', async (): Promise<void> => {
      fs.writeFileSync(packageFile, packageContent);
      const fetchFileStub: SinonStub = stubFetchFile(packageContent);

      await expect(
        downloader.fetchPackage(packageURL, packageChecksum, temporaryDirectory, true, 'sha256', true),
      ).to.eventually.equal(packageFile);
      expect(fetchFileStub.calledOnceWith(packageURL, packageFile)).to.equal(true);
    });

    it('should reuse an existing file without downloading when checksum verification is off', async (): Promise<void> => {
      fs.writeFileSync(packageFile, packageContent.slice(0, 5));
      const fetchFileStub: SinonStub = stubFetchFile(packageContent);

      await expect(
        downloader.fetchPackage(packageURL, 'unused', temporaryDirectory, false, '', false),
      ).to.eventually.equal(packageFile);
      expect(fetchFileStub.called).to.equal(false);
    });

    describe('with a checksum URL', (): void => {
      const checksumURL: string = 'https://example.com/build-v0.0.1.sha256';
      const checksumContent: string = `${packageChecksum}  build-v0.0.1.zip`;

      let checksumFile: string;

      beforeEach((): void => {
        checksumFile = PathEx.join(temporaryDirectory, 'build-v0.0.1.sha256');
      });

      it('should reuse a cached package and checksum file without any download', async (): Promise<void> => {
        fs.writeFileSync(packageFile, packageContent);
        fs.writeFileSync(checksumFile, checksumContent);
        const fetchFileStub: SinonStub = stubFetchFileByURL({});

        await expect(
          downloader.fetchPackage(packageURL, checksumURL, temporaryDirectory, true, 'sha256'),
        ).to.eventually.equal(packageFile);
        expect(fetchFileStub.called).to.equal(false);
      });

      it('should download only the checksum file when it is missing next to a cached package', async (): Promise<void> => {
        fs.writeFileSync(packageFile, packageContent);
        const fetchFileStub: SinonStub = stubFetchFileByURL({[checksumURL]: checksumContent});

        await expect(
          downloader.fetchPackage(packageURL, checksumURL, temporaryDirectory, true, 'sha256'),
        ).to.eventually.equal(packageFile);
        expect(fetchFileStub.calledOnceWith(checksumURL, checksumFile)).to.equal(true);
      });

      it('should keep a cached package when only the cached checksum file is stale', async (): Promise<void> => {
        fs.writeFileSync(packageFile, packageContent);
        fs.writeFileSync(checksumFile, `${'0'.repeat(64)}  build-v0.0.1.zip`);
        const fetchFileStub: SinonStub = stubFetchFileByURL({[checksumURL]: checksumContent});

        await expect(
          downloader.fetchPackage(packageURL, checksumURL, temporaryDirectory, true, 'sha256'),
        ).to.eventually.equal(packageFile);
        expect(fetchFileStub.calledOnceWith(checksumURL, checksumFile)).to.equal(true);
        expect(fs.readFileSync(packageFile, 'utf8')).to.equal(packageContent);
      });

      it('should re-download a truncated package after re-verifying against a fresh checksum file', async (): Promise<void> => {
        fs.writeFileSync(packageFile, packageContent.slice(0, 5));
        fs.writeFileSync(checksumFile, checksumContent);
        const fetchFileStub: SinonStub = stubFetchFileByURL({
          [checksumURL]: checksumContent,
          [packageURL]: packageContent,
        });

        await expect(
          downloader.fetchPackage(packageURL, checksumURL, temporaryDirectory, true, 'sha256'),
        ).to.eventually.equal(packageFile);
        expect(fetchFileStub.calledTwice).to.equal(true);
        expect(fetchFileStub.firstCall.calledWith(checksumURL, checksumFile)).to.equal(true);
        expect(fetchFileStub.secondCall.calledWith(packageURL, packageFile)).to.equal(true);
        expect(fs.readFileSync(packageFile, 'utf8')).to.equal(packageContent);
      });
    });
  });

  describe('fetchPlatform', (): void => {
    it('should fail if platform release tag is missing', async (): Promise<void> => {
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('', temporaryDirectory);
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for missing platform release tag');
      } catch (error) {
        expect(error.cause).not.to.be.null;
        expect(error).to.be.instanceof(MissingArgumentError);
      }
    });
    it('should fail if platform release artifact is not found', async (): Promise<void> => {
      const tag: string = 'v0.40.0-INVALID';

      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform(tag, temporaryDirectory);
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for invalid platform release artifact');
      } catch (error) {
        expect(error.cause).not.to.be.null;
        expect(error).to.be.instanceof(SoloError);
      }
    });

    it('should fail if platform release tag is invalid', async (): Promise<void> => {
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('INVALID', os.tmpdir());
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for invalid platform release tag');
      } catch (error) {
        if (!error.message.includes('must include major, minor and patch fields')) {
          throw error;
        }
        expect(error.message).to.contain('must include major, minor and patch fields');
      }
    });

    it('should fail if destination directory is null', async (): Promise<void> => {
      try {
        await downloader.fetchPlatform('v0.40.0', '');
        throw new Error('fetchPlatform should have thrown an error for null destination directory');
      } catch (error) {
        expect(error.message).to.contain('destination directory path is required');
      }
    });
  });
});
