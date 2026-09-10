// SPDX-License-Identifier: Apache-2.0

import {HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {SubprocessEnvironment} from '../../../../../src/core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../../../src/core/subprocess-command-profile.js';
import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';

describe('HelmExecutionBuilder', (): void => {
  afterEach((): void => sinon.restore());

  it('Test optionsWithMultipleValues null checks', (): void => {
    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
    expect((): void => {
      builder.optionsWithMultipleValues(null as any, null as any);
    }).to.throw(Error);
    expect((): void => {
      builder.optionsWithMultipleValues('test string', null as any);
    }).to.throw(Error);
  });

  it('Test environmentVariable null checks', (): void => {
    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
    expect((): void => {
      builder.environmentVariable(null as any, null as any);
    }).to.throw(Error);
    expect((): void => {
      builder.environmentVariable('test string', null as any);
    }).to.throw(Error);
  });

  describe('flag', (): void => {
    it('should add a flag', (): void => {
      const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
      expect(builder.flag('--atomic')).to.equal(builder);
    });

    it('should throw error if flag is empty', (): void => {
      const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
      expect((): HelmExecutionBuilder => builder.flag('')).to.throw('flag must not be null');
    });

    it('should throw error if flag does not start with a dash', (): void => {
      const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
      expect((): HelmExecutionBuilder => builder.flag('atomic')).to.throw('flag must start with "-"');
    });
  });

  it('builds a minimal helm environment: keeps KUBECONFIG/HELM_*, drops arbitrary secrets', (): void => {
    process.env.KUBECONFIG = '/home/user/.kube/config';
    process.env.HELM_REPOSITORY_CONFIG = '/home/user/.config/helm/repositories.yaml';
    process.env.LEAKY_SECRET_FOR_HELM = 'do-not-leak';
    const forCommandSpy: SinonSpy = sinon.spy(SubprocessEnvironment, 'forCommand');
    try {
      const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
      builder.subcommands('version').build();

      expect(forCommandSpy.calledWith(SubprocessCommandProfile.HELM)).to.equal(true);
      const environment: Record<string, string> = forCommandSpy.returnValues[0] as Record<string, string>;
      expect(environment).to.have.property('KUBECONFIG');
      expect(environment).to.have.property('HELM_REPOSITORY_CONFIG');
      expect(environment).to.not.have.property('LEAKY_SECRET_FOR_HELM');
    } finally {
      delete process.env.KUBECONFIG;
      delete process.env.HELM_REPOSITORY_CONFIG;
      delete process.env.LEAKY_SECRET_FOR_HELM;
    }
  });
});
