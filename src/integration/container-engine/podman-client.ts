// SPDX-License-Identifier: Apache-2.0

import {container, inject, injectable} from 'tsyringe-neo';
import {ShellRunner} from '../../core/shell-runner.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type ContainerEngineCommand} from './container-engine-command.js';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {PodmanDependencyManager} from '../../core/dependency-managers/podman-dependency-manager.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {SubprocessEnvironment} from '../../core/subprocess-environment.js';
import {KindProviderResolver} from './kind-provider-resolver.js';

@injectable()
export class PodmanClient {
  private static readonly CONTAINER_ENGINE_PROBE_TIMEOUT_MS: number = 5 * 1000;
  private readonly shellRunner: ShellRunner;
  private podmanUnavailable: boolean = false;

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
  }

  /**
   * The solo-owned container configuration (CONTAINERS_CONF / CONTAINERS_REGISTRIES_CONF) rootful
   * podman must run under, resolved from the PodmanDependencyManager that wrote it. Empty unless a
   * valid configuration was persisted (Linux rootful only).
   */
  private containerConfigEnvironment(): Record<string, string> {
    return container
      .resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager)
      .containerConfigEnvironment();
  }

  public async getKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const detectedCommand: ContainerEngineCommand | undefined = this.podmanUnavailable
      ? undefined
      : await this.detectKindContainerCommand(nodeName);

    if (detectedCommand) {
      return detectedCommand;
    }

    if (KindProviderResolver.current() === constants.PODMAN) {
      return PodmanClient.podmanCommand();
    }

    return undefined;
  }

  public async loadImageArchiveIntoCluster(
    kindExecutable: string,
    archivePath: string,
    clusterName: string,
    engineCommand: ContainerEngineCommand,
  ): Promise<void> {
    const kindArguments: string[] = ['load', 'image-archive', archivePath, '--name', clusterName];
    const pathEnvironment: string = `${PathEx.dirname(kindExecutable)}${PathEx.delimiter}${SubprocessEnvironment.currentPath()}`;
    const configEnvironment: Record<string, string> = this.containerConfigEnvironment();

    if (PodmanClient.isSudoPodmanCommand(engineCommand)) {
      await this.shellRunner.run('sudo', [
        '-n',
        'env',
        `KIND_EXPERIMENTAL_PROVIDER=${constants.PODMAN}`,
        `PATH=${pathEnvironment}`,
        ...PodmanDependencyManager.toEnvironmentArguments(configEnvironment),
        kindExecutable,
        ...kindArguments,
      ]);
      return;
    }

    await this.shellRunner.run(kindExecutable, kindArguments, {
      commandProfile: SubprocessCommandProfile.KIND,
      environmentVariablesToAppend: {
        KIND_EXPERIMENTAL_PROVIDER: constants.PODMAN,
        PATH: pathEnvironment,
        ...configEnvironment,
      },
    });
  }

  private static podmanCommand(): ContainerEngineCommand {
    return {
      executable: constants.PODMAN,
      argumentsPrefix: [],
    };
  }

  private sudoPodmanCommand(): ContainerEngineCommand {
    // sudo resets both PATH (secure_path drops the brew bin directory holding podman) and the
    // container configuration variables, so pass them back explicitly through `env`.
    return {
      executable: 'sudo',
      argumentsPrefix: [
        '-n',
        'env',
        `PATH=${SubprocessEnvironment.currentPath()}`,
        ...PodmanDependencyManager.toEnvironmentArguments(this.containerConfigEnvironment()),
        constants.PODMAN,
      ],
    };
  }

  private static isSudoPodmanCommand(command: ContainerEngineCommand): boolean {
    return command.executable === 'sudo' && command.argumentsPrefix.includes(constants.PODMAN);
  }

  private async detectKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const podmanCommand: ContainerEngineCommand = PodmanClient.podmanCommand();

    if (await this.containerExists(podmanCommand, nodeName)) {
      return podmanCommand;
    }

    if (this.podmanUnavailable) {
      return undefined;
    }

    const sudoPodmanCommand: ContainerEngineCommand = this.sudoPodmanCommand();

    if (await this.containerExists(sudoPodmanCommand, nodeName)) {
      return sudoPodmanCommand;
    }

    return undefined;
  }

  private async containerExists(command: ContainerEngineCommand, nodeName: string): Promise<boolean> {
    try {
      await this.shellRunner.run(command.executable, [...command.argumentsPrefix, 'container', 'exists', nodeName], {
        commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
        environmentVariablesToAppend: this.containerConfigEnvironment(),
        timeoutMs: PodmanClient.CONTAINER_ENGINE_PROBE_TIMEOUT_MS,
        bestEffort: true,
      });
      return true;
    } catch (error) {
      if (PodmanClient.isPodmanUnavailable(error)) {
        this.podmanUnavailable = true;
      }
      // best-effort probe: fall back to the next supported container engine when this one cannot see the kind node
      return false;
    }
  }

  private static isPodmanUnavailable(error: unknown): boolean {
    const message: string = error instanceof Error ? error.message : String(error);
    return /Cannot connect to Podman|unable to connect to Podman socket|spawn podman ENOENT/i.test(message);
  }
}
