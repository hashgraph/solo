// SPDX-License-Identifier: Apache-2.0

import {KubeContainerOperationFailedError} from '../../../errors/kube-container-operation-failed-error.js';
import {KubeContainerInvalidPathError} from '../../../errors/kube-container-invalid-path-error.js';
import {KubeIllegalArgumentError} from '../../../errors/kube-illegal-argument-error.js';
import {KubeMissingArgumentError} from '../../../errors/kube-missing-argument-error.js';
import {container} from 'tsyringe-neo';
import {type Container} from '../../../resources/container/container.js';
import {type TDirectoryData} from '../../../t-directory-data.js';
import {type ContainerReference} from '../../../resources/container/container-reference.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {type ChildProcessByStdio, spawn} from 'node:child_process';
import {v4 as uuid4} from 'uuid';
import * as tar from 'tar';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type TarCreateFilter} from '../../../../../types/aliases.js';
import {type Context} from '../../../../../types/index.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import type Stream from 'node:stream';
import * as constants from '../../../../../core/constants.js';
import {SubprocessEnvironment} from '../../../../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../../../core/subprocess-command-profile.js';
import type * as stream from 'node:stream';
import {platform} from 'node:process';
import {PathEx} from '../../../../../business/utils/path-ex.js';
import eol from 'eol';

export class K8ClientContainer implements Container {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly containerReference: ContainerReference,
    private readonly pods: Pods,
    private readonly kubectlInstallationDirectory: string,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  private async getContext(): Promise<string> {
    return this.kubeConfig.getCurrentContext();
  }

  /**
   * Waits until the pod for this container reference is visible in the API before
   * `copyTo`, `copyFrom`, or `execContainer`.
   *
   * Uses {@link Pods.waitForPodByReference} and maps failures to
   * {@link IllegalArgumentError} with the pod name.
   *
   * @param maxAttempts - forwarded to {@link Pods.waitForPodByReference} (default 20)
   * @param delayMs - forwarded to {@link Pods.waitForPodByReference} (default 3000 ms)
   */
  private async waitForPod(maxAttempts: number = 20, delayMs: number = 3000): Promise<void> {
    const podName: string = this.containerReference.parentReference.name.toString();
    try {
      await this.pods.waitForPodByReference(this.containerReference.parentReference, maxAttempts, delayMs);
    } catch {
      throw new KubeIllegalArgumentError(`Invalid pod ${podName}`);
    }
  }

