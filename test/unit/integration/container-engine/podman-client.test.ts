// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {PodmanClient} from '../../../../src/integration/container-engine/podman-client.js';
import {type ContainerEngineCommand} from '../../../../src/integration/container-engine/container-engine-command.js';
import {PodmanDependencyManager} from '../../../../src/core/dependency-managers/podman-dependency-manager.js';

describe('PodmanClient', (): void => {
  let previousKindProvider: string | undefined;
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;
  let containerConfigEnvironmentStub: SinonStub;

  beforeEach((): void => {
    previousKindProvider = process.env.KIND_EXPERIMENTAL_PROVIDER;
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
    // Pin the host-dependent container configuration lookup so command shapes are deterministic.
    containerConfigEnvironmentStub = sandbox
      .stub(PodmanDependencyManager.prototype, 'containerConfigEnvironment')
      .returns({});
  });

  afterEach((): void => {
    sandbox.restore();

    if (previousKindProvider === undefined) {
      delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    } else {
      process.env.KIND_EXPERIMENTAL_PROVIDER = previousKindProvider;
    }
  });

  it('detects a podman-backed kind cluster when podman owns the node container', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    shellRunnerRunStub
      .withArgs('podman', PodmanClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .resolves([]);

    const client: PodmanClient = PodmanClientTestBuilder.build();
    const command: ContainerEngineCommand | undefined = await client.getKindContainerCommand('kind-control-plane');

    expect(command).to.deep.equal({
      executable: 'podman',
      argumentsPrefix: [],
    });
  });

  it('detects a rootful podman-backed kind cluster when sudo podman owns the node container', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    shellRunnerRunStub
      .withArgs('podman', PodmanClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .rejects(new Error('missing rootless container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        PodmanClientTestBuilder.containerExistsArguments('kind-control-plane', PodmanClientTestBuilder.sudoPrefix()),
        sinon.match.object,
      )
      .resolves([]);

    const client: PodmanClient = PodmanClientTestBuilder.build();
    const command: ContainerEngineCommand | undefined = await client.getKindContainerCommand('kind-control-plane');

    expect(command).to.deep.equal({
      executable: 'sudo',
      argumentsPrefix: PodmanClientTestBuilder.sudoPrefix(),
    });
  });

  it('passes the solo-owned container configuration to rootful podman probes', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    const configurationArguments: string[] = ['CONTAINERS_CONF=/solo/config/containers.conf'];
    containerConfigEnvironmentStub.returns({CONTAINERS_CONF: '/solo/config/containers.conf'});
    shellRunnerRunStub
      .withArgs('podman', PodmanClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .rejects(new Error('missing rootless container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        PodmanClientTestBuilder.containerExistsArguments(
          'kind-control-plane',
          PodmanClientTestBuilder.sudoPrefix(configurationArguments),
        ),
        sinon.match.object,
      )
      .resolves([]);

    const client: PodmanClient = PodmanClientTestBuilder.build();
    const command: ContainerEngineCommand | undefined = await client.getKindContainerCommand('kind-control-plane');

    expect(command?.argumentsPrefix).to.include('CONTAINERS_CONF=/solo/config/containers.conf');
  });

  it('uses podman when the kind provider environment variable is set to podman', async (): Promise<void> => {
    process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';
    PodmanClientTestBuilder.stubMissingPodmanContainer(shellRunnerRunStub, 'kind-control-plane');

    const client: PodmanClient = PodmanClientTestBuilder.build();
    const command: ContainerEngineCommand | undefined = await client.getKindContainerCommand('kind-control-plane');

    expect(command).to.deep.equal({
      executable: 'podman',
      argumentsPrefix: [],
    });
  });

  it('returns undefined when the kind cluster is not backed by podman', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    PodmanClientTestBuilder.stubMissingPodmanContainer(shellRunnerRunStub, 'kind-control-plane');

    const client: PodmanClient = PodmanClientTestBuilder.build();
    const command: ContainerEngineCommand | undefined = await client.getKindContainerCommand('kind-control-plane');

    expect(command).to.equal(undefined);
  });

  it('does not retry podman detection after podman is unavailable', async (): Promise<void> => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    shellRunnerRunStub
      .withArgs('podman', PodmanClientTestBuilder.containerExistsArguments('kind-control-plane'), sinon.match.object)
      .rejects(new Error('Cannot connect to Podman: socket unavailable'));

    const client: PodmanClient = PodmanClientTestBuilder.build();

    expect(await client.getKindContainerCommand('kind-control-plane')).to.equal(undefined);
    expect(await client.getKindContainerCommand('kind-control-plane')).to.equal(undefined);
    expect(shellRunnerRunStub).to.have.been.calledOnce;
  });

  it('loads image archives into a podman-backed kind cluster with the podman kind provider', async (): Promise<void> => {
    const kindExecutable: string = '/home/runner/.solo/bin/kind';
    const engineCommand: ContainerEngineCommand = {
      executable: 'podman',
      argumentsPrefix: [],
    };
    shellRunnerRunStub
      .withArgs(
        kindExecutable,
        PodmanClientTestBuilder.loadImageArchiveArguments('/tmp/busybox.tar', 'kind'),
        sinon.match.object,
      )
      .resolves([]);

    const client: PodmanClient = PodmanClientTestBuilder.build();
    await client.loadImageArchiveIntoCluster(kindExecutable, '/tmp/busybox.tar', 'kind', engineCommand);

    expect(shellRunnerRunStub).to.have.been.calledWith(
      kindExecutable,
      PodmanClientTestBuilder.loadImageArchiveArguments('/tmp/busybox.tar', 'kind'),
      sinon.match.hasNested('environmentVariablesToAppend.KIND_EXPERIMENTAL_PROVIDER', 'podman'),
    );
  });

  it('loads image archives into a rootful podman-backed kind cluster with sudo', async (): Promise<void> => {
    const kindExecutable: string = '/home/runner/.solo/bin/kind';
    const engineCommand: ContainerEngineCommand = {
      executable: 'sudo',
      argumentsPrefix: ['-n', 'podman'],
    };
    shellRunnerRunStub
      .withArgs(
        'sudo',
        PodmanClientTestBuilder.sudoKindLoadImageArchiveArguments(kindExecutable, '/tmp/busybox.tar', 'kind'),
      )
      .resolves([]);

    const client: PodmanClient = PodmanClientTestBuilder.build();
    await client.loadImageArchiveIntoCluster(kindExecutable, '/tmp/busybox.tar', 'kind', engineCommand);

    expect(shellRunnerRunStub).to.have.been.calledWith(
      'sudo',
      PodmanClientTestBuilder.sudoKindLoadImageArchiveArguments(kindExecutable, '/tmp/busybox.tar', 'kind'),
    );
  });
});

