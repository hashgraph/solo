// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub, type SinonFakeTimers} from 'sinon';
import {EventEmitter} from 'node:events';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {OneShotState} from '../../../../src/core/one-shot-state.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloError} from '../../../../src/core/errors/solo-error.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as constants from '../../../../src/core/constants.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

function lineLogged(stub: SinonStub, substring: string): boolean {
  return stub.getCalls().some((call): boolean => String(call.args[0]).includes(substring));
}

// Minimal writable-like stub matching what flush() touches: `.end()` and the 'close' event.
// EventEmitter (not EventTarget) is required — the code under test uses `.once()`/`.emit()`.
type FakeStream = EventEmitter & {end: SinonStub};

function createFakeStream(): FakeStream {
  // eslint-disable-next-line unicorn/prefer-event-target
  return Object.assign(new EventEmitter(), {end: sinon.stub()}) as FakeStream;
}

// Typed view over the private members flush() and the constructor manage.
type LoggerInternals = {
  rotatingStreams: FakeStream[];
  pinoLogger: {flush: (callback: (error?: Error) => void) => void};
};

function internalsOf(logger: SoloPinoLogger): LoggerInternals {
  return logger as unknown as LoggerInternals;
}

describe('SoloPinoLogger user-facing output', (): void => {
  let oneShotState: OneShotState;
  let logger: SoloPinoLogger;
  let consoleLogStub: SinonStub;
  let debugStub: SinonStub;

  beforeEach((): void => {
    oneShotState = new OneShotState();
    logger = new SoloPinoLogger('debug', true, oneShotState);
    consoleLogStub = sinon.stub(console, 'log');
    // Avoid touching the pino transports for the structured-log assertions.
    debugStub = sinon.stub(logger, 'debug');
    sinon.stub(logger, 'info');
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('showUserUnlessOneShot', (): void => {
    it('writes to the terminal when one-shot mode is inactive', (): void => {
      oneShotState.deactivate();

      logger.showUserUnlessOneShot('hello');

      expect(consoleLogStub.calledOnceWithExactly('hello')).to.be.true;
      expect(debugStub.called).to.be.false;
    });

    it('routes to the structured log only when one-shot mode is active', (): void => {
      oneShotState.activate();

      logger.showUserUnlessOneShot('hello');

      expect(consoleLogStub.called).to.be.false;
      expect(debugStub.calledOnceWithExactly('hello')).to.be.true;
    });
  });

  describe('deferred user output', (): void => {
    it('buffers terminal output between begin and flush', (): void => {
      logger.beginDeferredUserOutput();

      logger.showUser('first');
      logger.showUser('second');

      expect(consoleLogStub.called).to.be.false;

      logger.flushDeferredUserOutput();

      expect(consoleLogStub.callCount).to.equal(2);
      expect(consoleLogStub.firstCall.args).to.deep.equal(['first']);
      expect(consoleLogStub.secondCall.args).to.deep.equal(['second']);
    });

    it('does not discard buffered output when begin is called twice (`??=` guard)', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('buffered');
      logger.beginDeferredUserOutput();

      logger.flushDeferredUserOutput();

      expect(consoleLogStub.calledOnceWithExactly('buffered')).to.be.true;
    });

    it('clears the buffer on flush so a second flush is a no-op', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('once');

      logger.flushDeferredUserOutput();
      expect(consoleLogStub.callCount).to.equal(1);

      logger.flushDeferredUserOutput();
      expect(consoleLogStub.callCount).to.equal(1);
    });

    it('resumes immediate terminal output after a flush', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('buffered');
      logger.flushDeferredUserOutput();
      consoleLogStub.resetHistory();

      logger.showUser('immediate');

      expect(consoleLogStub.calledOnceWithExactly('immediate')).to.be.true;
    });
  });

  describe('showList', (): void => {
    it('renders the `[ None ]` empty state for an empty list', (): void => {
      logger.showList('Some Title', []);

      expect(lineLogged(consoleLogStub, 'Some Title')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.true;
    });

    it('renders the items for a non-empty list', (): void => {
      logger.showList('Some Title', ['alpha', 'beta']);

      expect(lineLogged(consoleLogStub, 'alpha')).to.be.true;
      expect(lineLogged(consoleLogStub, 'beta')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.false;
    });
  });

  describe('showListIfNotEmpty', (): void => {
    it('renders nothing for an empty list', (): void => {
      logger.showListIfNotEmpty('Some Title', []);

      expect(consoleLogStub.called).to.be.false;
    });

    it('renders the list (without `[ None ]`) for a non-empty list', (): void => {
      logger.showListIfNotEmpty('Some Title', ['alpha']);

      expect(lineLogged(consoleLogStub, 'Some Title')).to.be.true;
      expect(lineLogged(consoleLogStub, 'alpha')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.false;
    });
  });

  describe('showUserError troubleshooting steps', (): void => {
    it('shows the steps of the deepest SoloError in the cause chain', (): void => {
      const nonDevelopmentLogger: SoloPinoLogger = new SoloPinoLogger('debug', false, oneShotState);
      const relayError: SoloError = new SoloErrors.component.relayDeployFailed(new Error('image pull failed'));
      const oneShotError: SoloError = new SoloErrors.component.oneShotDeployFailed(
        `Deploy failed: ${relayError.message}`,
        relayError,
      );

      nonDevelopmentLogger.showUserError(oneShotError);

      expect(lineLogged(consoleLogStub, 'Deploy failed:')).to.be.true;
      expect(lineLogged(consoleLogStub, 'Inspect relay pods')).to.be.true;
      expect(lineLogged(consoleLogStub, 'one-shot single destroy')).to.be.false;
    });

    it('falls back to the top-level error steps when no cause carries steps', (): void => {
      const nonDevelopmentLogger: SoloPinoLogger = new SoloPinoLogger('debug', false, oneShotState);
      const oneShotError: SoloError = new SoloErrors.component.oneShotDeployFailed(
        'Deploy failed: boom',
        new Error('boom'),
      );

      nonDevelopmentLogger.showUserError(oneShotError);

      expect(lineLogged(consoleLogStub, 'clean up partial resources')).to.be.true;
    });
  });
});

describe('SoloPinoLogger flush', (): void => {
  let originalCi: string | undefined;
  let logger: SoloPinoLogger;
  let internals: LoggerInternals;
  let infoStub: SinonStub;

  beforeEach((): void => {
    originalCi = process.env.CI;
    // Force the CI branch so the constructor leaves `rotatingStreams` empty and opens no real files;
    // the rotating-stream tests then inject fakes explicitly.
    process.env.CI = 'true';
    logger = new SoloPinoLogger('debug', true, new OneShotState());
    internals = internalsOf(logger);
    // flush() logs an info line first; keep it off the real pino destinations.
    infoStub = sinon.stub(logger, 'info');
  });

  afterEach((): void => {
    sinon.restore();
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
  });

  it('logs a flushing message before draining', (): void => {
    logger.flush((): void => {});

    expect(infoStub.calledWith('Flushing logs and exiting...')).to.be.true;
  });

  it('delegates to pino.flush when there are no rotating streams', (): void => {
    expect(internals.rotatingStreams).to.have.lengthOf(0);
    const pinoFlushStub: SinonStub = sinon.stub(internals.pinoLogger, 'flush');
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);

    expect(pinoFlushStub.calledOnceWithExactly(callback)).to.be.true;
    // The callback is pino's responsibility on this path; flush() must not invoke it itself.
    expect(callback.called).to.be.false;
  });

  it('ends every rotating stream and invokes the callback only after all have closed', (): void => {
    const first: FakeStream = createFakeStream();
    const second: FakeStream = createFakeStream();
    internals.rotatingStreams.push(first, second);
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);

    // Both streams are asked to drain and each has a single 'close' listener registered.
    expect(first.end.calledOnce).to.be.true;
    expect(second.end.calledOnce).to.be.true;
    expect(first.listenerCount('close')).to.equal(1);
    expect(second.listenerCount('close')).to.equal(1);

    first.emit('close');
    // One stream still open — the callback must wait.
    expect(callback.called).to.be.false;

    second.emit('close');
    expect(callback.calledOnce).to.be.true;
  });

  it('invokes the callback exactly once even if a stream emits close more than once', (): void => {
    const stream: FakeStream = createFakeStream();
    internals.rotatingStreams.push(stream);
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);
    stream.emit('close');
    stream.emit('close');

    expect(callback.calledOnce).to.be.true;
  });

  describe('with fake timers', (): void => {
    let clock: SinonFakeTimers;

    beforeEach((): void => {
      clock = sinon.useFakeTimers();
    });

    afterEach((): void => {
      clock.restore();
    });

    it('invokes the callback via the safety timeout when a stream never closes', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      expect(callback.called).to.be.false;

      clock.tick(2000);

      expect(callback.calledOnce).to.be.true;
    });

    it('does not invoke the callback a second time when a stream closes after the timeout fired', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      clock.tick(2000);
      expect(callback.calledOnce).to.be.true;

      // A late 'close' after the timeout already settled must be ignored.
      stream.emit('close');

      expect(callback.calledOnce).to.be.true;
    });

    it('does not fire the safety timeout again after all streams closed normally', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      stream.emit('close');
      expect(callback.calledOnce).to.be.true;

      clock.tick(2000);

      expect(callback.calledOnce).to.be.true;
    });
  });
});

