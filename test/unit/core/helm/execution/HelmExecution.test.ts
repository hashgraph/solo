// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from '../../../../../src/core/helm/execution/HelmExecution.js';
import {HelmExecutionException} from '../../../../../src/core/helm/HelmExecutionException.js';
import {HelmParserException} from '../../../../../src/core/helm/HelmParserException.js';
import {Repository} from '../../../../../src/core/helm/model/Repository.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {expect} from 'chai';
import sinon from 'sinon';

describe('HelmExecution', () => {
  let helmExecution: sinon.SinonStubbedInstance<HelmExecution>;

  beforeEach(() => {
    helmExecution = sinon.createStubInstance(HelmExecution);
    // Set up the stub to throw an error with the expected message
    helmExecution.callTimeout.rejects(new HelmExecutionException(1, 'Process exited with code 1', '', ''));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('Test call with timeout throws exception and logs warning message', async () => {
    const timeout = Duration.ofMillis(1000);

    try {
      await helmExecution.callTimeout(timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmExecutionException);
      expect(error.message).to.contain('Execution of the Helm command failed with exit code: 1');
    }
  });

  it('Test response as list throws exception and logs warning message', async () => {
    const timeout = Duration.ofMillis(1000);
    try {
      await helmExecution.responseAsListTimeout(Repository, timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
      expect(error.message).to.contain('Failed to deserialize the output into a list of the specified class');
    }
  });

  it('Test response as throws exception and logs warning message', async () => {
    const timeout = Duration.ofMillis(1000);
    try {
      await helmExecution.responseAsTimeout(Repository, timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
      expect(error.message).to.contain('Failed to deserialize the output into the specified class');
    }
  });
});
