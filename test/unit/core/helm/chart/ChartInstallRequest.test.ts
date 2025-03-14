// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {Chart} from '../../../../../src/core/helm/model/Chart.js';
import {InstallChartOptions} from '../../../../../src/core/helm/model/install/InstallChartOptions.js';
import {ChartInstallRequest} from '../../../../../src/core/helm/request/chart/ChartInstallRequest.js';

describe('ChartInstallRequest Tests', () => {
  it('Test ChartInstallRequest Chart constructor validation', () => {
    const chart = new Chart('apache', 'bitnami/apache');

    // Should not throw with valid parameters
    expect(() => new ChartInstallRequest('apache', chart)).to.not.throw();
    expect(() => new ChartInstallRequest('apache', chart, InstallChartOptions.defaults())).to.not.throw();

    // Should throw with invalid parameters
    expect(() => new ChartInstallRequest('', chart)).to.throw('releaseName must not be blank');
    expect(() => new ChartInstallRequest('  ', chart)).to.throw('releaseName must not be blank');
    expect(() => new ChartInstallRequest('apache', null as unknown as Chart)).to.throw('chart must not be null');
    expect(() => new ChartInstallRequest('apache', chart, null as unknown as InstallChartOptions)).to.throw(
      'options must not be null',
    );
  });

  it('Test ChartInstallRequest apply with unqualified chart', () => {
    const installChartOptionsMock = {
      repo: sinon.stub().returns('mockedRepo'),
      apply: sinon.stub(),
    } as unknown as InstallChartOptions;

    const chartMock = {
      unqualified: sinon.stub().returns('mockedUnqualified'),
    } as unknown as Chart;

    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    const chartInstallRequest = new ChartInstallRequest('mocked', chartMock, installChartOptionsMock);
    chartInstallRequest.apply(helmExecutionBuilderMock);

    expect(helmExecutionBuilderMock.subcommands).to.have.been.calledOnceWith('install');
    expect(installChartOptionsMock.apply).to.have.been.calledOnceWith(helmExecutionBuilderMock);
    expect(installChartOptionsMock.repo).to.have.been.calledTwice;
    expect(chartMock.unqualified).to.have.been.calledOnce;
    expect(helmExecutionBuilderMock.positional).to.have.been.calledTwice;
    expect(helmExecutionBuilderMock.positional).to.have.been.calledWith('mocked');
    expect(helmExecutionBuilderMock.positional).to.have.been.calledWith('mockedUnqualified');
  });

  it('Test ChartInstallRequest apply with qualified chart', () => {
    const installChartOptionsMock = {
      repo: sinon.stub().returns(null),
      apply: sinon.stub(),
    } as unknown as InstallChartOptions;

    const chartMock = {
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
    expect(installChartOptionsMock.repo).to.have.been.calledOnce;
    expect(chartMock.qualified).to.have.been.calledOnce;
    expect(helmExecutionBuilderMock.positional).to.have.been.calledTwice;
    expect(helmExecutionBuilderMock.positional).to.have.been.calledWith('mocked');
    expect(helmExecutionBuilderMock.positional).to.have.been.calledWith('mockedQualified');
  });
});
