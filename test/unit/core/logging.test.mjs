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
import { describe, expect, it, jest } from '@jest/globals'
import { NewLogger, Logger } from '../../../src/core/logging.mjs'
import winston from 'winston'

describe('Logging', () => {
  it('should log at correct severity', () => {
    const loggerSpy = jest.spyOn(winston.Logger.prototype, 'log').mockImplementation()
    const logger = NewLogger('debug')
    expect(logger).toBeInstanceOf(Logger)
    expect(logger).toBeDefined()
    const meta = logger.prepMeta()

    logger.error('Error log')
    expect(loggerSpy).toHaveBeenCalledWith('error', 'Error log', meta)

    logger.warn('Warn log')
    expect(loggerSpy).toHaveBeenCalledWith('warn', 'Warn log', meta)

    logger.info('Info log')
    expect(loggerSpy).toHaveBeenCalledWith('info', 'Info log', meta)

    logger.debug('Debug log')
    expect(loggerSpy).toHaveBeenCalledWith('debug', 'Debug log', meta)

    jest.clearAllMocks()
  })
})
