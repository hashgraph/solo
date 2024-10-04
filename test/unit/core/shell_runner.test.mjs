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
import sinon from 'sinon'
import { expect } from 'chai'
import { describe, it, afterEach, beforeEach } from 'mocha'

import { ShellRunner } from '../../../src/core/shell_runner.mjs'
import { NewLogger, SoloLogger } from '../../../src/core/logging.mjs'
import { ChildProcess } from 'child_process'
import { Readable } from 'stream'

describe('ShellRunner', () => {
  const logger = NewLogger('debug')
  const shellRunner = new ShellRunner(logger)
  /** @type {sinon.SinonSpy} */ let childProcessSpy
  /** @type {sinon.SinonSpy} */ let readableSpy
  /** @type {sinon.SinonSpy} */ let loggerSpy

  beforeEach(() => {
    childProcessSpy = sinon.spy(ChildProcess.prototype, 'on')
    readableSpy = sinon.spy(Readable.prototype, 'on')
    loggerSpy = sinon.spy(SoloLogger.prototype, 'debug')
  })

  // Restore the spies after each test
  afterEach(() => sinon.restore())

  it('should run command', async () => {
    await shellRunner.run('ls -l')
    expect(loggerSpy).to.have.been.calledWith(1, 'Executing command: \'ls -l\'')
    expect(loggerSpy).to.have.been.calledWith(2, 'Finished executing: \'ls -l\'', {
      commandExitCode: sinon.match.number,
      commandExitSignal: null,
      commandOutput: sinon.match.array,
      errOutput: sinon.match.array
    })
    expect(readableSpy).to.have.been.calledWith('data', sinon.match.any)
    expect(childProcessSpy).to.have.been.calledWith('exit', sinon.match.any)
  })
})
