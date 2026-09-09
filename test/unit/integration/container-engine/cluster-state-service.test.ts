// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {ClusterStateService} from '../../../../src/integration/container-engine/cluster-state-service.js';
import {type ContainerEngineState} from '../../../../src/integration/container-engine/container-engine-state.js';
import {type KindClusterContainer} from '../../../../src/integration/container-engine/kind-cluster-container.js';

const buildService: () => ClusterStateService = (): ClusterStateService => new ClusterStateService({} as SoloLogger);

describe('ClusterStateService', (): void => {
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('reports docker running when docker info succeeds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'docker', running: true});
  });

  it('falls back to podman when docker is absent but podman info succeeds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).rejects(new Error('docker not found'));
    shellRunnerRunStub.withArgs('podman', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'podman', running: true});
  });

  it('reports docker installed but stopped when only the docker CLI responds', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).rejects(new Error('daemon not running'));
    shellRunnerRunStub.withArgs('podman', ['info'], sinon.match.object).rejects(new Error('podman not found'));
    shellRunnerRunStub.withArgs('docker', ['--version'], sinon.match.object).resolves(['Docker version 27.0.0']);

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: 'docker', running: false});
  });

  it('reports no engine when neither docker nor podman is installed', async (): Promise<void> => {
    shellRunnerRunStub.rejects(new Error('command not found'));

    const state: ContainerEngineState = await buildService().getEngineState();

    expect(state).to.deep.equal({engineName: undefined, running: false});
  });

  it('lists kind cluster containers with their cluster label and running state', async (): Promise<void> => {
    shellRunnerRunStub
      .withArgs(
        'docker',
        ['ps', '-a', '--filter', 'label=io.x-k8s.kind.cluster', '--format', '{{.Names}}\t{{.State}}'],
        sinon.match.object,
      )
      .resolves(['solo-cluster-control-plane\trunning', 'other-cluster-control-plane\texited']);
    shellRunnerRunStub
      .withArgs(
        'docker',
        ['inspect', '--format', '{{index .Config.Labels "io.x-k8s.kind.cluster"}}', 'solo-cluster-control-plane'],
        sinon.match.object,
      )
      .resolves(['solo-cluster']);
    shellRunnerRunStub
      .withArgs(
        'docker',
        ['inspect', '--format', '{{index .Config.Labels "io.x-k8s.kind.cluster"}}', 'other-cluster-control-plane'],
        sinon.match.object,
      )
      .resolves(['other-cluster']);

    const containers: KindClusterContainer[] = await buildService().listKindClusterContainers('docker');

    expect(containers).to.deep.equal([
      {containerName: 'solo-cluster-control-plane', clusterName: 'solo-cluster', running: true},
      {containerName: 'other-cluster-control-plane', clusterName: 'other-cluster', running: false},
    ]);
  });

  it('starts and stops the named containers through the engine CLI', async (): Promise<void> => {
    shellRunnerRunStub.resolves([]);

    const service: ClusterStateService = buildService();
    await service.startContainers('docker', ['solo-cluster-control-plane']);
    await service.stopContainers('docker', ['solo-cluster-control-plane']);

    expect(shellRunnerRunStub.calledWith('docker', ['start', 'solo-cluster-control-plane'], sinon.match.object)).to.be
      .true;
    expect(shellRunnerRunStub.calledWith('docker', ['stop', 'solo-cluster-control-plane'], sinon.match.object)).to.be
      .true;
  });

  it('does not launch the engine when it is already running', async (): Promise<void> => {
    shellRunnerRunStub.withArgs('docker', ['info'], sinon.match.object).resolves([]);

    const state: ContainerEngineState = await buildService().startEngine();

    expect(state).to.deep.equal({engineName: 'docker', running: true});
    expect(shellRunnerRunStub.calledWith('open', sinon.match.array, sinon.match.object)).to.be.false;
    expect(shellRunnerRunStub.calledWith('podman', ['machine', 'start'], sinon.match.object)).to.be.false;
  });
});
