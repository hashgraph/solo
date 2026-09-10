// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloError} from '../../../src/core/errors/solo-error.js';
import {ResourceNotFoundError} from '../../../src/core/errors/classes/system/resource-not-found-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import {DataValidationError} from '../../../src/core/errors/classes/internal/data-validation-error.js';
import {RemoteConfigUnsupportedComponentError} from '../../../src/core/errors/classes/internal/remote-config-unsupported-component-error.js';
import {SdkPingFailedSoloError} from '../../../src/core/errors/classes/component/sdk-ping-failed-solo-error.js';
import {SdkClientNoHealthyNodesSoloError} from '../../../src/core/errors/classes/component/sdk-client-no-healthy-nodes-solo-error.js';
import {SdkErrorTranslator} from '../../../src/core/errors/sdk-error-translator.js';
import {SoloLogsDirectoryNotWritableSoloError} from '../../../src/core/errors/classes/system/solo-logs-directory-not-writable-solo-error.js';

describe('Errors', (): void => {
  const message: string = 'errorMessage';
  const cause: Error = new Error('cause');

  it('should construct correct SoloError', (): void => {
    const error: SoloError = new SoloError(message, cause);
    expect(error).to.be.instanceof(Error);
    expect(error.name).to.equal('SoloError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal(cause);
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct ResourceNotFoundError', (): void => {
    const resource: string = 'resource';
    const error: ResourceNotFoundError = new ResourceNotFoundError(resource);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('ResourceNotFoundError');
    expect(error.message).to.equal(`Resource not found: ${resource}`);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({resource});
  });

  it('should construct correct MissingArgumentError', (): void => {
    const error: MissingArgumentError = new MissingArgumentError(message);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('MissingArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct IllegalArgumentError', (): void => {
    const value: string = 'invalid argument';
    const error: IllegalArgumentError = new IllegalArgumentError(message, value);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('IllegalArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({value});
  });

  it('should construct correct DataValidationError', (): void => {
    const context: string = 'errorMessage';
    const expected: string = 'expected';
    const found: string = 'found';
    const error: DataValidationError = new DataValidationError(context, expected, found);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('DataValidationError');
    expect(error.message).to.equal(
      `Data validation failed: ${context} (expected: ${JSON.stringify(expected)}, found: ${JSON.stringify(found)})`,
    );
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({expected, found});
  });

  it('should report both Solo and schema versions in RemoteConfigUnsupportedComponentError', (): void => {
    const error: RemoteConfigUnsupportedComponentError = new RemoteConfigUnsupportedComponentError(
      'FutureComponent',
      '0.45.0',
      '0.40.1',
      9,
      8,
    );
    expect(error).to.be.instanceof(SoloError);
    expect(error.message).to.equal(
      "Unknown component type 'FutureComponent' in the remote config. " +
        'The config was written by Solo 0.45.0 (config schema v9); ' +
        'the running Solo is 0.40.1 (supports config schema up to v8)',
    );
    const steps: ReadonlyArray<string> = error.getTroubleshootingSteps();
    expect(steps.join('\n')).to.include('Upgrade this Solo to 0.45.0 or newer');
    expect(steps.join('\n')).to.not.include('bug');
  });

  it('should include the last consensus node platform status in SdkPingFailedSoloError', (): void => {
    const error: SdkPingFailedSoloError = new SdkPingFailedSoloError('127.0.0.1:30213', 5, cause, 'STARTING_UP');
    expect(error).to.be.instanceof(SoloError);
    expect(error.message).to.equal(
      'SDK ping to network node 127.0.0.1:30213 failed after 5 retries; last consensus node platform status: STARTING_UP',
    );
  });

  it('should translate the raw SDK "failed to find a healthy working node" error', (): void => {
    const sdkError: Error = new Error('failed to find a healthy working node');
    const translated: SoloError | undefined = SdkErrorTranslator.tryTranslate(sdkError);
    expect(translated).to.be.instanceof(SdkClientNoHealthyNodesSoloError);
    expect(translated.message).to.not.include('healthy working node');
    expect(translated.message).to.include('may still be ACTIVE');
    expect(translated.cause).to.equal(sdkError);
  });

  it('should translate the SDK error when buried in a cause chain', (): void => {
    const wrapped: SoloError = new SoloError(
      'relay deploy failed',
      new SoloError('account creation failed', new Error('failed to find a healthy working node')),
    );
    const translated: SoloError | undefined = SdkErrorTranslator.tryTranslate(wrapped);
    expect(translated).to.be.instanceof(SdkClientNoHealthyNodesSoloError);
    expect(translated.cause).to.equal(wrapped);
  });

  it('should not translate unrelated errors', (): void => {
    expect(SdkErrorTranslator.tryTranslate(new Error('something else'))).to.equal(undefined);
    expect(SdkErrorTranslator.tryTranslate('not an error')).to.equal(undefined);
  });

  describe('SoloLogsDirectoryNotWritableSoloError', (): void => {
    const logPath: string = '/home/user/.solo/logs';

    // This error is raised while the logger is being built, so it is reported without a logger and never
    // reaches the log file. If the errno is not in the message it is not observable at all, and the
    // remediation steps only fit EACCES.
    for (const [code, causeMessage, expectedDetail] of [
      ['EACCES', `EACCES: permission denied, access '${logPath}'`, 'EACCES: permission denied'],
      ['EROFS', `EROFS: read-only file system, mkdir '${logPath}'`, 'EROFS: read-only file system'],
      ['ENOSPC', `ENOSPC: no space left on device, mkdir '${logPath}'`, 'ENOSPC: no space left on device'],
    ] as [string, string, string][]) {
      it(`should surface ${code} in the message so the causes are distinguishable`, (): void => {
        const error: SoloLogsDirectoryNotWritableSoloError = new SoloLogsDirectoryNotWritableSoloError(
          logPath,
          new Error(causeMessage),
        );

        expect(error.message).to.equal(`Solo cannot write to its log destination: ${logPath}: ${expectedDetail}`);
        // The path is stated once, not repeated by the file system message's trailing syscall clause.
        expect(error.message.indexOf(logPath)).to.equal(error.message.lastIndexOf(logPath));
      });
    }

    it('should keep a cause message that is not in the file system shape whole', (): void => {
      const error: SoloLogsDirectoryNotWritableSoloError = new SoloLogsDirectoryNotWritableSoloError(
        logPath,
        new Error('stream closed unexpectedly'),
      );

      expect(error.message).to.equal(
        `Solo cannot write to its log destination: ${logPath}: stream closed unexpectedly`,
      );
    });

    it('should omit the detail entirely when there is no cause', (): void => {
      const error: SoloLogsDirectoryNotWritableSoloError = new SoloLogsDirectoryNotWritableSoloError(logPath);

      expect(error.message).to.equal(`Solo cannot write to its log destination: ${logPath}`);
    });
  });
});
