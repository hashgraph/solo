// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {type SinonSpy, type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {ShellRunner} from '../../../src/core/shell-runner.js';
import {SoloLogger} from '../../../src/core/logging.js';
import {ChildProcess} from 'child_process';
import {Readable} from 'stream';
import {Duration} from '../../../src/core/time/duration.js';

describe('ShellRunner', () => {
  let shellRunner: ShellRunner,
    loggerDebugStub: SinonStub,
    loggerInfoStub: SinonStub,
    childProcessSpy: SinonSpy,
    readableSpy: SinonSpy;

  beforeEach(() => {
    shellRunner = new ShellRunner();

    // Spy on methods
    loggerDebugStub = sinon.stub(SoloLogger.prototype, 'debug');
    loggerInfoStub = sinon.stub(SoloLogger.prototype, 'info');
    childProcessSpy = sinon.spy(ChildProcess.prototype, 'on');
    readableSpy = sinon.spy(Readable.prototype, 'on');
  });

  afterEach(() => sinon.restore());

  it('should run command', async () => {
    await shellRunner.run('ls -l');

    loggerInfoStub.withArgs("Executing command: 'ls -l'").onFirstCall();
    loggerDebugStub.withArgs("Finished executing: 'ls -l'", sinon.match.any).onFirstCall();

    expect(loggerDebugStub).to.have.been.calledOnce;
    expect(loggerInfoStub).to.have.been.calledOnce;

    expect(readableSpy).to.have.been.calledWith('data', sinon.match.any);
    expect(childProcessSpy).to.have.been.calledWith('exit', sinon.match.any);
  }).timeout(Duration.ofSeconds(10).toMillis());
});
