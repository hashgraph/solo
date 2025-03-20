// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {Chart} from '../../../../../src/core/helm/model/Chart.js';
import {type InstallChartOptions} from '../../../../../src/core/helm/model/install/InstallChartOptions.js';
import {ChartInstallRequest} from '../../../../../src/core/helm/request/chart/ChartInstallRequest.js';
import {InstallChartOptionsBuilder} from '../../../../../src/core/helm/model/install/InstallChartOptionsBuilder.js';

describe('ChartInstallRequest Tests', () => {
  it('Test ChartInstallRequest Chart constructor validation', () => {
    const chart = new Chart('apache', 'bitnami/apache');
    const chartInstallRequest = new ChartInstallRequest('apache', chart);
    expect(chartInstallRequest.chart).to.equal(chart);
    expect(chartInstallRequest).to.not.be.null;
    expect(chartInstallRequest.releaseName).to.equal('apache');

    const opts = InstallChartOptionsBuilder.builder().timeout('9m0s').atomic(true).build();
    const nonDefaultOptRequest = new ChartInstallRequest('apache', chart, opts);

    expect(nonDefaultOptRequest.options).to.equal(opts);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(InstallChartOptionsBuilder.builder().build());
  });

  it('Test ChartInstallRequest apply with unqualified chart', () => {
    const installChartOptionsMock = {
      repo: sinon.stub().returns('mockedRepo'),
      apply: sinon.stub(),
    } as unknown as InstallChartOptions;

    const chartMock = {
      unqualified: sinon.stub().returns('mockedUnqualified'),
      qualified: sinon.stub().returns('mockedQualified'),
    } as unknown as Chart;

    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    const chartInstallRequest = new ChartInstallRequest('mocked', chartMock, installChartOptionsMock);

    // Verify request properties
    expect(chartInstallRequest).to.not.be.null;
    expect(chartInstallRequest.chart).to.not.be.null;
    expect(chartInstallRequest.chart).to.equal(chartMock);
    expect(chartInstallRequest.releaseName).to.equal('mocked');
    expect(chartInstallRequest.options).to.not.be.null;
    expect(chartInstallRequest.options).to.equal(installChartOptionsMock);

    // Setup mock behaviors
    (helmExecutionBuilderMock.positional as sinon.SinonStub)
      .withArgs('mocked')
      .returns(helmExecutionBuilderMock)
      .withArgs('mockedUnqualified')
      .returns(helmExecutionBuilderMock);

    // Execute the method under test
    chartInstallRequest.apply(helmExecutionBuilderMock);

    // Verify interactions
    expect(helmExecutionBuilderMock.subcommands).to.have.been.calledOnceWith('install');
    expect(installChartOptionsMock.apply).to.have.been.calledOnceWith(helmExecutionBuilderMock);
    expect(chartMock.unqualified).to.have.been.calledOnce;
    expect(helmExecutionBuilderMock.positional).to.have.been.calledTwice;
  });

  it('Test ChartInstallRequest apply with qualified chart', () => {
    const installChartOptionsMock = {
      repo: sinon.stub().returns(null),
      apply: sinon.stub(),
    } as unknown as InstallChartOptions;

    const chartMock = {
      unqualified: sinon.stub().returns('mockedUnqualified'),
      qualified: sinon.stub().returns('mockedQualified'),
    } as unknown as Chart;

    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    const chartInstallRequest = new ChartInstallRequest('mocked', chartMock, installChartOptionsMock);
    chartInstallRequest.apply(helmExecutionBuilderMock);

    expect(helmExecutionBuilderMock.subcommands).to.have.been.calledOnceWith('install');
    expect(installChartOptionsMock.apply).to.have.been.calledOnceWith(helmExecutionBuilderMock);
    expect(helmExecutionBuilderMock.positional).to.have.been.calledTwice;
  });
});
