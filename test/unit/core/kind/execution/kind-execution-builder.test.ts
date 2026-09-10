// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon, {type SinonSpy} from 'sinon';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {SubprocessEnvironment} from '../../../../../src/core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../../../src/core/subprocess-command-profile.js';

describe('KindExecutionBuilder', (): void => {
  let builder: KindExecutionBuilder;

  beforeEach((): void => {
    // Create a fresh builder for each test
    builder = new KindExecutionBuilder();
  });

  afterEach((): void => {
    // Restore all stubs
    Sinon.restore();
  });

  describe('constructor', (): void => {
    it('should create an instance without errors', (): void => {
      expect(builder).to.be.instanceOf(KindExecutionBuilder);
    });
  });

  describe('subcommands', (): void => {
    it('should add a subcommand', (): void => {
      const result: KindExecutionBuilder = builder.subcommands('create');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if subcommand is null', (): void => {
      try {
        builder.subcommands();
        expect.fail('Expected error not thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.equal('commands must not be null');
      }
    });
  });

  describe('argument', (): void => {
    it('should add an argument with value', (): void => {
      const result: KindExecutionBuilder = builder.argument('name', 'test-cluster');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if argument name is null', (): void => {
      expect((): KindExecutionBuilder => builder.argument(null as any, 'value')).to.throw('name must not be null');
    });

    it('should throw error if argument value is null', (): void => {
      expect((): KindExecutionBuilder => builder.argument('name', null as any)).to.throw('value must not be null');
    });
  });

  describe('flag', (): void => {
    it('should add a flag', (): void => {
      const result: KindExecutionBuilder = builder.flag('--quiet');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if flag is null', (): void => {
      try {
        builder.flag(null);
        expect.fail('Expected error not thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.equal('flag must not be null');
      }
    });

    it('should throw error if flag does not start with a dash', (): void => {
      expect((): KindExecutionBuilder => builder.flag('retain')).to.throw('flag must start with "-"');
    });
  });

  describe('withPositional', (): void => {
    it('should add a positional argument', (): void => {
      const result: KindExecutionBuilder = builder.positional('argument');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if positional is null', (): void => {
      expect((): KindExecutionBuilder => builder.positional(null as any)).to.throw('value must not be null');
    });
  });

  describe('optionsWithMultipleValues', (): void => {
    it('should add an option with multiple values', (): void => {
      const result: KindExecutionBuilder = builder.optionsWithMultipleValues('label', ['app=test', 'env=dev']);
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if option name is null', (): void => {
      expect((): KindExecutionBuilder => builder.optionsWithMultipleValues(null as any, ['value'])).to.throw(
        'name must not be null',
      );
    });

    it('should throw error if values array is null', (): void => {
      expect((): KindExecutionBuilder => builder.optionsWithMultipleValues('name', null as any)).to.throw(
        'value must not be null',
      );
    });
  });

  describe('environmentVariable', (): void => {
    it('should add an environment variable', (): void => {
      const result: KindExecutionBuilder = builder.environmentVariable('DEBUG', 'true');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if variable name is null', (): void => {
      expect((): KindExecutionBuilder => builder.environmentVariable(null as any, 'value')).to.throw(
        'name must not be null',
      );
    });

    it('should throw error if variable value is null', (): void => {
      expect((): KindExecutionBuilder => builder.environmentVariable('name', null as any)).to.throw(
        'value must not be null',
      );
    });
  });

  describe('build', (): void => {
    it('should build a KindExecution with the configured parameters', (): void => {
      // Configure builder with various parameters
      builder
        .subcommands('create', 'cluster')
        .argument('name', 'test-cluster')
        .flag('--quiet')
        .positional('--config=config.yaml')
        .optionsWithMultipleValues('label', ['app=test', 'env=dev'])
        .environmentVariable('DEBUG', 'true');

      // Build the execution
      const execution: KindExecution = builder.build();

      // Verify
      expect(execution).to.be.instanceOf(KindExecution);
      // More detailed verification would require inspection of private fields
      // or mocking the KindExecution constructor
    });

    it('builds a minimal kind environment: keeps KUBECONFIG, drops arbitrary secrets', (): void => {
      process.env.KUBECONFIG = '/home/user/.kube/config';
      process.env.LEAKY_SECRET_FOR_KIND = 'do-not-leak';
      const forCommandSpy: SinonSpy = Sinon.spy(SubprocessEnvironment, 'forCommand');
      try {
        builder.subcommands('get', 'clusters').build();

        expect(forCommandSpy.calledWith(SubprocessCommandProfile.KIND)).to.equal(true);
        const environment: Record<string, string> = forCommandSpy.returnValues[0] as Record<string, string>;
        expect(environment).to.have.property('KUBECONFIG');
        expect(environment).to.not.have.property('LEAKY_SECRET_FOR_KIND');
      } finally {
        delete process.env.KUBECONFIG;
        delete process.env.LEAKY_SECRET_FOR_KIND;
      }
    });
  });
});
