// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {TestChartOptions} from '../../../../../src/core/helm/model/test/TestChartOptions.js';
import {ChartTestRequest} from '../../../../../src/core/helm/request/chart/ChartTestRequest.js';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';

describe('ChartTestRequest Tests', () => {
  it('Test ChartTestRequest constructor validation', () => {
    // Should not throw with valid parameters
    expect(() => new ChartTestRequest('apache')).to.not.throw();
    expect(() => new ChartTestRequest('apache', TestChartOptions.defaults())).to.not.throw();

    // Should throw with invalid parameters
    expect(() => new ChartTestRequest('')).to.throw('releaseName must not be blank');
    expect(() => new ChartTestRequest('  ')).to.throw('releaseName must not be blank');
    expect(() => new ChartTestRequest('apache', null as unknown as TestChartOptions)).to.throw(
      'options must not be null',
    );

    // Test with custom options
    const opts = TestChartOptions.builder().timeout('9m0s').filter('filter').build();

    const request = new ChartTestRequest('apache', opts);

    // Verify behavior through apply method
    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    request.apply(helmExecutionBuilderMock);

    expect(helmExecutionBuilderMock.subcommands).to.have.been.calledOnceWith('test');
    expect(helmExecutionBuilderMock.positional).to.have.been.calledOnceWith('apache');
  });
});
