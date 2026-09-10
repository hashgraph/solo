// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {
  type AardvarkDnsDependencyManager,
  type NetavarkDependencyManager,
} from '../../../../src/core/dependency-managers/index.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../src/core/constants.js';

describe('PodmanNetworkHelperDependencyManager', (): void => {
  let netavarkDependencyManager: NetavarkDependencyManager;
  let aardvarkDnsDependencyManager: AardvarkDnsDependencyManager;

  beforeEach((): void => {
    resetForTest();
    netavarkDependencyManager = container.resolve<NetavarkDependencyManager>(InjectTokens.NetavarkDependencyManager);
    aardvarkDnsDependencyManager = container.resolve<AardvarkDnsDependencyManager>(
      InjectTokens.AardvarkDnsDependencyManager,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('shouldInstall', (): void => {
    it('should install the helpers only on Linux, where podman runs rootfully', async (): Promise<void> => {
      const isLinuxStub: sinon.SinonStub = sinon.stub(OperatingSystem, 'isLinux');

      isLinuxStub.returns(true);
      expect(await netavarkDependencyManager.shouldInstall()).to.be.true;
      expect(await aardvarkDnsDependencyManager.shouldInstall()).to.be.true;

      isLinuxStub.returns(false);
      expect(await netavarkDependencyManager.shouldInstall()).to.be.false;
      expect(await aardvarkDnsDependencyManager.shouldInstall()).to.be.false;
    });
  });

  describe('processDownloadedPackage', (): void => {
    it('should decompress the gzipped release asset to the helper binary name', async (): Promise<void> => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-netavark-test-'));
      const packageFilePath: string = PathEx.join(temporaryDirectory, 'netavark.gz');
      const binaryContent: string = 'netavark-binary-content';
      fs.writeFileSync(packageFilePath, zlib.gzipSync(Buffer.from(binaryContent)));

      try {
        const processedFiles: string[] = await netavarkDependencyManager['processDownloadedPackage'](
          packageFilePath,
          temporaryDirectory,
        );

        // The implementation names the file after executableName, which carries .exe on Windows.
        const expectedFileName: string = netavarkDependencyManager['executableName'];
        expect(expectedFileName).to.contain(constants.NETAVARK);
        expect(processedFiles).to.deep.equal([PathEx.join(temporaryDirectory, expectedFileName)]);
        expect(fs.readFileSync(processedFiles[0], 'utf8')).to.equal(binaryContent);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });
  });
});
