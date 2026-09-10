// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {NpmClient} from '../../../../src/integration/npm/npm-client.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';

describe('NpmClient', (): void => {
  let npmClient: NpmClient;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    npmClient = new NpmClient();
    shellRunnerRunStub = sinon.stub(ShellRunner.prototype, 'run');
  });

  afterEach((): void => sinon.restore());

  describe('listGlobal', (): void => {
    it('should call npm list with global and depth=0 flags', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isWin32').returns(false);
      shellRunnerRunStub.resolves([]);

      await npmClient.listGlobal();

      expect(shellRunnerRunStub).to.have.been.calledOnceWith('npm', ['list', '--global', '--depth=0']);
    });

    it('should spawn npm through a shell on Windows, where npm is a .cmd batch file', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isWin32').returns(true);
      shellRunnerRunStub.resolves([]);

      await npmClient.listGlobal();

      expect(shellRunnerRunStub).to.have.been.calledOnceWith(
        'npm',
        ['list', '--global', '--depth=0'],
        sinon.match.has('useShell', true),
      );
    });

    it('should spawn npm without a shell on other platforms', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isWin32').returns(false);
      shellRunnerRunStub.resolves([]);

      await npmClient.listGlobal();

      expect(shellRunnerRunStub).to.have.been.calledOnceWith(
        'npm',
        ['list', '--global', '--depth=0'],
        sinon.match.has('useShell', false),
      );
    });

    it('should return the lines from npm list output', async (): Promise<void> => {
      const expectedLines: string[] = ['/usr/local/lib', '├── @hashgraph/solo@0.61.0', '└── npm@10.9.2'];
      shellRunnerRunStub.resolves(expectedLines);

      const result: string[] = await npmClient.listGlobal();

      expect(result).to.deep.equal(expectedLines);
    });

    it('should propagate errors thrown by ShellRunner', async (): Promise<void> => {
      shellRunnerRunStub.rejects(new Error('npm not found'));

      await expect(npmClient.listGlobal()).to.be.rejectedWith('npm not found');
    });
  });
});
