// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {ContainerEngineResourceInspector} from '../../../../src/integration/container-engine/container-engine-resource-inspector.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {Architecture} from '../../../../src/business/utils/architecture.js';

describe('ContainerEngineResourceInspector', (): void => {
  let sandbox: SinonSandbox;
  let shellRunnerRunStub: SinonStub;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
    shellRunnerRunStub = sandbox.stub(ShellRunner.prototype, 'run');
  });

  afterEach((): void => {
    sandbox.restore();
  });

  describe('getEngineLinuxPlatform', (): void => {
    it('returns linux/amd64 when docker reports x86_64', async (): Promise<void> => {
      shellRunnerRunStub
        .withArgs('docker', ['info', '--format', '{{json .}}'], sinon.match.object)
        .resolves([JSON.stringify({Architecture: 'x86_64', MemTotal: 8_000_000_000, NCPU: 4})]);

      const inspector: ContainerEngineResourceInspector = new ContainerEngineResourceInspector({
        debug: (): void => undefined,
      } as never);
      const platform: string = await inspector.getEngineLinuxPlatform();

      expect(platform).to.equal(Architecture.LINUX_AMD64);
    });

    it('returns linux/arm64 when docker reports aarch64', async (): Promise<void> => {
      shellRunnerRunStub
        .withArgs('docker', ['info', '--format', '{{json .}}'], sinon.match.object)
        .resolves([JSON.stringify({Architecture: 'aarch64', MemTotal: 8_000_000_000, NCPU: 4})]);

      const inspector: ContainerEngineResourceInspector = new ContainerEngineResourceInspector({
        debug: (): void => undefined,
      } as never);
      const platform: string = await inspector.getEngineLinuxPlatform();

      expect(platform).to.equal(Architecture.LINUX_ARM64);
    });

    it('falls back to podman when docker is unreachable and returns linux/arm64 for arm64', async (): Promise<void> => {
      shellRunnerRunStub
        .withArgs('docker', ['info', '--format', '{{json .}}'], sinon.match.object)
        .rejects(new Error('Cannot connect to the Docker daemon'));
      shellRunnerRunStub
        .withArgs('podman', ['info', '--format', 'json'], sinon.match.object)
        .resolves([JSON.stringify({host: {arch: 'arm64', memTotal: 8_000_000_000, cpus: 4}})]);

      const inspector: ContainerEngineResourceInspector = new ContainerEngineResourceInspector({
        debug: (): void => undefined,
      } as never);
      const platform: string = await inspector.getEngineLinuxPlatform();

      expect(platform).to.equal(Architecture.LINUX_ARM64);
    });

    it('falls back to process.arch when neither engine is reachable', async (): Promise<void> => {
      shellRunnerRunStub
        .withArgs('docker', ['info', '--format', '{{json .}}'], sinon.match.object)
        .rejects(new Error('Cannot connect to the Docker daemon'));
      shellRunnerRunStub
        .withArgs('podman', ['info', '--format', 'json'], sinon.match.object)
        .rejects(new Error('podman is not installed'));

      const inspector: ContainerEngineResourceInspector = new ContainerEngineResourceInspector({
        debug: (): void => undefined,
      } as never);
      const platform: string = await inspector.getEngineLinuxPlatform();

      // Falls back to Architecture.getLinuxPlatform() which uses process.arch
      expect(platform).to.equal(Architecture.getLinuxPlatform());
    });
  });
});