describe('SoloPinoLogger stream configuration', (): void => {
  let originalCi: string | undefined;

  beforeEach((): void => {
    originalCi = process.env.CI;
  });

  afterEach((): void => {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
    sinon.restore();
  });

  it('registers rotating streams for flushing outside CI', (): void => {
    delete process.env.CI;
    const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState());

    const internals: LoggerInternals = internalsOf(logger);
    // One NDJSON stream and one pretty stream are tracked for draining on exit.
    expect(internals.rotatingStreams).to.have.lengthOf(2);

    for (const stream of internals.rotatingStreams) {
      stream.end();
    }
  });

  it('tracks no streams to drain in CI (destinations are synchronous)', (): void => {
    process.env.CI = 'true';
    const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState());

    expect(internalsOf(logger).rotatingStreams).to.have.lengthOf(0);
  });
});

describe('SoloPinoLogger log destination', (): void => {
  let temporaryDirectory: string;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-pino-logger-home-'));
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('creates its log files owner-only so other users cannot read them', (): void => {
    if (process.platform === 'win32') {
      return; // POSIX mode bits are not used on Windows; the e2e suite skips this check too.
    }
    // Exercises the synchronous CI destination so the files exist by the time the assertions run;
    // the rotating stream used outside CI is configured with the same mode.
    const originalCi: string | undefined = process.env.CI;
    process.env.CI = 'true';
    try {
      const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState(), temporaryDirectory);
      logger.error('permission regression check');

      const logsDirectory: string = path.join(temporaryDirectory, 'logs');
      expect(fs.statSync(logsDirectory).mode & 0o777).to.equal(0o700);
      const logFiles: string[] = fs.readdirSync(logsDirectory);
      expect(logFiles).to.include('solo.log');
      for (const logFile of logFiles) {
        const mode: number = fs.statSync(path.join(logsDirectory, logFile)).mode & 0o777;
        // Same rule the e2e SOLO_HOME check applies: no group-write and no "other" access. Solo logs
        // command lines and Kubernetes responses, so world-readable log files leak them.
        expect(mode & 0o027, `${logFile} is 0${mode.toString(8)}`).to.equal(0);
      }
    } finally {
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });

  it('writes its log files under the supplied home directory, not the real Solo home', (): void => {
    const realLogPath: string = PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log');
    const sizeBefore: number = fs.existsSync(realLogPath) ? fs.statSync(realLogPath).size : -1;

    const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState(), temporaryDirectory);
    logger.error('destination regression check');

    // The constructor creates the destination directory eagerly; the log files themselves are opened
    // lazily by the rotating stream, so only the directory is asserted here.
    const logsDirectory: string = path.join(temporaryDirectory, 'logs');
    expect(fs.existsSync(logsDirectory)).to.be.true;
    // Guards against the logger hardcoding constants.SOLO_LOGS_DIR, which made every unit test that
    // logs an error append to the user's own ~/.solo/logs/solo.log.
    expect(path.resolve(logsDirectory)).to.not.equal(path.resolve(constants.SOLO_LOGS_DIR));
    const sizeAfter: number = fs.existsSync(realLogPath) ? fs.statSync(realLogPath).size : -1;
    expect(sizeAfter).to.equal(sizeBefore);
  });
});
