// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type ContainerEngineResources} from './container-engine-resources.js';
import {Architecture} from '../../business/utils/architecture.js';

/**
 * Inspects the local container engine (Docker or Podman) for the host resources available to it.
 *
 * Solo prefers Docker and only falls back to Podman when Docker is absent (see PodmanDependencyManager),
 * so resource detection probes Docker first and Podman second. All probing is best-effort: any failure
 * resolves to `undefined` rather than throwing.
 */
@injectable()
export class ContainerEngineResourceInspector {
  private readonly shellRunner: ShellRunner;

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  public async getAvailableResources(): Promise<ContainerEngineResources | undefined> {
    return (await this.readDockerResources()) ?? (await this.readPodmanResources());
  }

  /**
   * Returns the Linux platform string (`linux/amd64` or `linux/arm64`) for the container engine
   * that is currently running. The architecture is read from `docker info` or `podman info` so that
   * image pulls always target the runtime environment, not the Solo Node.js process architecture.
   *
   * Falls back to the Solo process architecture (`process.arch`) when neither engine can be reached.
   */
  public async getEngineLinuxPlatform(): Promise<string> {
    const engineArchitecture: string | undefined =
      (await this.readDockerArchitecture()) ?? (await this.readPodmanArchitecture());

    if (engineArchitecture !== undefined) {
      return Architecture.getLinuxPlatform(engineArchitecture);
    }

    // Fall back to the Solo process architecture when the container engine is unreachable.
    return Architecture.getLinuxPlatform();
  }

  private async readDockerArchitecture(): Promise<string | undefined> {
    // `docker info --format '{{json .}}'` returns a JSON object whose `Architecture` field
    // reports the host OS architecture as seen by the Docker daemon (e.g. `x86_64`, `aarch64`).
    const info: {Architecture?: string} | undefined = await this.readEngineInfo('docker', [
      'info',
      '--format',
      '{{json .}}',
    ]);
    return typeof info?.Architecture === 'string' ? info.Architecture : undefined;
  }

  private async readPodmanArchitecture(): Promise<string | undefined> {
    // `podman info --format json` returns a JSON object whose `host.arch` field reports the
    // host architecture (e.g. `amd64`, `arm64`).
    const info: {host?: {arch?: string}} | undefined = await this.readEngineInfo('podman', [
      'info',
      '--format',
      'json',
    ]);
    return typeof info?.host?.arch === 'string' ? info.host.arch : undefined;
  }

  private async readDockerResources(): Promise<ContainerEngineResources | undefined> {
    const info: {MemTotal?: number; NCPU?: number} | undefined = await this.readEngineInfo('docker', [
      'info',
      '--format',
      '{{json .}}',
    ]);
    if (!info || typeof info.MemTotal !== 'number' || typeof info.NCPU !== 'number') {
      return undefined;
    }
    return {memoryBytes: info.MemTotal, cpuCount: info.NCPU};
  }

  private async readPodmanResources(): Promise<ContainerEngineResources | undefined> {
    const info: {host?: {memTotal?: number; cpus?: number}} | undefined = await this.readEngineInfo('podman', [
      'info',
      '--format',
      'json',
    ]);
    const memoryBytes: number | undefined = info?.host?.memTotal;
    const cpuCount: number | undefined = info?.host?.cpus;
    if (typeof memoryBytes !== 'number' || typeof cpuCount !== 'number') {
      return undefined;
    }
    return {memoryBytes, cpuCount};
  }

  private async readEngineInfo<T>(engine: string, commandArguments: string[]): Promise<T | undefined> {
    try {
      // run() defaults useShell to false so format arguments such as '{{json .}}' are not split on their
      // spaces by the shell.
      const output: string[] = await this.shellRunner.run(engine, commandArguments, {
        commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
        bestEffort: true,
      });
      return JSON.parse(output.join('').trim()) as T;
    } catch (error) {
      this.logger.debug(`Unable to read ${engine} engine resources`, error);
      return undefined;
    }
  }
}
