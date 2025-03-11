// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {type SinonSpy} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach, beforeEach} from 'mocha';

import {NewLogger, SoloLogger} from '../../../src/core/logging.js';
import winston from 'winston';

describe('Logging', () => {
  let logger: SoloLogger;
  let loggerSpy: SinonSpy;

  beforeEach(() => {
    logger = NewLogger('debug');
    loggerSpy = sinon.spy(winston.Logger.prototype, 'log');
  });

  // Cleanup after each test
  afterEach(() => sinon.restore());

  it('should log at correct severity', () => {
    expect(logger).to.be.instanceof(SoloLogger);
    expect(logger).to.be.not.undefined;
    const meta = logger.prepMeta();

    logger.error('Error log');
    expect(loggerSpy).to.have.been.calledWith('error', 'Error log', meta);

    logger.warn('Warn log');
    expect(loggerSpy).to.have.been.calledWith('warn', 'Warn log', meta);

    logger.info('Info log');
    expect(loggerSpy).to.have.been.calledWith('info', 'Info log', meta);

    logger.debug('Debug log');
    expect(loggerSpy).to.have.been.calledWith('debug', 'Debug log', meta);
  });
});