  private async execKubectl(
    arguments_: string[],
    outputPassThroughStream?: stream.PassThrough,
    errorPassThroughStream?: stream.PassThrough,
  ): Promise<string> {
    const context: Context = await this.getContext();
    const fullArguments: string[] = ['--context', context, ...arguments_];
    this.logger.debug(`Executing kubectl with arguments: ${fullArguments.join(' ')}`);

    return new Promise((resolve, reject): void => {
      const callMessage: string = `${constants.KUBECTL} ${fullArguments.join(' ')}`;
      const childProcess: ChildProcessByStdio<null, Stream.Readable, Stream.Readable> = spawn(
        constants.KUBECTL,
        fullArguments,
        {
          shell: false,
          env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL, {
            PATH: `${this.kubectlInstallationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
          }),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: os.platform() === 'win32',
        },
      );

      let stdout: string = '';
      let stderr: string = '';

      childProcess.stdout.on('data', (chunk): void => {
        if (outputPassThroughStream) {
          outputPassThroughStream.write(chunk);
        }
        stdout += chunk.toString();
      });

      childProcess.stderr.on('data', (chunk): void => {
        if (errorPassThroughStream) {
          errorPassThroughStream.write(chunk);
        }
        stderr += chunk.toString();
      });

      childProcess.on('error', (error): void => {
        reject(new KubeContainerOperationFailedError(`container call: ${callMessage}, failed to start`, error));
      });

      childProcess.on('close', (code): void => {
        if (code === 0) {
          resolve(stdout || stderr);
        } else {
          reject(
            new KubeContainerOperationFailedError(
              `container call: ${callMessage}, failed with code ${code}`,
              new Error(stderr || stdout),
            ),
          );
        }
      });
    });
  }

  /**
   * Execute `kubectl cp` with retries and optional verification.
   *
   * @param source - kubectl cp source, e.g. `<ns>/<pod>:/path` or `/local/path`
   * @param destination - kubectl cp destination, e.g. `/local/path` or `<ns>/<pod>:/path`
   * @param containerName - name of the container for -c flag
   * @param verifyPath - local filesystem path to verify after copy (usually the destination for copyFrom)
   * @param expectedSize - optional expected file size for strict verification
   */
  private async execKubectlCp(
    source: string,
    destination: string,
    containerName: string,
    verifyPath: string,
    expectedSize?: number,
  ): Promise<void> {
    const maxAttempts: number = constants.CONTAINER_COPY_MAX_ATTEMPTS;
    source = this.toKubectlSafePath(source);
    destination = this.toKubectlSafePath(destination);

    const arguments_: string[] = ['cp', source, destination, '-c', containerName];

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.execKubectl(arguments_);

        if (!fs.existsSync(verifyPath)) {
          throw new KubeContainerInvalidPathError('copy verification', verifyPath);
        }

        const stat: fs.Stats = fs.statSync(verifyPath);

        if (expectedSize !== undefined && stat.size !== expectedSize) {
          throw new KubeContainerInvalidPathError('copy size verification', verifyPath);
        }

        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }

        // backoff between retries
        await sleep(Duration.ofMillis(attempt * constants.CONTAINER_COPY_BACKOFF_MS));
      }
    }
  }

  private toKubectlSafePath(path: string): string {
    // kubectl cp does not handle windows path with drive letters because of the colon, so we need to convert
    // C:\path\to\file\file.txt to the format \\localhost\c$\path\to\file\file.txt
    if (platform === 'win32') {
      const driveLetterMatch: RegExpMatchArray | null = path.match(/^([a-zA-Z]):\\/);
      if (driveLetterMatch) {
        const driveLetter: string = driveLetterMatch[1].toLowerCase();
        path = `//localhost/${driveLetter}$${path.slice(2)}`;
      }
    }
    return path;
  }

  public async copyFrom(sourcePath: string, destinationDirectory: string): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();
    sourcePath = this.toKubectlSafePath(sourcePath);
    destinationDirectory = this.toKubectlSafePath(destinationDirectory);

    await this.waitForPod();

    if (!fs.existsSync(destinationDirectory)) {
      throw new KubeContainerInvalidPathError('destination', destinationDirectory);
    }

    this.logger.info(
      `copyFrom: [srcPath=${sourcePath}, destDir=${destinationDirectory}] from ${namespace.name}/${podName}:${containerName}`,
    );

    let entries: TDirectoryData[] = await this.listDir(sourcePath);
    if (entries.length !== 1) {
      throw new KubeContainerInvalidPathError('copyFrom source', sourcePath);
    }
    // handle symbolic link
    if (entries[0].name.includes(' -> ')) {
      const arrowIndex: number = entries[0].name.indexOf(' -> ');
      const targetSuffix: string = entries[0].name.slice(arrowIndex + 4);
      const redirectSourcePath: string = `${path.dirname(sourcePath)}/${targetSuffix}`;
      entries = await this.listDir(redirectSourcePath);
      if (entries.length !== 1) {
        throw new KubeContainerInvalidPathError('copyFrom redirect source', redirectSourcePath);
      }
    }

    const sourceFileDesc: TDirectoryData = entries[0];
    const sourceFileSize: number = Number.parseInt(sourceFileDesc.size, 10);

    const resolvedRemotePath: string = sourceFileDesc.name;
    const sourceFileName: string = path.basename(resolvedRemotePath);
    const destinationPath: string = PathEx.join(destinationDirectory, sourceFileName);

    this.logger.info(
      `copyFrom: beginning copy [container: ${containerName} ${namespace.name}/${podName}:${resolvedRemotePath} ${destinationPath}]`,
    );

    const remoteSource: string = `${namespace.name}/${podName}:${resolvedRemotePath}`;

    await this.execKubectlCp(remoteSource, destinationPath, containerName, destinationPath, sourceFileSize);

    return true;
  }

  public async copyTo(sourcePath: string, destinationDirectory: string, filter?: TarCreateFilter): Promise<boolean> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();

    await this.waitForPod();

    if (!(await this.hasDir(destinationDirectory))) {
      throw new KubeContainerInvalidPathError('destination', destinationDirectory);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new KubeContainerInvalidPathError('source', sourcePath);
    }

    const remoteDestination: string = `${namespace.name}/${podName}:${destinationDirectory}`;

    this.logger.info(
      `copyTo: [srcPath=${sourcePath}, destDir=${destinationDirectory}] to ${remoteDestination} (container=${containerName})`,
    );

    let localPathToCopy: string = sourcePath;
    let temporaryDirectory: string | undefined;
    let temporaryTar: string | undefined;

    try {
      const sourceFileName: string = path.basename(sourcePath);
      if (sourceFileName.endsWith('.sh') && os.platform() === 'win32') {
        // For text files on Windows, convert line endings to LF to avoid issues in Linux containers.
        temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-kubectl-cp-src-'));
        const temporarySourcePath: string = PathEx.join(temporaryDirectory, sourceFileName);
        let content: string = fs.readFileSync(sourcePath, 'utf8');

        // Convert CRLF to LF
        content = eol.lf(content);

        // Write back
        fs.writeFileSync(temporarySourcePath, content);
        localPathToCopy = temporarySourcePath;
      }
      if (filter) {
        const sourceDirectory: string = path.dirname(sourcePath);

        temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-kubectl-cp-src-'));
        temporaryTar = PathEx.join(temporaryDirectory, `${sourceFileName}-${uuid4()}.tar`);

        // Create a filtered tarball
        await tar.c({file: temporaryTar, cwd: sourceDirectory, filter}, [sourceFileName]);
        // Extract the filtered content into the temporaryDirectory.
        await tar.x({file: temporaryTar, cwd: temporaryDirectory});

        localPathToCopy = PathEx.join(temporaryDirectory, sourceFileName);

        if (!fs.existsSync(localPathToCopy)) {
          throw new KubeContainerInvalidPathError('filtered source', localPathToCopy);
        }
      }

      this.logger.info(`copyTo: beginning copy [container: ${containerName} ${localPathToCopy} ${remoteDestination}]`);

      await this.execKubectlCp(localPathToCopy, remoteDestination, containerName, localPathToCopy);

      return true;
    } finally {
      // Clean up temp artifacts if any.
      if (temporaryTar && fs.existsSync(temporaryTar)) {
        try {
          fs.rmSync(temporaryTar);
        } catch {
          // ignore
        }
      }
      if (temporaryDirectory && fs.existsSync(temporaryDirectory)) {
        try {
          fs.rmSync(temporaryDirectory, {recursive: true, force: true});
        } catch {
          // ignore
        }
      }
    }
  }

  public async execContainer(
    cmd: string | string[],
    outputPassThroughStream?: stream.PassThrough,
    errorPassThroughStream?: stream.PassThrough,
  ): Promise<string> {
    const namespace: NamespaceName = this.containerReference.parentReference.namespace;
    const podName: string = this.containerReference.parentReference.name.toString();
    const containerName: string = this.containerReference.name.toString();

    await this.waitForPod();

    if (!cmd) {
      throw new KubeMissingArgumentError('command cannot be empty');
    }

    const command: string[] = Array.isArray(cmd) ? cmd : cmd.split(' ');

    this.logger.info(
      `execContainer: beginning call [podName: ${podName} -n ${namespace.name} -c ${containerName} -- ${command.join(' ')}]`,
    );

    const arguments_: string[] = ['exec', podName, '-n', namespace.name, '-c', containerName, '--', ...command];

    // Retry transient exec failures that occur before the command runs: kubelet reporting "container not found" during rolling restarts, and API server to kubelet tunnel errors (connection upgrade, dial, timeout).
    const maxAttempts: number = 30;
    const retryableTransientFailure: RegExp =
      /(container not found|unable to upgrade connection|internal error occurred: timeout occurred|error dialing backend|connection reset by peer)/i;

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.execKubectl(arguments_, outputPassThroughStream, errorPassThroughStream);
      } catch (error) {
        const message: string = error instanceof Error ? error.message : `${error}`;

        if (!retryableTransientFailure.test(message) || attempt === maxAttempts) {
          throw error;
        }

        this.logger.warn(
          `execContainer: transient failure on attempt ${attempt} of ${maxAttempts} [podName: ${podName} -n ${namespace.name} -c ${containerName}], retrying: ${message}`,
        );
        await sleep(Duration.ofMillis(1000));
      }
    }

