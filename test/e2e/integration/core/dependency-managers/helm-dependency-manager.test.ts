// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import path from 'node:path';
import sinon, {type SinonStub} from 'sinon';

import {HelmDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {platform} from 'node:process';
import * as constants from '../../../../../src/core/constants.js';

describe('HelmDependencyManager', (): void => {
  const originalPlatform: NodeJS.Platform = platform;
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  const installationDirectory: string = getTemporaryDirectory();
  const originalInstallationDirectory: string = container.resolve<string>(InjectTokens.HelmInstallationDirectory);
  let sandbox: sinon.SinonSandbox;

  before((): void => {
    fs.mkdirSync(temporaryDirectory);
    sandbox = sinon.createSandbox();
    container.register(InjectTokens.HelmInstallationDirectory, {useValue: installationDirectory});
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
    if (fs.existsSync(installationDirectory)) {
      fs.rmSync(installationDirectory, {recursive: true});
    }
    container.register(InjectTokens.HelmInstallationDirectory, {useValue: originalInstallationDirectory});
  });

  afterEach((): void => {
    container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
    sandbox.restore();
  });

  it('should return helm version', (): void => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(helmDependencyManager.getRequiredVersion()).to.equal(version.HELM_VERSION);
  });

  it('should be able to check when helm not installed', (): void => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(helmDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when helm is installed', async (): Promise<void> => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    // Create the local executable file for testing
    const localPath: string = PathEx.join(temporaryDirectory, 'helm');
    fs.writeFileSync(localPath, '');
    expect(helmDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('Helm Installation Tests', (): void => {
    afterEach((): void => {
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      container.register(InjectTokens.HelmInstallationDirectory, {useValue: originalInstallationDirectory});
      sandbox.restore();
      if (fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true});
      }
      if (fs.existsSync(installationDirectory)) {
        fs.rmSync(installationDirectory, {recursive: true});
      }
    });

    each([
      [OperatingSystem.OS_LINUX, 'x64'],
      [OperatingSystem.OS_LINUX, 'amd64'],
      [OperatingSystem.OS_WIN32, 'amd64'],
    ]).it(
      'should be able to install helm base on %s and %s',
      async (osPlatform: string, osArch: string): Promise<void> => {
        container.register(InjectTokens.OsPlatform, {useValue: osPlatform});
        container.register(InjectTokens.HelmInstallationDirectory, {useValue: installationDirectory});

        const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
          undefined,
          undefined,
          installationDirectory,
          osArch,
          undefined,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }
        if (fs.existsSync(getTestCacheDirectory())) {
          fs.rmSync(getTestCacheDirectory(), {recursive: true});
        }
        helmDependencyManager.uninstallLocal();
        expect(helmDependencyManager.isInstalledLocally()).not.to.be.ok;

        // Stub accessSync so the native PATH scan finds no global helm installation.
        sandbox.stub(fs, 'accessSync').throws(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}));
        expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(helmDependencyManager.isInstalledLocally()).to.be.ok;

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }
      },
    );
  });

  describe('when helm is installed globally', (): void => {
    let helmDependencyManager: HelmDependencyManager;
    let runStub: SinonStub;

    beforeEach((): void => {
      helmDependencyManager = new HelmDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        process.arch,
        undefined,
      );
      helmDependencyManager.uninstallLocal();
      runStub = sandbox.stub(helmDependencyManager, 'run');
    });

    afterEach((): void => {
      sandbox.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      // Point PATH at a fake directory and stub accessSync to make the native PATH
      // scan discover a fake global helm binary without creating a real file.
      const fakeGlobalBinDirectory: string = '/test-solo-global-bin';
      const fakeGlobalHelmPath: string = `${fakeGlobalBinDirectory}/helm`;
      const originalPath: string = process.env.PATH ?? '';
      process.env.PATH = `${fakeGlobalBinDirectory}${path.delimiter}${originalPath}`;
      sandbox.stub(fs, 'accessSync').callsFake((filePath: Parameters<typeof fs.accessSync>[0]): void => {
        if (String(filePath) === fakeGlobalHelmPath) {
          return;
        }
        throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
      });
      runStub.withArgs(fakeGlobalHelmPath, ['version', '--short']).resolves(['v4.1.3+gc94d381']);

      try {
        // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
        const result: boolean = await helmDependencyManager.isInstalledGloballyAndMeetsRequirements();
        expect(result).to.be.true;

        expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
        // Should not install locally since global installation meets requirements
        expect(fs.existsSync(PathEx.join(temporaryDirectory, 'helm'))).to.be.not.ok;
        // Should return global path since it meets requirements
        expect(await helmDependencyManager.getExecutable()).to.equal(fakeGlobalHelmPath);
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it('should install helm locally if the global installation does not meet the requirements', async (): Promise<void> => {
      const fakeGlobalBinDirectory: string = '/test-solo-global-bin';
      const fakeGlobalHelmPath: string = `${fakeGlobalBinDirectory}/helm`;
      const originalPath: string = process.env.PATH ?? '';
      process.env.PATH = `${fakeGlobalBinDirectory}${path.delimiter}${originalPath}`;
      sandbox.stub(fs, 'accessSync').callsFake((filePath: Parameters<typeof fs.accessSync>[0]): void => {
        if (String(filePath) === fakeGlobalHelmPath) {
          return;
        }
        throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'});
      });
      runStub.withArgs(fakeGlobalHelmPath, ['version', '--short']).resolves(['v0.1.0+gabcdef']);

      try {
        // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
        const result: boolean = await helmDependencyManager.isInstalledGloballyAndMeetsRequirements();
        expect(result).to.be.false;

        expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(fs.existsSync(PathEx.join(temporaryDirectory, 'helm'))).to.be.ok;
        expect(await helmDependencyManager.getExecutable()).to.equal(PathEx.join(temporaryDirectory, constants.HELM));
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
});
