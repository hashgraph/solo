// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'fs';
import path from 'path';
import {HelmDependencyManager} from '../../../../../src/core/dependency_managers/index.js';
import {getTestCacheDir, getTmpDir} from '../../../../test_util.js';
import * as version from '../../../../../version.js';

describe('HelmDependencyManager', () => {
  const tmpDir = path.join(getTmpDir(), 'bin');

  before(() => fs.mkdirSync(tmpDir));

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true});
    }
  });

  it('should return helm version', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, tmpDir);
    expect(helmDependencyManager.getHelmVersion()).to.equal(version.HELM_VERSION);
  });

  it('should be able to check when helm not installed', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, tmpDir);
    expect(helmDependencyManager.isInstalled()).not.to.be.ok;
  });

  it('should be able to check when helm is installed', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, tmpDir);
    fs.writeFileSync(helmDependencyManager.getHelmPath(), '');
    expect(helmDependencyManager.isInstalled()).to.be.ok;
  });

  // TODO: disabled until we can get this working again, broke during conversion from Jest to Mocha
  describe.skip('Helm Installation Tests', () => {
    each([
      // { osPlatform: 'linux',  osArch: 'x64' },
      // { osRelease: 'linux',  osArch: 'amd64' },
      // { osRelease: 'windows',  osArch: 'amd64' }
    ]).it('should be able to install helm base on os and architecture', async input => {
      const helmDependencyManager = new HelmDependencyManager(
        undefined,
        undefined,
        tmpDir,
        input.osPlatform,
        input.osArch,
      );

      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, {recursive: true});
      }

      helmDependencyManager.uninstall();
      expect(helmDependencyManager.isInstalled()).not.to.be.ok;

      expect(await helmDependencyManager.install(getTestCacheDir())).to.be.true;
      expect(helmDependencyManager.isInstalled()).to.be.ok;

      fs.rmSync(tmpDir, {recursive: true});
    });
  });
});