    throw new KubeContainerOperationFailedError(`exec ${command.join(' ')}`, new Error('failed after retries'));
  }

  public async hasDir(destinationPath: string): Promise<boolean> {
    const maxAttempts: number = 3;

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const result: string = await this.probeDirectory(destinationPath);

      if (result === 'true' || result === 'false') {
        return result === 'true';
      }

      // an exec stream cut mid-flight (e.g. containerd restart) can exit 0 with no output, so only the literal probe answers are trusted
      this.logger.warn(
        `hasDir: unexpected probe output '${result}' on attempt ${attempt} of ${maxAttempts} [podName: ${this.containerReference.parentReference.name} -c ${this.containerReference.name}, path: ${destinationPath}]`,
      );

      if (attempt < maxAttempts) {
        await sleep(Duration.ofMillis(attempt * 1000));
      }
    }

    throw new KubeContainerOperationFailedError(
      `hasDir ${destinationPath}`,
      new Error('directory probe returned no usable output after retries'),
    );
  }

  private async probeDirectory(destinationPath: string): Promise<string> {
    const bashScript: string = `[[ -d "${destinationPath}" ]] && echo -n "true" || echo -n "false"`;
    try {
      return await this.execContainer(['bash', '-c', bashScript]);
    } catch (error) {
      this.logger.debug(
        `hasDir failed using bash for ${this.containerReference.parentReference.name}:${this.containerReference.name}, retrying with /bin/sh`,
        error,
      );
      const shScript: string = `[ -d "${destinationPath}" ] && echo -n "true" || echo -n "false"`;
      return await this.execContainer(['/bin/sh', '-c', shScript]);
    }
  }

  public async hasFile(destinationPath: string, filters: object = {}): Promise<boolean> {
    const parentDirectory: string = path.dirname(destinationPath);
    const fileName: string = path.basename(destinationPath);
    const filterMap: Map<string, string> = new Map(Object.entries(filters));

    try {
      const entries: TDirectoryData[] = await this.listDir(parentDirectory);

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found: boolean = true;

          for (const [field, value] of filterMap.entries()) {
            this.logger.debug(
              `Checking file ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}; ${field} expected ${value}, found ${item[field]}`,
              {filters},
            );
            if (`${value}` !== `${item[field]}`) {
              found = false;
              break;
            }
          }

          if (found) {
            this.logger.debug(
              `File check succeeded ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}`,
              {
                filters,
              },
            );
            return true;
          }
        }
      }
    } catch (error) {
      throw new KubeContainerOperationFailedError(`check file ${destinationPath}`, error);
    }

    return false;
  }

  public async listDir(destinationPath: string): Promise<TDirectoryData[]> {
    try {
      const output: string = await this.execContainer(['ls', '-la', destinationPath]);
      if (!output) {
        return [];
      }

      // parse the output and return the entries
      const items: TDirectoryData[] = [];
      const lines: string[] = output.split('\n');
      for (let line of lines) {
        line = line.replaceAll(/\s+/g, '|');
        const parts: string[] = line.split('|');
        if (parts.length >= 9) {
          let name: string = parts.at(-1) as string;
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let index: number = parts.length - 1; index > 8; index--) {
            name = `${parts[index - 1]} ${name}`;
          }

          if (name !== '.' && name !== '..') {
            const permission: string = parts[0];
            const item: TDirectoryData = {
              directory: permission[0] === 'd',
              owner: parts[2],
              group: parts[3],
              size: parts[4],
              modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
              name,
            };

            items.push(item);
          }
        }
      }

      return items;
    } catch (error) {
      throw new KubeContainerOperationFailedError(`list dir ${destinationPath}`, error);
    }
  }

  public async mkdir(destinationPath: string): Promise<string> {
    return this.execContainer(['bash', '-c', `mkdir -p "${destinationPath}"`]);
  }
}
