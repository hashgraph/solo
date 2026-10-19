// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {type SinonSpy, type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {ShellRunner} from '../../../src/core/shell-runner.js';
import {ChildProcess} from 'node:child_process';
import {Readable} from 'node:stream';
import {Duration} from '../../../src/core/time/duration.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';

describe('ShellRunner', (): void => {
  let shellRunner: ShellRunner,
    loggerDebugStub: SinonStub,
    loggerInfoStub: SinonStub,
    loggerShowUserStub: SinonStub,
    childProcessSpy: SinonSpy,
    readableSpy: SinonSpy;

  beforeEach((): void => {
    shellRunner = new ShellRunner();

    // Spy on methods
    loggerDebugStub = sinon.stub(SoloPinoLogger.prototype, 'debug');
    loggerInfoStub = sinon.stub(SoloPinoLogger.prototype, 'info');
    loggerShowUserStub = sinon.stub(SoloPinoLogger.prototype, 'showUser');
    childProcessSpy = sinon.spy(ChildProcess.prototype, 'on');
    readableSpy = sinon.spy(Readable.prototype, 'on');
  });

  afterEach((): void => sinon.restore());

  it('should run command', async (): Promise<void> => {
    await shellRunner.run('node', ['-e', "console.log('hello')"]);

    expect(loggerDebugStub).to.have.been.calledOnce;
    expect(loggerInfoStub).to.have.been.calledOnce;

    expect(readableSpy).to.have.been.calledWith('data', sinon.match.any);
    expect(childProcessSpy).to.have.been.calledWith('exit', sinon.match.any);
  }).timeout(Duration.ofSeconds(10).toMillis());

  it('should complete successfully within timeout', async (): Promise<void> => {
    const result: string[] = await shellRunner.run('node', ['-e', "console.log('hello')"], {timeoutMs: 10_000});
    expect(result).to.include('hello');
  }).timeout(Duration.ofSeconds(15).toMillis());

  it('should reject with timeout error when command exceeds timeoutMs', async (): Promise<void> => {
    const timeoutMs: number = 500;

    await expect(shellRunner.run('node', ['-e', 'setTimeout(()=>{}, 10000)'], {timeoutMs})).to.be.rejectedWith(
      `Command timed out after ${timeoutMs}ms`,
    );
  }).timeout(Duration.ofSeconds(10).toMillis());

  it('should stream output when verbose mode is enabled', async (): Promise<void> => {
    await shellRunner.run('node', ['-e', "console.log('verbose-output')"], {verbose: true});

    expect(loggerShowUserStub).to.have.been.calledWith('verbose-output');
  }).timeout(Duration.ofSeconds(10).toMillis());

  it('should reject when command is idle with no output', async (): Promise<void> => {
    const idleTimeoutMs: number = 500;

    await expect(
      shellRunner.run('node', ['-e', 'setTimeout(()=>{}, 10000)'], {timeoutMs: 10_000, idleTimeoutMs}),
    ).to.be.rejectedWith(`Command produced no output for ${idleTimeoutMs}ms`);
  }).timeout(Duration.ofSeconds(10).toMillis());

  describe('redactArguments', (): void => {
    it('should redact --password and its value', (): void => {
      const arguments_: string[] = ['--password', 'mySecret'];
      const redacted: string[] = ShellRunner.redactArguments(arguments_);
      expect(redacted).to.deep.equal(['--password', '******']);
    });

    it('should redact -p and its value', (): void => {
      const arguments_: string[] = ['-p', 'mySecret'];
      const redacted: string[] = ShellRunner.redactArguments(arguments_);
      expect(redacted).to.deep.equal(['-p', '******']);
    });

    it('should redact -P and its space-containing value', (): void => {
      const arguments_: string[] = ['-rX', '-P', 'my Zip Secret', 'backup.zip', '.'];
      const redacted: string[] = ShellRunner.redactArguments(arguments_);
      expect(redacted).to.deep.equal(['-rX', '-P', '******', 'backup.zip', '.']);
    });

    it('should redact sensitive key=value pairs', (): void => {
      const arguments_: string[] = [
        '--set',
        'global.password=mySecret',
        'some-token=abc',
        'my_key=123',
        'normal=value',
      ];
      const redacted: string[] = ShellRunner.redactArguments(arguments_);
      expect(redacted).to.deep.equal([
        '--set',
        'global.password=******',
        'some-token=******',
        'my_key=******',
        'normal=value',
      ]);
    });

    it('should not modify unrelated arguments', (): void => {
      const arguments_: string[] = ['--set', 'global.name=myApp', '--values', 'values.yaml'];
      const redacted: string[] = ShellRunner.redactArguments(arguments_);
      expect(redacted).to.deep.equal(['--set', 'global.name=myApp', '--values', 'values.yaml']);
    });

    it('should redact composite arguments', (): void => {
      const arguments_: string[] = [
        'helm',
        'upgrade',
        '--values values.yaml --set foo.bar=false --set foo.privateKey=0x123456 --set foo.bar.ALL_CAPS_KEY=0x123456 --set foo.bar.foo.bar.password=123456',
      ];

      const redacted: string[] = ShellRunner.redactArguments(arguments_);

      expect(redacted).to.deep.equal([
        'helm',
        'upgrade',
        '--values',
        'values.yaml',
        '--set',
        'foo.bar=false',
        '--set',
        'foo.privateKey=******',
        '--set',
        'foo.bar.ALL_CAPS_KEY=******',
        '--set',
        'foo.bar.foo.bar.password=******',
      ]);
    });
  });
});
