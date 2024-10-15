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
import { describe, it, beforeEach, afterEach } from 'mocha'
import { ShellRunner } from '../../../src/core/shell_runner'
import { NewLogger, SoloLogger } from '../../../src/core/logging'
import { ChildProcess } from 'child_process'
import { Readable } from 'stream'
import { SECONDS } from '../../../src/core/constants'

describe('ShellRunner', () => {
  let logger, shellRunner, loggerStub, childProcessSpy, readableSpy

  beforeEach(() => {
    logger = NewLogger('debug')
    shellRunner = new ShellRunner(logger)

    // Spy on methods
    loggerStub = sinon.stub(SoloLogger.prototype, 'debug')
    childProcessSpy = sinon.spy(ChildProcess.prototype, 'on')
    readableSpy = sinon.spy(Readable.prototype, 'on')
  })

  afterEach(() => sinon.restore())

  it('should run command', async () => {
    await shellRunner.run('ls -l')

    loggerStub.withArgs('Executing command: \'ls -l\'').onFirstCall()
    loggerStub.withArgs('Finished executing: \'ls -l\'', sinon.match.any).onSecondCall()

    expect(loggerStub).to.have.been.calledTwice

    expect(readableSpy).to.have.been.calledWith('data', sinon.match.any)
    expect(childProcessSpy).to.have.been.calledWith('exit', sinon.match.any)
  }).timeout(10 * SECONDS)
})
