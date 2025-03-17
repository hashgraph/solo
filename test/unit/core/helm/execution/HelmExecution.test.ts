// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from '../../../../../src/core/helm/execution/HelmExecution.js';
import {HelmExecutionException} from '../../../../../src/core/helm/HelmExecutionException.js';
import {HelmParserException} from '../../../../../src/core/helm/HelmParserException.js';
import {Repository} from '../../../../../src/core/helm/model/Repository.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {expect} from 'chai';
import sinon from 'sinon';
import * as child_process from 'child_process';

describe('HelmExecution', () => {
  let spawnStub: sinon.SinonStub;
  let stdoutMock: any;
  let stderrMock: any;

  beforeEach(() => {
    stdoutMock = {
      on: sinon.stub().callsArgWith(1, Buffer.from('')),
    };

    stderrMock = {
      on: sinon.stub().callsArgWith(1, Buffer.from('')),
    };

    spawnStub = sinon.stub(child_process, 'spawn');
    spawnStub.returns({
      stdout: stdoutMock,
      stderr: stderrMock,
      on: sinon.stub().callsArgWith(1, 0),
      exitCode: 0,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('Test call with timeout throws exception and logs warning message', async () => {
    spawnStub.returns({
      stdout: stdoutMock,
      stderr: stderrMock,
      on: sinon.stub().callsArgWith(1, 1),
      exitCode: 1,
    });

    const helmExecution = new HelmExecution(['helm', 'test'], '.', {});
    const timeout = Duration.ofMillis(1000);

    try {
      await helmExecution.callTimeout(timeout);
      throw new Error('Expected HelmExecutionException to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(HelmExecutionException);
      expect(error.message).to.contain('Process exited with code 1');
    }
  });

  it('Test response as list throws exception and logs warning message', async () => {
    spawnStub.returns({
      stdout: {
        on: sinon.stub().callsArgWith(1, Buffer.from('invalid json')),
      },
      stderr: stderrMock,
      on: sinon.stub().callsArgWith(1, 0),
      exitCode: 0,
    });

    const helmExecution = new HelmExecution(['helm', 'test'], '.', {});
    const timeout = Duration.ofMillis(1000);

    try {
      await helmExecution.responseAsListTimeout(Repository, timeout);
      throw new Error('Expected HelmParserException to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
      expect(error.message).to.contain('Failed to deserialize the output into a list of the specified class');
    }
  });

  it('Test response as throws exception and logs warning message', async () => {
    spawnStub.returns({
      stdout: {
        on: sinon.stub().callsArgWith(1, Buffer.from('invalid json')),
      },
      stderr: stderrMock,
      on: sinon.stub().callsArgWith(1, 0),
      exitCode: 0,
    });

    const helmExecution = new HelmExecution(['helm', 'test'], '.', {});
    const timeout = Duration.ofMillis(1000);

    try {
      await helmExecution.responseAsTimeout(Repository, timeout);
      throw new Error('Expected HelmParserException to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
      expect(error.message).to.contain('Failed to deserialize the output into the specified class');
    }
  });

  it('Test response as throws HelmExecutionException with standard error and standard out', async () => {
    const standardOutputMessage = 'standardOutput Message';
    const standardErrorMessage = 'standardError Message';

    spawnStub.returns({
      stdout: {
        on: sinon.stub().callsArgWith(1, Buffer.from(standardOutputMessage)),
      },
      stderr: {
        on: sinon.stub().callsArgWith(1, Buffer.from(standardErrorMessage)),
      },
      on: sinon.stub().callsArgWith(1, 1),
      exitCode: 1,
    });

    const helmExecution = new HelmExecution(['helm', 'test'], '.', {});
    const timeout = Duration.ofMillis(1000);

    try {
      await helmExecution.responseAsTimeout(Repository, timeout);
      throw new Error('Expected HelmExecutionException to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(HelmExecutionException);
      expect(error.message).to.contain('Process exited with code 1');
      expect(error.stdOut).to.contain(standardOutputMessage);
      expect(error.stdErr).to.contain(standardErrorMessage);
    }
  });
});
