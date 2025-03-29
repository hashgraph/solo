// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {platform, arch} from 'os';
import {existsSync} from 'fs';
import {execSync} from 'child_process';
import {SemanticVersion} from '../../../../../src/integration/helm/base/api/version/semantic-version.js';
import {HelmSoftwareLoader} from '../../../../../src/integration/helm/resource/helm-software-loader.js';

describe('Helm Software Loader Test', () => {
  const currentPlatform = platform();
  const currentArch = arch();

  const supportedPlatforms = {
    linux: ['x64', 'arm64'],
    darwin: ['x64', 'arm64'],
    win32: ['x64'],
  };

  const installHelmAndVerify = async () => {
    const helmPath = await HelmSoftwareLoader.getHelmExecutablePath();
    expect(helmPath).to.not.be.null;
    expect(existsSync(helmPath)).to.be.true;

    // Check if file is executable
    try {
      execSync(`test -x "${helmPath}"`, {stdio: 'ignore'});
    } catch (error) {
      expect.fail('Helm executable should be executable');
    }

    // Check filename
    const expectedFilename = currentPlatform === 'win32' ? 'helm.exe' : 'helm';
    expect(helmPath.endsWith(expectedFilename)).to.be.true;

    // Check version
    let helmVersion: string;
    try {
      helmVersion = execSync(`"${helmPath}" version --short`, {encoding: 'utf8'}).trim();
    } catch (error) {
      expect.fail('Failed to execute helm version command');
    }

    expect(helmVersion).to.not.be.empty;
    if (helmVersion.toLowerCase().startsWith('v')) {
      helmVersion = helmVersion.substring(1);
    }

    const actualVersion = SemanticVersion.parse(helmVersion);
    expect(actualVersion).to.not.be.null;
    expect(actualVersion.major).to.be.greaterThanOrEqual(3);
    expect(actualVersion.minor).to.be.greaterThanOrEqual(12);
    expect(actualVersion.patch).to.be.greaterThanOrEqual(0);
  };

  // Run tests only if current platform/arch is supported
  if (
    currentPlatform in supportedPlatforms &&
    supportedPlatforms[currentPlatform as keyof typeof supportedPlatforms].includes(currentArch)
  ) {
    it(`${currentPlatform}: Install Supported Helm Version`, async () => {
      await installHelmAndVerify();
    });
  }
});
