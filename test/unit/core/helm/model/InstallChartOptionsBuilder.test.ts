// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {InstallChartOptions} from '../../../../../src/core/helm/model/install/InstallChartOptions.js';

describe('InstallChartOptionsBuilder Tests', () => {
  it('Test InstallChartOptionsBuilder', () => {
    const options = InstallChartOptions.builder()
      .atomic(true)
      .createNamespace(true)
      .dependencyUpdate(true)
      .description('description')
      .enableDNS(true)
      .force(true)
      .passCredentials(true)
      .password('password')
      .repo('repo')
      .set(['set', 'livenessProbe.exec.command=[cat,docroot/CHANGELOG.txt]'])
      .skipCrds(true)
      .timeout('timeout')
      .username('username')
      .values(['values1', 'values2'])
      .verify(true)
      .version('version')
      .waitFor(true)
      .build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.atomic).to.be.true;
    expect(options.createNamespace).to.be.true;
    expect(options.dependencyUpdate).to.be.true;
    expect(options.description).to.equal('description');
    expect(options.enableDNS).to.be.true;
    expect(options.force).to.be.true;
    expect(options.passCredentials).to.be.true;
    expect(options.password).to.equal('password');
    expect(options.repo).to.equal('repo');
    expect(options.set).to.include('livenessProbe.exec.command=[cat,docroot/CHANGELOG.txt]');
    expect(options.set).to.include('set');
    expect(options.skipCrds).to.be.true;
    expect(options.timeout).to.equal('timeout');
    expect(options.username).to.equal('username');
    expect(options.values).to.include('values1');
    expect(options.values).to.include('values2');
    expect(options.verify).to.be.true;
    expect(options.version).to.equal('version');
    expect(options.waitFor).to.be.true;

    // Test apply method with mock
    const builderMock = {
      flag: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    options.apply(builderMock);

    expect(builderMock.flag).to.have.been.callCount(9);
  });
});
