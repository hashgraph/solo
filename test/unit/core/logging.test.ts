/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import 'sinon-chai'

import sinon, { SinonSpy } from 'sinon'
import { expect } from 'chai'
import { describe, it, afterEach, beforeEach } from 'mocha'

import { NewLogger, SoloLogger } from '../../../src/core/logging.ts'
import winston from 'winston'

describe('Logging', () => {
  let logger: SoloLogger
  let loggerSpy: SinonSpy

  beforeEach(() => {
    logger = NewLogger('debug')
    loggerSpy = sinon.spy(winston.Logger.prototype, 'log')
  })

  // Cleanup after each test
  afterEach(() => sinon.restore())

  it('should log at correct severity', () => {
    expect(logger).to.be.instanceof(SoloLogger)
    expect(logger).to.be.not.undefined
    const meta = logger.prepMeta()

    logger.error('Error log')
    expect(loggerSpy).to.have.been.calledWith('error', 'Error log', meta)

    logger.warn('Warn log')
    expect(loggerSpy).to.have.been.calledWith('warn', 'Warn log', meta)

    logger.info('Info log')
    expect(loggerSpy).to.have.been.calledWith('info', 'Info log', meta)

    logger.debug('Debug log')
    expect(loggerSpy).to.have.been.calledWith('debug', 'Debug log', meta)
  })
})
