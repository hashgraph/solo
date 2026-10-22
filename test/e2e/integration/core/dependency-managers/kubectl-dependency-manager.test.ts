// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import path from 'node:path';
import {KubectlDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import sinon, {type SinonStub} from 'sinon';
import {platform} from 'node:process';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../../../src/core/constants.js';

import {type PackageDownloader} from '../../../../../src/core/package-downloader.js';
import {resetForTest} from '../../../../test-container.js';

const mockVersionOutputValid: string = 'Client Version: v1.33.3\nKustomize Version: v5.6.0';
const mockVersionOutputMissingClient: string = 'Something Else: v1.10.0\nKustomize Version: v5.6.0';
const mockVersionOutputInvalid: string = 'invalid output';

describe('KubectlDependencyManager', (): void => {
  const originalPlatform: NodeJS.Platform = platform;
  const originalInstallationDirectory: string = container.resolve<string>(InjectTokens.KubectlInstallationDirectory);
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  const localInstallationDirectory: string = temporaryDirectory;
  let sandbox: sinon.SinonSandbox;

  before((): void => {
    resetForTest();
    fs.mkdirSync(temporaryDirectory);
    sandbox = sinon.createSandbox();
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  afterEach((): void => {
    resetForTest();
    sandbox.restore();
  });

  it('should return kubectl version', (): void => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
    );
    expect(kubectlDependencyManager.getRequiredVersion()).to.equal(version.KUBECTL_VERSION);
  });

  it('should be able to check when kubectl not installed', (): void => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
    );
    expect(kubectlDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when kubectl is installed', async (): Promise<void> => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
    );
    // Create the local executable file for testing
    const localPath: string = PathEx.join(localInstallationDirectory, constants.KUBECTL);
    fs.writeFileSync(localPath, '');
    expect(kubectlDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when kubectl is installed globally', (): void => {
    let kubectlDependencyManager: KubectlDependencyManager;
    let runStub: SinonStub;
    let existsSyncStub: SinonStub;
    let downloaderFetchPackageSpy: sinon.SinonSpy;
    let packageDownloader: PackageDownloader;
    let cpSyncStub: SinonStub;
    let chmodSyncStub: SinonStub;
    let rmSyncStub: SinonStub;

    beforeEach((): void => {
      packageDownloader = container.resolve(InjectTokens.PackageDownloader);
      downloaderFetchPackageSpy = sandbox.spy(packageDownloader, 'fetchPackage');
      kubectlDependencyManager = new KubectlDependencyManager(undefined, temporaryDirectory, process.arch, undefined);
      kubectlDependencyManager.uninstallLocal();
      runStub = sandbox.stub(kubectlDependencyManager, 'run');
      cpSyncStub = sandbox.stub(fs, 'cpSync').returns();
      chmodSyncStub = sandbox.stub(fs, 'chmodSync').returns();
      existsSyncStub = sandbox.stub(fs, 'existsSync').returns(true);
      rmSyncStub = sandbox.stub(fs, 'rmSync').returns();
    });

    afterEach((): void => {
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      container.register(InjectTokens.KubectlInstallationDirectory, {useValue: originalInstallationDirectory});
      sandbox.restore();
      resetForTest();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      const fakeGlobalBinDirectory: string = '/test-solo-global-bin';
      const fakeGlobalKubectlPath: string = `${fakeGlobalBinDirectory}/kubectl`;
      const originalPath: string = process.env.PATH ?? '';
      process.env.PATH = `${fakeGlobalBinDirectory}${path.delimiter}${originalPath}`;
      sandbox.stub(fs, 'accessSync').callsFake((filePath: Parameters<typeof fs.accessSync>[0]): void => {
        if (String(filePath) === fakeGlobalKubectlPath) {
          return;
        }
        throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
      });
      runStub.withArgs(fakeGlobalKubectlPath, ['version', '--client']).resolves(mockVersionOutputValid.split('\n'));
      existsSyncStub.withArgs(`${localInstallationDirectory}/kubectl`).returns(false);

      try {
        // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
        const result: boolean = await kubectlDependencyManager.isInstalledGloballyAndMeetsRequirements();
        expect(result).to.be.true;

        expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
        // Should return global path since it meets requirements
        expect(await kubectlDependencyManager.getExecutable()).to.equal(fakeGlobalKubectlPath);
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it('should install kubectl locally if the global installation does not meet the requirements', async (): Promise<void> => {
      // Stub accessSync so the native PATH scan finds no global kubectl installation.
      sandbox.stub(fs, 'accessSync').throws(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}));
      expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(localInstallationDirectory, constants.KUBECTL))).to.be.ok;
      expect(await kubectlDependencyManager.getExecutable()).to.equal(
        PathEx.join(localInstallationDirectory, constants.KUBECTL),
      );
    });

    it('should be able to use local installation on repeated calls without reinstalling given global installation does not meet requirements', async (): Promise<void> => {
      // Restore all beforeEach stubs so real fs/run operations work for the download.
      runStub.restore();
      existsSyncStub.restore();
      cpSyncStub.restore();
      chmodSyncStub.restore();
      rmSyncStub.restore();
      // Stub accessSync so the native PATH scan finds no global kubectl installation.
      sandbox.stub(fs, 'accessSync').throws(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}));
      const kubectlInstallationDirectory: string = getTemporaryDirectory();
      container.register(InjectTokens.KubectlInstallationDirectory, {useValue: kubectlInstallationDirectory});
      kubectlDependencyManager = new KubectlDependencyManager(undefined, undefined, process.arch, undefined);
      expect(await kubectlDependencyManager.install(getTemporaryDirectory())).to.be.true;
      expect(downloaderFetchPackageSpy.calledOnce).to.be.true;
      expect(fs.existsSync(PathEx.join(kubectlInstallationDirectory, constants.KUBECTL))).to.be.ok;
      // Call install again, should not trigger installation since local installation meets requirements
      downloaderFetchPackageSpy.resetHistory();
      expect(downloaderFetchPackageSpy.notCalled).to.be.true;
      expect(await kubectlDependencyManager.install(getTemporaryDirectory())).to.be.true;
      expect(downloaderFetchPackageSpy.notCalled).to.be.true;
    });
  });

  describe('Kubectl Installation Tests', (): void => {
    afterEach((): void => {
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      sandbox.restore();
    });

    each([
      [OperatingSystem.OS_LINUX, 'x64'],
      [OperatingSystem.OS_LINUX, 'amd64'],
      [OperatingSystem.OS_WIN32, 'amd64'],
    ]).it(
      'should be able to install kubectl base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        container.register(InjectTokens.OsPlatform, {useValue: osPlatform});
        const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
          undefined,
          localInstallationDirectory,
          osArch,
          undefined,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }

        kubectlDependencyManager.uninstallLocal();
        expect(kubectlDependencyManager.isInstalledLocally()).not.to.be.ok;

        // Stub accessSync so the native PATH scan finds no global kubectl installation.
        sandbox.stub(fs, 'accessSync').throws(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}));
        expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(kubectlDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(temporaryDirectory, {recursive: true});
      },
    );
  });

  describe('KubectlDependencyManager system methods', (): void => {
    let kubectlDependencyManager: KubectlDependencyManager;

    beforeEach((): void => {
      kubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        process.arch,
        undefined,
      );
    });

    afterEach((): void => {
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      container.register(InjectTokens.KubectlInstallationDirectory, {useValue: originalInstallationDirectory});
      sandbox.restore();
      resetForTest();
    });

    it('getVersion should succeed with valid version output', async (): Promise<void> => {
      sandbox.stub(kubectlDependencyManager, 'run').resolves(mockVersionOutputValid.split('\n'));

      expect(await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl')).to.equal('1.33.3');
    });

    it('getVersion should handle error if kubectl version fails', async (): Promise<void> => {
      sandbox.stub(kubectlDependencyManager, 'run').rejects(new Error('Command failed'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include('Failed to check kubectl version');
      }
    });

    it('getVersion should handle invalid output', async (): Promise<void> => {
      sandbox.stub(kubectlDependencyManager, 'run').resolves(mockVersionOutputInvalid.split('\n'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include('Failed to check kubectl version');
      }
    });

    it('getVersion should handle missing client version in output', async (): Promise<void> => {
      sandbox.stub(kubectlDependencyManager, 'run').resolves(mockVersionOutputMissingClient.split('\n'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include('Failed to check kubectl version');
      }
    });

    it('processDownloadedPackage should handle platform-specific executable names', async (): Promise<void> => {
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_LINUX});
      // First test with non-Windows platform
      let kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'amd64',
        undefined,
      );

      // @ts-expect-error TS2341: Property processDownloadedPackage is private
      const linuxResult: string[] = await kubectlDependencyManager.processDownloadedPackage('/tmp/kubectl', '/tmp');
      expect(linuxResult).to.contain('/tmp/kubectl');

      // Now test with Windows platform
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_WIN32});
      kubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'amd64',
        undefined,
      );

      // @ts-expect-error TS2341: Property processDownloadedPackage is private
      const windowsResult: string[] = await kubectlDependencyManager.processDownloadedPackage('/tmp/kubectl.exe');
      expect(windowsResult).to.contain('/tmp/kubectl.exe');
    });

    it('getArtifactName should generate correct URL format based on platform/arch', (): void => {
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_LINUX});
      const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'amd64',
        '1.25.0',
      );

      // @ts-expect-error TS2341: Property getArtifactName is private
      const artifactName: string = kubectlDependencyManager.getArtifactName();
      expect(artifactName).to.include('1.25.0');
      expect(artifactName).to.include(OperatingSystem.OS_LINUX);
      expect(artifactName).to.include('amd64');
    });
  });
});
