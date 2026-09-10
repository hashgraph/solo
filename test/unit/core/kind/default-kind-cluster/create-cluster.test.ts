// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {type ClusterCreateOptions} from '../../../../../src/integration/kind/model/create-cluster/cluster-create-options.js';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {ClusterCreateResponse} from '../../../../../src/integration/kind/model/create-cluster/cluster-create-response.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';

describe('DefaultKindClient - createCluster', (): void => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;

  beforeEach((): void => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should create a cluster and parse the response correctly', async (): Promise<void> => {
    // Use a different name pattern to test regex extraction
    const clusterName: string = 'dev-cluster';
    const contextName: string = 'kind-dev-cluster';

    // Create output that contains the necessary patterns but with different text
    executionStub.responseAs.callsFake((responseClass: any): Promise<ClusterCreateResponse> => {
      const output: string = `Creating cluster "${clusterName}" ... ✓ Various steps completed ✓ Set kubectl context to "${contextName}"`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterCreateResponse = await client.createCluster(clusterName);

    expect(result).to.be.instanceOf(ClusterCreateResponse);
    expect(result.name).to.equal(clusterName);
    expect(result.context).to.equal(contextName);
  });

  it('should throw if responseAs throws', async (): Promise<void> => {
    executionStub.responseAs.rejects(new Error('fail'));

    try {
      await client.createCluster('test-cluster');
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('fail');
    }
  });

  it('should extract cluster name with special characters', async (): Promise<void> => {
    const clusterName: string = 'my.cluster-with_special-chars_123';
    const contextName: string = `kind-${clusterName}`;

    executionStub.responseAs.callsFake((responseClass: any): Promise<ClusterCreateResponse> => {
      const output: string = `Creating cluster "${clusterName}" ... [some logs] Set kubectl context to "${contextName}"`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterCreateResponse = await client.createCluster(clusterName);

    expect(result.name).to.equal(clusterName);
    expect(result.context).to.equal(contextName);
  });

  it('should handle missing context information gracefully', async (): Promise<void> => {
    const clusterName: string = 'partial-output-cluster';

    executionStub.responseAs.callsFake((responseClass: any): Promise<ClusterCreateResponse> => {
      // Output missing the context part
      const output: string = `Creating cluster "${clusterName}" ... ✓ Various steps completed`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterCreateResponse = await client.createCluster(clusterName);

    expect(result.name).to.equal(clusterName);
    expect(result.context).to.be.undefined;
  });

  it('should pass cluster name and options to execution builder', async (): Promise<void> => {
    const clusterName: string = 'options-test-cluster';
    const options: ClusterCreateOptions = {
      config: './custom-config.yaml',
      image: 'custom/node:v1.27.0',
      name: clusterName,
      retain: true,
      wait: '120s',
    } as ClusterCreateOptions;

    // Create a spy to track subcommands and arguments
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );
    const flagSpy: SinonSpy<[flag: string], KindExecutionBuilder> = sinon.spy(KindExecutionBuilder.prototype, 'flag');

    await client.createCluster(clusterName, options);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('create', 'cluster')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;
    expect(argumentSpy.calledWith('image', options.image)).to.be.true;
    expect(argumentSpy.calledWith('config', options.config)).to.be.true;
    expect(argumentSpy.calledWith('wait', options.wait)).to.be.true;

    // Verify flags were set correctly
    expect(flagSpy.calledWith('--retain')).to.be.true;
  });

  it('should handle boolean options correctly', async (): Promise<void> => {
    const clusterName: string = 'boolean-options-cluster';

    // Test with boolean options turned on and off
    const options: ClusterCreateOptions = {
      name: clusterName,
      retain: true,
    } as ClusterCreateOptions;

    // Create a spy to track flag calls
    const flagSpy: SinonSpy<[name: string], KindExecutionBuilder> = sinon.spy(KindExecutionBuilder.prototype, 'flag');
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.createCluster(clusterName, options);

    // Should include options that are true
    expect(flagSpy.calledWith('--retain')).to.be.true;

    // Should set name as argument
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;
  });

  it('should handle string options correctly', async (): Promise<void> => {
    const clusterName: string = 'mixed-options-cluster';
    const options: ClusterCreateOptions = {
      wait: '60s',
      image: 'kindest/node:v1.29.0',
      name: clusterName,
    } as ClusterCreateOptions;

    // Create a spy to track argument calls
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.createCluster(clusterName, options);

    // Options should be passed as arguments
    expect(argumentSpy.calledWith('wait', '60s')).to.be.true;
    expect(argumentSpy.calledWith('image', 'kindest/node:v1.29.0')).to.be.true;
  });

  it('should handle no options provided', async (): Promise<void> => {
    const clusterName: string = 'default-options-cluster';
    const contextName: string = 'kind-default-options-cluster';

    executionStub.responseAs.callsFake((responseClass: any): Promise<ClusterCreateResponse> => {
      const output: string = `Creating cluster "${clusterName}" ... completed ... Set kubectl context to "${contextName}"`;
      return Promise.resolve(new responseClass(output));
    });

    // Create a spy to track argument calls
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    // Call without options object
    const result: ClusterCreateResponse = await client.createCluster(clusterName);

    // Verify only name parameter was set
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;

    // Check number of calls to argument to verify no other arguments were set
    // Adding 1 for the name argument
    expect(argumentSpy.callCount).to.equal(1);

    // Response should be correct
    expect(result.name).to.equal(clusterName);
    expect(result.context).to.equal(contextName);
  });
});
