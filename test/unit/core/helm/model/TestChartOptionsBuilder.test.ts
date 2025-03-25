// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/HelmExecutionBuilder.js';
import {TestChartOptionsBuilder} from '../../../../../src/integration/helm/model/test/TestChartOptionsBuilder.js';

describe('TestChartOptionsBuilder Tests', () => {
  it('Test TestChartOptionsBuilder', () => {
    const options = TestChartOptionsBuilder.builder().filter('filter').timeout('timeout').build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.timeout).to.equal('timeout');
    expect(options.filter).to.equal('filter');

    // Test apply method with mock
    const builderMock = {
      argument: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    options.apply(builderMock);

    // Verify mock interactions
    expect(builderMock.argument).to.have.been.calledTwice;
    expect(builderMock.argument).to.have.been.calledWith('timeout', 'timeout');
    expect(builderMock.argument).to.have.been.calledWith('filter', 'filter');
  });
});
