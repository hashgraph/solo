// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {main} from '../../src/index.js';
import {Container} from '../../src/core/dependency-injection/container-init.js';
import {SilentBreak} from '../../src/core/errors/silent-break.js';
import {SoloError} from '../../src/core/errors/solo-error.js';
import {SoloErrors} from '../../src/core/errors/solo-errors.js';

describe('main() container initialization failure', (): void => {
  let initialExitCode: number | string | undefined;
  let standardErrorWrite: SinonStub;

  beforeEach((): void => {
    initialExitCode = process.exitCode;
    standardErrorWrite = sinon.stub(process.stderr, 'write').returns(true);
  });

  afterEach((): void => {
    sinon.restore();
    process.exitCode = initialExitCode;
  });

  async function runExpectingBreak(): Promise<SilentBreak> {
    try {
      await main(['node', 'solo.ts', 'deployment', 'create']);
    } catch (error) {
      return error as SilentBreak;
    }
    throw new Error('expected main() to break out after an initialization failure');
  }

  it('marks the process as failed and breaks silently, having already reported', async (): Promise<void> => {
    sinon.stub(Container.getInstance(), 'init').throws(new Error('mkdir failed'));

    const thrown: SilentBreak = await runExpectingBreak();

    // A SilentBreak so the entrypoint does not render the same failure a second time.
    expect(thrown).to.be.instanceOf(SilentBreak);
    expect(process.exitCode).to.equal(1);
    // Nothing else can render it, so the failure went to stderr with its code and remediation.
    expect(standardErrorWrite.called).to.be.true;
  });

  it('keeps an already-coded failure intact rather than wrapping away its code', async (): Promise<void> => {
    const coded: SoloError = new SoloErrors.system.soloLogsDirectoryNotWritable('/locked/logs', new Error('EACCES'));
    sinon.stub(Container.getInstance(), 'init').throws(coded);

    const thrown: SilentBreak = await runExpectingBreak();

    // The cause is carried so programmatic callers — the entrypoint and the e2e suite — still reach the
    // code and troubleshooting steps instead of only the message string.
    expect(thrown.cause).to.equal(coded);
    expect((thrown.cause as SoloError).getFormattedCode()).to.equal('SOLO-5083');
    expect(String(standardErrorWrite.firstCall.args[0])).to.include('SOLO-5083');
  });

  it('wraps an uncoded failure so the user still gets a code', async (): Promise<void> => {
    sinon.stub(Container.getInstance(), 'init').throws(new Error('something unexpected'));

    const thrown: SilentBreak = await runExpectingBreak();

    expect(thrown.cause).to.be.instanceOf(SoloError);
    expect((thrown.cause as SoloError).getFormattedCode()).to.be.a('string');
  });
});
