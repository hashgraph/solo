// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {LoadImageArchiveResponse} from '../../../../../src/integration/kind/model/load-image-archive/load-image-archive-response.js';
import {LoadImageArchiveOptions} from '../../../../../src/integration/kind/model/load-image-archive/load-image-archive-options.js';

describe('DefaultKindClient.loadImageArchive', (): void => {
  let client: DefaultKindClient;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;
  let builderArguments: Map<string, string>;
  let builderSubcommands: string[];
  let builderPositionals: string[];
  let buildStub: SinonStub;
  let callStub: SinonStub;

  beforeEach((): void => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionStub = sinon.createStubInstance(KindExecution);
    builderArguments = new Map<string, string>();
    builderSubcommands = [];
    builderPositionals = [];

    callStub = executionStub.call as SinonStub;

    buildStub = sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as never);

    sinon.stub(KindExecutionBuilder.prototype, 'subcommands').callsFake(function (
      this: KindExecutionBuilder,
      ...commands: string[]
    ): KindExecutionBuilder {
      builderSubcommands.push(...commands);
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      return this;
    });

    sinon.stub(KindExecutionBuilder.prototype, 'argument').callsFake(function (
      this: KindExecutionBuilder,
      name: string,
      value: string,
    ): KindExecutionBuilder {
      builderArguments.set(name, value);
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      return this;
    });

    sinon.stub(KindExecutionBuilder.prototype, 'positional').callsFake(function (
      this: KindExecutionBuilder,
      value: string,
    ): KindExecutionBuilder {
      builderPositionals.push(value);
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      return this;
    });
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should call the correct subcommands when loading an image archive', async (): Promise<void> => {
    const archivePath: string = 'test-archive.tar';

    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive(archivePath);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    expect(builderSubcommands).to.include('load');
    expect(builderSubcommands).to.include('image-archive');
    expect(builderPositionals).to.include(archivePath);
    expect(buildStub).to.have.been.calledOnce;
    expect(callStub).to.have.been.calledOnce;
  });

  it('should handle empty image name gracefully', async (): Promise<void> => {
    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive('');

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    expect(builderArguments.get('name')).to.equal(undefined);
  });

  it('should throw if call rejects', async (): Promise<void> => {
    callStub.rejects(new Error('Failed to load image archive'));

    await expect(client.loadImageArchive('test-archive-fail.tar')).to.be.rejectedWith('Failed to load image archive');
  });

  it('should pass cluster name from options parameter', async (): Promise<void> => {
    const archivePath: string = 'test-archive.tar';
    const clusterName: string = 'custom-cluster';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(archivePath, clusterName);

    callStub.resolves(new LoadImageArchiveResponse());

    await client.loadImageArchive(archivePath, options);

    expect(builderPositionals).to.include(archivePath);
    expect(builderArguments.get('name')).to.equal(clusterName);
  });

  it('should pass nodes parameter when provided in options', async (): Promise<void> => {
    const archivePath: string = 'test-archive.tar';
    const nodes: string = 'control-plane,worker1,worker2';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(archivePath, undefined, nodes);

    callStub.resolves(new LoadImageArchiveResponse());

    await client.loadImageArchive(archivePath, options);

    expect(builderPositionals).to.include(archivePath);
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should handle both cluster name and nodes parameters', async (): Promise<void> => {
    const archivePath: string = 'test-archive.tar';
    const clusterName: string = 'custom-cluster';
    const nodes: string = 'worker1,worker2';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(archivePath, clusterName, nodes);

    callStub.resolves(new LoadImageArchiveResponse());

    await client.loadImageArchive(archivePath, options);

    expect(builderPositionals).to.include(archivePath);
    expect(builderArguments.get('name')).to.equal(clusterName);
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should handle archive paths with special characters', async (): Promise<void> => {
    const archivePath: string = '/path/to/archive with spaces.tar';

    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive(archivePath);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    expect(builderPositionals).to.include(archivePath);
    expect(callStub).to.have.been.calledOnce;
  });

  it('should handle malformed output format gracefully', async (): Promise<void> => {
    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive('test-archive.tar');

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
  });

  it('should handle relative paths for archive files', async (): Promise<void> => {
    const archivePath: string = './relative/path/archive.tar';

    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive(archivePath);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    expect(builderPositionals).to.include(archivePath);
    expect(callStub).to.have.been.calledOnce;
  });

  it('should handle absolute paths for archive files', async (): Promise<void> => {
    const archivePath: string = '/absolute/path/archive.tar';

    callStub.resolves(new LoadImageArchiveResponse());

    const result: LoadImageArchiveResponse = await client.loadImageArchive(archivePath);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    expect(builderPositionals).to.include(archivePath);
    expect(callStub).to.have.been.calledOnce;
  });
});
