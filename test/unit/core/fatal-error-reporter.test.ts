// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {FatalErrorReporter} from '../../../src/core/fatal-error-reporter.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';

describe('FatalErrorReporter', (): void => {
  let showUserError: SinonStub;
  let logger: SoloLogger;
  let standardErrorWrite: SinonStub;
  let originalExitCode: number | string | undefined;

  beforeEach((): void => {
    FatalErrorReporter.reset();
    showUserError = sinon.stub();
    logger = {showUserError} as unknown as SoloLogger;
    standardErrorWrite = sinon.stub(process.stderr, 'write').returns(true);
    originalExitCode = process.exitCode;
  });

  afterEach((): void => {
    sinon.restore();
    FatalErrorReporter.reset();
    process.exitCode = originalExitCode;
  });

  function reportedError(): SoloError {
    return showUserError.firstCall.args[0] as SoloError;
  }

  it('should render the first escaped error through the logger as a coded error', (): void => {
    FatalErrorReporter.report(logger, 'uncaughtException', new Error('EACCES: permission denied, open solo.ndjson'));

    expect(showUserError).to.have.been.callCount(1);
    const error: SoloError = reportedError();
    expect(error).to.be.instanceOf(SoloError);
    expect(error.getFormattedCode()).to.equal('SOLO-9014');
    expect(error.getDocumentUrl()).to.equal('https://solo.hiero.org/docs/troubleshooting/errors/internal/SOLO-9014/');
  });

  it('should surface the escaped error message rather than discarding it', (): void => {
    FatalErrorReporter.report(logger, 'uncaughtException', new Error('EACCES: permission denied, open solo.ndjson'));

    const error: SoloError = reportedError();
    expect(error.message).to.include('uncaughtException');
    expect(error.message).to.include('EACCES: permission denied, open solo.ndjson');
    expect(error.cause).to.be.instanceOf(Error);
  });

  it('should mark the process as failed', (): void => {
    process.exitCode = 0;
    FatalErrorReporter.report(logger, 'uncaughtException', new Error('boom'));
    expect(process.exitCode).to.equal(1);
  });

  it('should bound logger use, so a failing logger cannot drive a report loop', (): void => {
    for (let index: number = 0; index < 25; index++) {
      FatalErrorReporter.report(logger, 'uncaughtException', new Error(`boom ${index}`));
    }

    expect(showUserError).to.have.been.callCount(3);
    expect(standardErrorWrite).to.have.been.callCount(22);
    expect(String(standardErrorWrite.lastCall.args[0])).to.include('unhandled uncaughtException');
  });

  it('should render a second, distinct failure in full rather than reducing it to one line', (): void => {
    // A long run can hit genuinely unrelated fatal errors; the bound exists to stop a loop, not to
    // discard the code and remediation of the second real failure while the logger is still healthy.
    FatalErrorReporter.report(logger, 'uncaughtException', new Error('first failure'));
    FatalErrorReporter.report(logger, 'unhandledRejection', new Error('unrelated second failure'));

    expect(showUserError).to.have.been.callCount(2);
    expect((showUserError.secondCall.args[0] as SoloError).message).to.include('unrelated second failure');
    expect(standardErrorWrite).to.have.been.callCount(0);
  });

  it('should render again after a reset, so one run does not silence the next', (): void => {
    // main() resets per invocation; the end-to-end tests call it many times in a single process.
    for (let index: number = 0; index < 4; index++) {
      FatalErrorReporter.report(logger, 'uncaughtException', new Error(`first run ${index}`));
    }
    expect(showUserError).to.have.been.callCount(3);

    FatalErrorReporter.reset();
    FatalErrorReporter.report(logger, 'uncaughtException', new Error('second run'));

    expect(showUserError).to.have.been.callCount(4);
    expect((showUserError.lastCall.args[0] as SoloError).message).to.include('second run');
  });

  it('should fall back to stderr when the logger itself throws', (): void => {
    showUserError.throws(new Error('EACCES: permission denied, open solo.ndjson'));

    expect((): void => FatalErrorReporter.report(logger, 'uncaughtException', new Error('boom'))).to.not.throw();
    expect(standardErrorWrite).to.have.been.callCount(1);
    expect(String(standardErrorWrite.firstCall.args[0])).to.include('solo: unhandled uncaughtException: boom');
  });

  it('should handle an unhandledRejection whose reason is not an Error', (): void => {
    FatalErrorReporter.report(logger, 'unhandledRejection', 'plain string reason');

    const error: SoloError = reportedError();
    expect(error.message).to.include('unhandledRejection');
    expect(error.message).to.include('plain string reason');
  });

  it('should report a missing reason without throwing', (): void => {
    // Node can deliver a rejection with no reason at all; the reporter must still render something.
    const noReason: unknown = undefined;
    expect((): void => FatalErrorReporter.report(logger, 'unhandledRejection', noReason)).to.not.throw();

    const error: SoloError = reportedError();
    expect(error.message).to.equal('Unhandled unhandledRejection');
  });
});
