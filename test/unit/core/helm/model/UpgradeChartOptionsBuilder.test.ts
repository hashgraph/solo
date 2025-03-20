// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';
import {UpgradeChartOptions} from '../../../../../src/core/helm/model/upgrade/UpgradeChartOptions.js';

describe('UpgradeChartOptionsBuilder Tests', () => {
  it('Test UpgradeChartOptionsBuilder', () => {
    const options = UpgradeChartOptions.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .extraArgs('--debug')
      .build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.namespace).to.equal('test-namespace');
    expect(options.kubeContext).to.equal('test-context');
    expect(options.reuseValues).to.be.true;
    expect(options.extraArgs).to.equal('--debug');
  });

  it('Test apply method', () => {
    const options = UpgradeChartOptions.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .extraArgs('--debug')
      .build();

    type MockBuilder = HelmExecutionBuilder & {
      argument: sinon.SinonStub;
      flag: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builder: MockBuilder = {
      argument: sinon.stub(),
      flag: sinon.stub(),
      positional: sinon.stub(),
    } as unknown as MockBuilder;

    builder.argument.returns(builder);
    builder.flag.returns(builder);
    builder.positional.returns(builder);

    options.apply(builder);

    // Verify builder methods were called with correct arguments
    expect(builder.argument.calledWith('--namespace', 'test-namespace')).to.be.true;
    expect(builder.argument.calledWith('--kube-context', 'test-context')).to.be.true;
    expect(builder.flag.calledWith('--reuse-values')).to.be.true;
    expect(builder.positional.calledWith('--debug')).to.be.true;
  });

  it('Test builder with default values', () => {
    const options = UpgradeChartOptions.builder().build();

    // Verify default values
    expect(options).to.not.be.null;
    expect(options.namespace).to.be.undefined;
    expect(options.kubeContext).to.be.undefined;
    expect(options.reuseValues).to.be.false;
    expect(options.extraArgs).to.be.undefined;
  });

  it('Test apply method with default values', () => {
    const options = UpgradeChartOptions.builder().build();

    type MockBuilder = HelmExecutionBuilder & {
      argument: sinon.SinonStub;
      flag: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builder: MockBuilder = {
      argument: sinon.stub(),
      flag: sinon.stub(),
      positional: sinon.stub(),
    } as unknown as MockBuilder;

    builder.argument.returns(builder);
    builder.flag.returns(builder);
    builder.positional.returns(builder);

    options.apply(builder);

    // Verify only required builder methods were called
    expect(builder.argument.notCalled).to.be.false;
    expect(builder.flag.notCalled).to.be.true;
  });
});
