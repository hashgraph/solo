// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {inject, injectable} from 'tsyringe-neo';
import {type ContainerEngineClient} from './container-engine-client.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type KindClient} from '../kind/kind-client.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {DefaultKindClientBuilder} from '../kind/impl/default-kind-client-builder.js';
import {DependencyManager} from '../../core/dependency-managers/index.js';
import * as constants from '../../core/constants.js';
import {LoadImageArchiveOptionsBuilder} from '../kind/model/load-image-archive/load-image-archive-options-builder.js';
import {type LoadImageArchiveOptions} from '../kind/model/load-image-archive/load-image-archive-options.js';
import {Architecture} from '../../business/utils/architecture.js';
import {type ContainerEngineCommand} from './container-engine-command.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {PodmanClient} from './podman-client.js';
import {KindProviderResolver} from './kind-provider-resolver.js';
import {ContainerEngineResourceInspector} from './container-engine-resource-inspector.js';
import {ClusterNodeResumeOutcome} from './cluster-node-resume-outcome.js';
import {type ContainerEngineResources} from './container-engine-resources.js';
import {create as createTarball} from 'tar';

@injectable()
export class DockerClient implements ContainerEngineClient {
  private static readonly IMAGE_PULL_TIMEOUT_MS: number = 10 * 60 * 1000;
  private static readonly IMAGE_PULL_IDLE_TIMEOUT_MS: number = 10 * 60 * 1000;
  private static readonly CONTAINER_LIFECYCLE_TIMEOUT_MS: number = 30 * 1000;

  /** Container states a stopped node can be started from; `paused` needs `unpause` and is left alone. */
  private static readonly STARTABLE_CONTAINER_STATES: ReadonlySet<string> = new Set(['exited', 'created']);

  private readonly shellRunner: ShellRunner;
  private readonly podmanClient: PodmanClient;
  private readonly kindContainerCommands: Map<string, ContainerEngineCommand> = new Map<
    string,
    ContainerEngineCommand
  >();
  private readonly resourceInspector: ContainerEngineResourceInspector;