class PodmanClientTestBuilder {
  public static build(): PodmanClient {
    return new PodmanClient({} as SoloLogger);
  }

  public static sudoPrefix(configurationArguments: readonly string[] = []): string[] {
    return ['-n', 'env', `PATH=${process.env.PATH || ''}`, ...configurationArguments, 'podman'];
  }

  public static containerExistsArguments(nodeName: string, prefix: readonly string[] = []): string[] {
    return [...prefix, 'container', 'exists', nodeName];
  }

  public static loadImageArchiveArguments(archivePath: string, clusterName: string): string[] {
    return ['load', 'image-archive', archivePath, '--name', clusterName];
  }

  public static sudoKindLoadImageArchiveArguments(
    kindExecutable: string,
    archivePath: string,
    clusterName: string,
  ): string[] {
    return [
      '-n',
      'env',
      'KIND_EXPERIMENTAL_PROVIDER=podman',
      sinon.match.string as unknown as string,
      kindExecutable,
      ...PodmanClientTestBuilder.loadImageArchiveArguments(archivePath, clusterName),
    ];
  }

  public static stubMissingPodmanContainer(shellRunnerRunStub: SinonStub, nodeName: string): void {
    shellRunnerRunStub
      .withArgs('podman', PodmanClientTestBuilder.containerExistsArguments(nodeName), sinon.match.object)
      .rejects(new Error('missing podman container'));
    shellRunnerRunStub
      .withArgs(
        'sudo',
        PodmanClientTestBuilder.containerExistsArguments(nodeName, PodmanClientTestBuilder.sudoPrefix()),
        sinon.match.object,
      )
      .rejects(new Error('missing rootful podman container'));
  }
}
