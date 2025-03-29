// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from '../../../../../src/integration/helm/execution/helm-execution.js';
import {HelmExecutionException} from '../../../../../src/integration/helm/helm-execution-exception.js';
import {HelmParserException} from '../../../../../src/integration/helm/helm-parser-exception.js';
import {Repository} from '../../../../../src/integration/helm/model/repository.js';
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