  public constructor(
    @inject(InjectTokens.KindBuilder) private readonly kindBuilder?: DefaultKindClientBuilder,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DependencyManager) private readonly dependencyManager?: DependencyManager,
  ) {
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.dependencyManager = patchInject(dependencyManager, InjectTokens.DependencyManager, this.constructor.name);
    this.shellRunner = new ShellRunner(this.logger);
    this.podmanClient = new PodmanClient(this.logger);
    this.resourceInspector = new ContainerEngineResourceInspector(this.logger);
  }

  public async pullImage(image: string): Promise<void> {
    const platform: string = Architecture.getLinuxPlatform();

    await this.shellRunner.run('docker', ['pull', '--platform', platform, image], {
      verbose: true,
      timeoutMs: DockerClient.IMAGE_PULL_TIMEOUT_MS,
      idleTimeoutMs: DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
    });
  }

  public async saveImage(image: string, archivePath: string): Promise<void> {
    const {platform, craneExecutable} = await this.prepareCranePull(archivePath);

    await this.shellRunner.run(craneExecutable, ['pull', '--platform', platform, image, archivePath], {
      verbose: true,
      timeoutMs: DockerClient.IMAGE_PULL_TIMEOUT_MS,
      idleTimeoutMs: DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
    });
  }

  private async prepareCranePull(archivePath: string): Promise<{platform: string; craneExecutable: string}> {
    await fs.mkdir(PathEx.dirname(archivePath), {recursive: true});

    return {
      platform: Architecture.getLinuxPlatform(),
      craneExecutable: await this.dependencyManager.getExecutable(constants.CRANE),
    };
  }

  public async saveImageArchive(image: string, archivePath: string): Promise<void> {
    const {platform, craneExecutable} = await this.prepareCranePull(archivePath);

    // crane's default docker tarball omits manifest.json for OCI-media images, producing an archive
    // neither docker nor containerd can load. The OCI layout is always valid; we pull it to a temp
    // directory and pack it into the single-file archive that `kind load image-archive` (ctr import) expects.
    // --annotate-ref records the image reference in the layout so ctr import restores the name:tag
    // (without it the image imports untagged and is unusable by the cluster).
    const layoutDirectory: string = `${archivePath}.oci-layout`;
    await fs.rm(layoutDirectory, {recursive: true, force: true});

    try {
      await this.shellRunner.run(
        craneExecutable,
        ['pull', '--format', 'oci', '--annotate-ref', '--platform', platform, image, layoutDirectory],
        {
          verbose: true,
          timeoutMs: DockerClient.IMAGE_PULL_TIMEOUT_MS,
          idleTimeoutMs: DockerClient.IMAGE_PULL_IDLE_TIMEOUT_MS,
        },
      );

      await createTarball({file: archivePath, cwd: layoutDirectory, portable: true}, ['.']);
    } finally {
      await fs.rm(layoutDirectory, {recursive: true, force: true});
    }
  }

  public async loadImage(archivePath: string): Promise<void> {
    await this.shellRunner.run('docker', ['load', '--input', archivePath], {
      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
    });
  }

  public async loadImageArchiveIntoCluster(archivePath: string, clusterName: string = 'kind'): Promise<void> {
    const nodeName: string = `${clusterName}-control-plane`;
    const engineCommand: ContainerEngineCommand | undefined = await this.resolveKindContainerCommand(nodeName);
    const kindExecutable: string = await this.dependencyManager.getExecutable(constants.KIND);

    if (engineCommand && engineCommand.executable !== constants.DOCKER) {
      await this.podmanClient.loadImageArchiveIntoCluster(kindExecutable, archivePath, clusterName, engineCommand);
      return;
    }

    const options: LoadImageArchiveOptions = LoadImageArchiveOptionsBuilder.builder()
      .archivePath(archivePath)
      .name(clusterName)
      .build();

    const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build(true);

    await kindClient.loadImageArchive(archivePath, options);
  }

  public async removeImage(image: string): Promise<void> {
    await this.shellRunner.run('docker', ['image', 'rm', image], {
      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
    });
  }

  public async listLoadedImagesInCluster(clusterName: string): Promise<readonly string[]> {
    const nodeName: string = `${clusterName}-control-plane`;
    const engineCommand: ContainerEngineCommand =
      (await this.resolveKindContainerCommand(nodeName)) ?? DockerClient.dockerCommand();

    const output: string[] = await this.shellRunner.run(
      engineCommand.executable,
      [
        ...engineCommand.argumentsPrefix,
        'exec',
        '--privileged',
        nodeName,
        'ctr',
        '--namespace=k8s.io',
        'images',
        'ls',
        '-q',
      ],
      {commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE},
    );

    return output
      .map((line): string => line.trim())
      .filter((line): boolean => line.length > 0)
      .filter((line): boolean => !line.startsWith('import-'));
  }

  private static dockerCommand(): ContainerEngineCommand {
    return {
      executable: constants.DOCKER,
      argumentsPrefix: [],
    };
  }

  private async resolveKindContainerCommand(nodeName: string): Promise<ContainerEngineCommand | undefined> {
    const cachedCommand: ContainerEngineCommand | undefined = this.kindContainerCommands.get(nodeName);
    if (cachedCommand) {
      return cachedCommand;
    }

    if (KindProviderResolver.current() !== constants.PODMAN) {
      const dockerCommand: ContainerEngineCommand = DockerClient.dockerCommand();
      if (await this.containerExists(dockerCommand, nodeName)) {
        this.kindContainerCommands.set(nodeName, dockerCommand);
        return dockerCommand;
      }
    }

    const podmanCommand: ContainerEngineCommand | undefined = await this.podmanClient.getKindContainerCommand(nodeName);
    if (podmanCommand) {
      this.kindContainerCommands.set(nodeName, podmanCommand);
    }

    return podmanCommand;
  }

  private async containerExists(command: ContainerEngineCommand, nodeName: string): Promise<boolean> {
    try {
      // `container exists` is Podman-only; `container inspect` is the portable existence probe.
      await this.shellRunner.run(
        command.executable,
        [...command.argumentsPrefix, 'container', 'inspect', '--format', '{{.Id}}', nodeName],
        {commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE, bestEffort: true},
      );
      return true;
    } catch {
      // best-effort probe: a missing Docker container may be owned by Podman instead
      return false;
    }
  }

  public async resumeStoppedClusterNode(clusterName: string): Promise<ClusterNodeResumeOutcome> {
    const nodeName: string = `${clusterName}-control-plane`;
    const engineCommand: ContainerEngineCommand = (await this.podmanClient.getKindContainerCommand(nodeName)) ?? {
      executable: constants.DOCKER,
      argumentsPrefix: [],
    };

    const state: string | undefined = await this.readContainerState(engineCommand, nodeName);

    if (state === undefined) {
      // The inspect answered nothing, which means either no engine is reachable or this cluster has no node
      // container. Only the first is worth reporting, and an engine info probe is the cheapest way to tell
      // the two apart without matching on engine error text.
      const resources: ContainerEngineResources | undefined = await this.resourceInspector.getAvailableResources();
      return resources === undefined ? ClusterNodeResumeOutcome.ENGINE_UNAVAILABLE : ClusterNodeResumeOutcome.UNCHANGED;
    }

    if (!DockerClient.STARTABLE_CONTAINER_STATES.has(state)) {
      return ClusterNodeResumeOutcome.UNCHANGED;
    }

    try {
      await this.shellRunner.run(engineCommand.executable, [...engineCommand.argumentsPrefix, 'start', nodeName], {
        commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
        timeoutMs: DockerClient.CONTAINER_LIFECYCLE_TIMEOUT_MS,
      });
      return ClusterNodeResumeOutcome.RESUMED;
    } catch (error) {
      // best-effort: a node container that refuses to start is reported as unchanged so the caller surfaces
      // the cluster failure it was already handling rather than this secondary one.
      this.logger.debug(`Unable to start the stopped cluster node container ${nodeName}`, error);
      return ClusterNodeResumeOutcome.UNCHANGED;
    }
  }

  private async readContainerState(
    engineCommand: ContainerEngineCommand,
    nodeName: string,
  ): Promise<string | undefined> {
    try {
      const output: string[] = await this.shellRunner.run(
        engineCommand.executable,
        [...engineCommand.argumentsPrefix, 'container', 'inspect', '--format', '{{.State.Status}}', nodeName],
        {
          commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
          timeoutMs: DockerClient.CONTAINER_LIFECYCLE_TIMEOUT_MS,
          bestEffort: true,
        },
      );
      return output.join('').trim() || undefined;
    } catch (error) {
      // best-effort probe: the container may be absent or the engine unreachable, and the caller
      // distinguishes those two cases itself.
      this.logger.debug(`Unable to read the state of container ${nodeName}`, error);
      return undefined;
    }
  }
}
