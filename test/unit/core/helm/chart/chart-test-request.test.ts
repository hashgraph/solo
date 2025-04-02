// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {ChartTestRequest} from '../../../../../src/integration/helm/request/chart/chart-test-request.js';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {TestChartOptionsBuilder} from '../../../../../src/integration/helm/model/test/test-chart-options-builder.js';

describe('ChartTestRequest Tests', () => {
  it('Test ChartTestRequest constructor validation', () => {
    // Should not throw with valid parameters
    expect(() => new ChartTestRequest('apache')).to.not.throw();
    expect(() => new ChartTestRequest('apache', TestChartOptionsBuilder.builder().build())).to.not.throw();

    // Test with custom options
    const options = TestChartOptionsBuilder.builder().timeout('9m0s').filter('filter').build();

    const nonDefaultOptRequest = new ChartTestRequest('apache', options);

    // Verify behavior through apply method
    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    expect(nonDefaultOptRequest.options).to.equal(options);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(TestChartOptionsBuilder.builder().build());
  });
});
