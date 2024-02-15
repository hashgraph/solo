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
import { ShellRunner } from '../../../src/core/shell_runner.mjs'
import { NewLogger, Logger } from '../../../src/core/logging.mjs'
import { ChildProcess } from 'child_process'
import { Readable } from 'stream'

describe('ShellRunner', () => {
  const logger = NewLogger('debug')
  const shellRunner = new ShellRunner(logger)
  const loggerSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation()
  const childProcessSpy = jest.spyOn(ChildProcess.prototype, 'on')
  const readableSpy = jest.spyOn(Readable.prototype, 'on')

  it('should run command', async () => {
    await shellRunner.run('ls -l')
    expect(loggerSpy).toHaveBeenNthCalledWith(1, 'Executing command: \'ls -l\'')
    expect(loggerSpy).toHaveBeenNthCalledWith(2, 'Finished executing: \'ls -l\'', {
      commandExitCode: expect.any(Number),
      commandExitSignal: null,
      commandOutput: expect.any(Array),
      errOutput: expect.any(Array)
    })
    expect(readableSpy).toHaveBeenCalledWith('data', expect.anything())
    expect(childProcessSpy).toHaveBeenCalledWith('exit', expect.anything())
  })

  jest.clearAllMocks()
})
