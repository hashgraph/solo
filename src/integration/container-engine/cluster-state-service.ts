// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import * as constants from '../../core/constants.js';
import {type ContainerEngineState} from './container-engine-state.js';
import {type KindClusterContainer} from './kind-cluster-container.js';

/**
 * Detects and controls the state of the local container engine (Docker Desktop / Podman machine)
 * and the Kind cluster node containers it hosts. Backs the `solo cluster-ref state` subcommands.
 *
 * Solo prefers Docker and only falls back to Podman when Docker is absent (matching
 * ContainerEngineResourceInspector), so all detection probes Docker first and Podman second.
 */
@injectable()
export class ClusterStateService {
  /** Label Kind stamps on every cluster node container; used to discover Solo Kind cluster containers. */
  private static readonly KIND_CLUSTER_LABEL: string = 'io.x-k8s.kind.cluster';
  private static readonly PROBE_TIMEOUT_MS: number = 15 * 1000;
  private static readonly CONTAINER_OPERATION_TIMEOUT_MS: number = 2 * 60 * 1000;
  private static readonly ENGINE_START_TIMEOUT_MS: number = 3 * 60 * 1000;
  private static readonly ENGINE_START_POLL_INTERVAL_MS: number = 3 * 1000;

  private readonly shellRunner: ShellRunner;

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  /**
   * Probes the local container engine: which engine CLI is present and whether its daemon/VM responds.
   */
  public async getEngineState(): Promise<ContainerEngineState> {
    if (await this.commandSucceeds(constants.DOCKER, ['info'])) {
      return {engineName: constants.DOCKER, running: true};
    }
    if (await this.commandSucceeds(constants.PODMAN, ['info'])) {
      return {engineName: constants.PODMAN, running: true};
    }
    if (await this.commandSucceeds(constants.DOCKER, ['--version'])) {
      return {engineName: constants.DOCKER, running: false};
    }
    if (await this.commandSucceeds(constants.PODMAN, ['--version'])) {
      return {engineName: constants.PODMAN, running: false};
    }
    return {engineName: undefined, running: false};
  }

  /**
   * Ensures the container engine is running, launching Docker Desktop or the Podman machine when
   * needed. Returns immediately when the engine already responds. Throws when no engine is
   * installed, when the platform offers no way to auto-start the engine (Linux), or when the
   * engine does not become ready in time.
   */
  public async startEngine(): Promise<ContainerEngineState> {
    const state: ContainerEngineState = await this.getEngineState();
    if (state.running) {
      return state;
    }
    if (!state.engineName) {
      throw new SoloErrors.system.containerEngineNotFound();
    }

    await this.launchEngine(state.engineName);
    return await this.waitForEngine(state.engineName);
  }

  /**
   * Lists all Kind cluster node containers known to the engine, running or stopped.
   */
  public async listKindClusterContainers(engineName: string): Promise<KindClusterContainer[]> {
    const lines: string[] = await this.shellRunner.run(
      engineName,
      ['ps', '-a', '--filter', `label=${ClusterStateService.KIND_CLUSTER_LABEL}`, '--format', '{{.Names}}\t{{.State}}'],
      {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS},
    );

    const containers: KindClusterContainer[] = [];
    for (const line of lines) {
      const trimmed: string = line.trim();
      if (!trimmed) {
        continue;
      }
      const [containerName, state]: string[] = trimmed.split('\t');
      containers.push({
        containerName,
        clusterName: await this.readClusterLabel(engineName, containerName),
        running: state?.trim().toLowerCase() === 'running',
      });
    }
    return containers;
  }

  /**
   * Starts the given stopped containers via the engine CLI.
   */
  public async startContainers(engineName: string, containerNames: readonly string[]): Promise<void> {
    await this.shellRunner.run(engineName, ['start', ...containerNames], {
      timeoutMs: ClusterStateService.CONTAINER_OPERATION_TIMEOUT_MS,
    });
  }

  /**
   * Stops the given running containers via the engine CLI.
   */
  public async stopContainers(engineName: string, containerNames: readonly string[]): Promise<void> {
    await this.shellRunner.run(engineName, ['stop', ...containerNames], {
      timeoutMs: ClusterStateService.CONTAINER_OPERATION_TIMEOUT_MS,
    });
  }

  private async launchEngine(engineName: string): Promise<void> {
    if (engineName === constants.PODMAN) {
      if (OperatingSystem.isLinux()) {
        // on Linux Podman runs daemonless; if `podman info` fails something deeper is wrong
        throw new SoloErrors.system.containerEngineStartFailed(
          engineName,
          'Podman is installed but not responding and cannot be auto-started on Linux; ' +
            'check the installation (podman info) and retry',
        );
      }
      await this.shellRunner.run(constants.PODMAN, ['machine', 'start'], {
        timeoutMs: ClusterStateService.ENGINE_START_TIMEOUT_MS,
      });
      return;
    }

    if (OperatingSystem.isDarwin()) {
      await this.shellRunner.run('open', ['-ga', 'Docker'], {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS});
    } else if (OperatingSystem.isWin32()) {
      await this.shellRunner.run(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          String.raw`Start-Process -FilePath "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"`,
        ],
        {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS},
      );
    } else {
      throw new SoloErrors.system.containerEngineStartFailed(
        engineName,
        'the Docker daemon cannot be auto-started on Linux; start it manually (for example: sudo systemctl start docker)',
      );
    }
  }

  private async waitForEngine(engineName: string): Promise<ContainerEngineState> {
    const deadline: number = Date.now() + ClusterStateService.ENGINE_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.commandSucceeds(engineName, ['info'])) {
        return {engineName, running: true};
      }
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, ClusterStateService.ENGINE_START_POLL_INTERVAL_MS);
      });
    }
    throw new SoloErrors.system.containerEngineStartFailed(
      engineName,
      `the engine did not become ready within ${ClusterStateService.ENGINE_START_TIMEOUT_MS / 1000}s`,
    );
  }

  private async readClusterLabel(engineName: string, containerName: string): Promise<string> {
    try {
      const output: string[] = await this.shellRunner.run(
        engineName,
        ['inspect', '--format', `{{index .Config.Labels "${ClusterStateService.KIND_CLUSTER_LABEL}"}}`, containerName],
        {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS},
      );
      return output.join('').trim() || containerName;
    } catch {
      // best-effort: fall back to the container name when the label cannot be read
      return containerName;
    }
  }

  private async commandSucceeds(executable: string, commandArguments: string[]): Promise<boolean> {
    try {
      await this.shellRunner.run(executable, commandArguments, {timeoutMs: ClusterStateService.PROBE_TIMEOUT_MS});
      return true;
    } catch {
      // probe only: a failure means 'not available', never an error to surface
      return false;
    }
  }
}
