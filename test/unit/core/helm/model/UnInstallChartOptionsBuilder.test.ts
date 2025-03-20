// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {UnInstallChartOptions} from '../../../../../src/core/helm/model/install/UnInstallChartOptions.js';

describe('UnInstallChartOptionsBuilder Tests', () => {
  it('Test UnInstallChartOptionsBuilder', () => {
    const options = UnInstallChartOptions.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .releaseName('my-release')
      .build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.namespace).to.equal('test-namespace');
    expect(options.kubeContext).to.equal('test-context');
    expect(options.releaseName).to.equal('my-release');
  });

  it('Test apply method', () => {
    const options = UnInstallChartOptions.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .releaseName('my-release')
      .build();

    type MockBuilder = HelmExecutionBuilder & {
      flag: sinon.SinonStub;
      argument: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builderMock = {
      flag: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as MockBuilder;

    options.apply(builderMock);

    // Verify builder methods were called with correct arguments
    expect(builderMock.argument.calledWith('--namespace', 'test-namespace')).to.be.true;
    expect(builderMock.argument.calledWith('--kube-context', 'test-context')).to.be.true;
    expect(builderMock.positional.calledWith('my-release')).to.be.true;
  });

  it('Test builder with default values', () => {
    const options = UnInstallChartOptions.defaults('my-release');

    // Verify default values
    expect(options).to.not.be.null;
    expect(options.namespace).to.be.undefined;
    expect(options.kubeContext).to.be.undefined;
    expect(options.releaseName).to.equal('my-release');
  });

  it('Test apply method with default values', () => {
    const options = UnInstallChartOptions.defaults('my-release');

    type MockBuilder = HelmExecutionBuilder & {
      flag: sinon.SinonStub;
      argument: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builderMock = {
      flag: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as MockBuilder;

    options.apply(builderMock);

    // Verify only required builder methods were called
    expect(builderMock.argument.calledWith('output', 'json')).to.be.true;
    expect(builderMock.positional.calledWith('my-release')).to.be.true;
  });

  it('Test builder throws error when release name is missing', () => {
    expect(() => {
      UnInstallChartOptions.builder().build();
    }).to.throw('Release name is required');
  });
});
