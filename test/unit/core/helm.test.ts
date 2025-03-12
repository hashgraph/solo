// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import each from 'mocha-each';

import * as constants from '../../../src/core/constants.js';
import {Helm} from '../../../src/core/helm.js';
import {Templates} from '../../../src/core/templates.js';
import {ShellRunner} from '../../../src/core/shell_runner.js';

describe('Helm platform specific tests', () => {
  each(['linux', 'windows', 'darwin']).describe('Helm on %s platform', osPlatform => {
    let helm: Helm, shellStub: sinon.SinonStub<[cmd: string, verbose?: boolean], Promise<string[]>>, helmPath: string;

    before(() => {
      helm = new Helm(osPlatform);
      helmPath = Templates.installationPath(constants.HELM, osPlatform);
    });

    // Stub the ShellRunner.prototype.run method for all tests
    beforeEach(() => {
      shellStub = sinon.stub(ShellRunner.prototype, 'run').resolves();
    });

    // Restore stubbed methods after each test
    afterEach(() => sinon.restore());

    it('should run helm install', async () => {
      await helm.install('arg');
      expect(shellStub).to.have.been.calledWith(`${helmPath} install arg`);
    });

    it('should run helm uninstall', async () => {
      await helm.uninstall('arg');
      expect(shellStub).to.have.been.calledWith(`${helmPath} uninstall arg`);
    });

    it('should run helm upgrade', async () => {
      await helm.upgrade('release', 'chart');
      expect(shellStub).to.have.been.calledWith(`${helmPath} upgrade release chart`);
    });

    it('should run helm list', async () => {
      await helm.list();
      expect(shellStub).to.have.been.calledWith(`${helmPath} list`);
    });

    it('should run helm dependency', async () => {
      await helm.dependency('update', 'chart');
      expect(shellStub).to.have.been.calledWith(`${helmPath} dependency update chart`);
    });

    it('should run helm repo', async () => {
      await helm.repo('add', 'name', 'url');
      expect(shellStub).to.have.been.calledWith(`${helmPath} repo add name url`);
    });
  });
});
