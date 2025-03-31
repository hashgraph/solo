// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {ChartDependencyUpdateRequest} from '../../../../../src/integration/helm/request/chart/chart-dependency-update-request.js';

describe('ChartDependencyUpdateRequest Tests', () => {
  it('Verify ChartDependencyUpdateRequest apply', () => {
    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    const request = new ChartDependencyUpdateRequest('mocked');
    expect(request).to.not.be.null;
    expect(request.chartName).to.equal('mocked');

    request.apply(helmExecutionBuilderMock);

    expect(helmExecutionBuilderMock.subcommands).to.have.been.calledOnceWith('dependency', 'update');
    expect(helmExecutionBuilderMock.positional).to.have.been.calledOnceWith('mocked');
  });

  it('should throw error when chartName is blank', () => {
    expect(() => new ChartDependencyUpdateRequest('  ')).to.throw('chartName must not be blank');
  });
});
