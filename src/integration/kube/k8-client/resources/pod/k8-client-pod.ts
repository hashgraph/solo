// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../../../resources/pod/pod.js';
import {PortUtilities} from '../../../../../business/utils/port-utilities.js';
import {PodReference} from '../../../resources/pod/pod-reference.js';
import {KubeContainerOperationFailedError} from '../../../errors/kube-container-operation-failed-error.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import {StatusCodes} from 'http-status-codes';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {
  type KubeConfig,
  type CoreV1Api,
  V1Pod,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Probe,
  V1PodSpec,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import * as constants from '../../../../../core/constants.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {K8ClientPodCondition} from './k8-client-pod-condition.js';
import {type PodCondition} from '../../../resources/pod/pod-condition.js';
import {K8ClientContainerStatus} from './k8-client-container-status.js';
import {type ContainerStatus} from '../../../resources/pod/container-status.js';
import {ShellRunner} from '../../../../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../../../../core/subprocess-command-profile.js';
import {SubprocessEnvironment} from '../../../../../core/subprocess-environment.js';
import chalk from 'chalk';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import find from 'find-process';
import type FindConfig from 'find-process';
import type ProcessInfo from 'find-process';

export class K8ClientPod implements Pod {
  private readonly logger: SoloLogger;

  public constructor(
    public readonly podReference: PodReference | null,
    private readonly pods: Pods,
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
    private readonly kubectlInstallationDirectory: string,
    public readonly labels?: Record<string, string>,
    public readonly startupProbeCommand?: string[],
    public readonly containerName?: ContainerName,
    public readonly containerImage?: string,
    public readonly containerCommand?: string[],
    public readonly conditions?: PodCondition[],
    public readonly podIp?: string,
    public readonly creationTimestamp?: Date,
    public readonly deletionTimestamp?: Date,
    public readonly phase?: string,
    public readonly allContainerStatuses?: ContainerStatus[],
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async killPod(gracePeriodSeconds: number = 1): Promise<void> {
    try {
      await this.kubeClient.deleteNamespacedPod({
        name: this.podReference.name.toString(),
        namespace: this.podReference.namespace.toString(),
        gracePeriodSeconds,
      });

      let podExists: boolean = true;
      while (podExists) {
        const pod: Pod = await this.pods.read(this.podReference);

        if (pod?.deletionTimestamp) {
          await sleep(Duration.ofSeconds(1));
        } else {
          podExists = false;
        }
      }
    } catch (error) {
      const errorMessage: string = `Failed to delete pod ${this.podReference.name.name} in namespace ${this.podReference.namespace}: ${error.message}`;

      // ApiException reports the HTTP status on error.code with an unparsed string body,
      // so the body-based checks alone miss it and a pod that is already gone fails the kill.
      if (
        KubeApiResponse.isNotFound(error) ||
        error.body?.code === StatusCodes.NOT_FOUND ||
        error.response?.body?.code === StatusCodes.NOT_FOUND
      ) {
        this.logger.info(`Pod not found: ${errorMessage}`, error);
        return;
      }

      throw new KubeContainerOperationFailedError(errorMessage, error);
    }
  }

  /**
   * Forward a local port to a port on the pod
   * @param localPort The local port to forward from
   * @param podPort The pod port to forward to
   * @param reuse - if true, reuse the port number from previous port forward operation
   * @param persist - if true, errors in port-forwarding will restart the port-forwarding, even after ts process has ended
   * @param isRetry
   * @returns Promise resolving to the port forwarder server when not detached,
   *          or the port number (which may differ from localPort if it was in use) when detached
   */
  public async portForward(
    localPort: number,
    podPort: number,
    reuse?: boolean,
    persist: boolean = false,
    externalAddress?: string,
    isRetry: boolean = false,
  ): Promise<number> {
    let availablePort: number = localPort;
    const localBindAddress: string = externalAddress || constants.LOCAL_HOST;
    const isWindows: boolean = os.platform() === 'win32';

    try {
      // first use http.request(url[, options][, callback]) GET method against localhost:localPort to kill any pre-existing
      // port-forward that is no longer active.  It doesn't matter what the response is.
      const url: string = `http://${constants.LOCAL_HOST}:${localPort}`;
      await new Promise<void>((resolve): void => {
        http
          .request(url, {method: 'GET'}, (response): void => {
            response.on('data', (): void => {
              // do nothing
            });
            response.on('end', (): void => {
              resolve();
            });
          })
          .on('close', (): void => {
            resolve();
          })
          .on('timeout', (): void => {
            resolve();
          })
          .on('information', (): void => {
            resolve();
          })
          .on('error', (): void => {
            resolve();
          })
          .setTimeout(Duration.ofMinutes(5).toMillis())
          .end();
      });
      this.logger.debug(`Returned from http request against http://${constants.LOCAL_HOST}:${localPort}`);

      let matchedProcesses: ProcessInfo[] = [];
      if (reuse) {
        try {
          matchedProcesses = await this.searchProcessListCommandByStrings([
            'port-forward',
            this.podReference.name.toString(),
          ]);
        } catch (error) {
          throw new KubeContainerOperationFailedError('process list for port-forward', error);
        }

        // Reuse an existing port-forward when at least one matching process is running.
        if (matchedProcesses.length > 0) {
          // Extract local port number from command output.
          // Persist mode commands can have extra trailing args (e.g. kubectl path),
          // so do not assume the last token is local:remote.
          const portMappingPattern: RegExp = /^(\d{1,5}):(\d{1,5})$/;
          let parsedPort: number | undefined;

          for (const process of matchedProcesses) {
            if (!process.cmd) {
              continue;
            }
            const tokens: string[] = process.cmd.split(/\s+/).filter(Boolean);
            for (const token of tokens) {
              const match: RegExpMatchArray | null = token.match(portMappingPattern);
              if (match) {
                const localPortCandidate: number = Number.parseInt(match[1], 10);
                if (!Number.isNaN(localPortCandidate) && localPortCandidate > 0 && localPortCandidate <= 65_535) {
                  parsedPort = localPortCandidate;
                  break;
                }
              }
            }
            if (parsedPort !== undefined) {
              break;
            }
          }

          if (parsedPort !== undefined) {
            availablePort = parsedPort;
            this.logger.info(`Reuse already enabled port ${availablePort}`);
            // port forward already enabled
            return availablePort;
          }

          this.logger.warn(
            `Unable to extract reusable local port from existing port-forward command(s): ${matchedProcesses
              .map((process): string => process.cmd)
              .join(' | ')}`,
          );
        }
      }

      // Find an available port starting from localPort with a 30-second timeout
      availablePort = await PortUtilities.findAvailablePort(localPort, Duration.ofSeconds(30).toMillis(), this.logger);

      if (availablePort === localPort) {
        this.logger.showUserUnlessOneShot(chalk.yellow(`Using requested port ${localPort}`));
      } else {
        this.logger.showUser(chalk.yellow(`Using available port ${availablePort}`));
      }
      this.logger.debug(
        `Creating port-forwarder for ${this.podReference.name}:${podPort} -> ${localBindAddress}:${availablePort}`,
      );

      this.logger.warn(
        'Port-forwarding in detached mode has to be manually stopped or will stop when the Kubernetes pod it ',
        'is connected to terminates.',
      );

      // If the persist flag is set, we need to run the port-forward in a detached process that restarts on failure even after the typescript process ends.
      const __filename: string = fileURLToPath(import.meta.url);
      const __dirname: string = path.dirname(__filename);

      let cmd: string;
      let cmdArguments: string[];
      if (persist) {
        // When running via tsx (dev/test), __filename ends in .ts; use tsx to run the .ts source.
        // In a compiled build it ends in .js; use node to run the compiled .js.
        const isTsx: boolean = __filename.endsWith('.ts');
        const persistScriptExtension: string = isTsx ? '.ts' : '.js';
        const useDirectNodeRuntime: boolean = isWindows;
        let persistCmd: string = isTsx ? 'tsx' : 'node';
        if (useDirectNodeRuntime) {
          persistCmd = process.execPath;
        }
        const persistRuntimeArguments: string[] = useDirectNodeRuntime && isTsx ? ['--import', 'tsx'] : [];
        const persistPortForwardScriptPath: string = path.resolve(
          __dirname,
          `persist-port-forward${persistScriptExtension}`,
        );

        cmd = persistCmd;
        cmdArguments = [
          ...persistRuntimeArguments,
          persistPortForwardScriptPath,
          this.podReference.namespace.name,
          `pods/${this.podReference.name}`,
          this.kubeConfig.currentContext,
          `${availablePort}:${podPort}`,
          constants.KUBECTL,
          this.kubectlInstallationDirectory,
        ];

        // WSL2 has issues with kubectl port-forward when binding to localhost, binding to all interfaces will trigger
        // a permission prompt which if hidden behind the terminal can cause the port-forward command to fail.
        if (!isWindows) {
          cmdArguments.push(localBindAddress);
        }
      } else {
        cmd = constants.KUBECTL;
        cmdArguments = [
          'port-forward',
          '-n',
          this.podReference.namespace.name,
          '--context',
          this.kubeConfig.currentContext,
        ];

        // WSL2 has issues with kubectl port-forward when binding to localhost, binding to all interfaces will trigger
        // a permission prompt which if hidden behind the terminal can cause the port-forward command to fail.
        if (!isWindows) {
          cmdArguments.push('--address', localBindAddress);
        }

        cmdArguments.push(`pods/${this.podReference.name}`, `${availablePort}:${podPort}`);

        if (isWindows) {
          cmdArguments = ['--headless', cmd, ...cmdArguments];
          cmd = String.raw`C:\Windows\System32\conhost.exe`;
        }
      }

      // shell:false to eliminate shell-injection; ShellRunner's detached spawn handles backgrounding.
      await new ShellRunner().run(cmd, cmdArguments, {
        verbose: true,
        detached: true,
        commandProfile: SubprocessCommandProfile.KUBECTL,
        environmentVariablesToAppend: {
          PATH: `${this.kubectlInstallationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
        },
        useShell: false,
      });

      return availablePort;
    } catch (error) {
      if (isWindows && !isRetry && error?.message?.includes('listen EACCES')) {
        // handle the case where port forwarding fails on Windows due to an issue with the WinNAT service.
        // Restarting the WinNAT service can resolve the issue, and then we can retry starting the port forwarder.
        // Example: listen EACCES: permission denied 127.0.0.1:50211
        try {
          await new ShellRunner().run('net', ['stop', 'winnat']);
        } catch (stopError) {
          const errorMessage: string =
            `Failed to stop WinNAT service: ${stopError.message}. Please open an administrator level terminal on Windows` +
            'and run:\nnet stop winnat && net start winnat\nto attempt to resolve port forwarding issues.  Run the corresponding ' +
            'Solo destroy command and try your Solo deploy commands again.  If you are unable to run as administrator, ' +
            'you may try rebooting your machine to resolve the issue.';
          this.logger.error(errorMessage, stopError);
          throw new KubeContainerOperationFailedError(errorMessage, stopError);
        }
        await new ShellRunner().run('net', ['start', 'winnat']);
        this.logger.warn('Restarted WinNAT service to recover from port forwarding failure on Windows');
        await sleep(Duration.ofSeconds(5)); // wait a bit for the service to restart before retrying
        return await this.portForward(localPort, podPort, reuse, persist, externalAddress, true);
      }

      const message: string = `failed to start port-forwarder [${this.podReference.name}:${podPort} -> ${localBindAddress}:${availablePort}]: ${error.message}`;
      throw new KubeContainerOperationFailedError(message, error);
    }
  }

  private async searchProcessListCommandByStrings(substringsToMatch: string[]): Promise<ProcessInfo[]> {
    let matchedProcesses: ProcessInfo[] = [];
    const findConfig: FindConfig = {
      skipSelf: true,
    };
    const processes: ProcessInfo[] = await find('name', substringsToMatch.shift(), findConfig);
    for (const substring of substringsToMatch) {
      matchedProcesses = processes.filter((p: ProcessInfo): boolean => {
        this.logger.debug(`Checking process PID ${p.pid} with p=${JSON.stringify(p)} for substring '${substring}'`);
        return p.cmd && p.cmd.includes(substring);
      });
    }
    for (const process of matchedProcesses) {
      this.logger.debug(`Found process with PID ${process.pid} and command ${process.cmd}`);
    }
    return matchedProcesses;
  }

  public async stopPortForward(port: number): Promise<void> {
    if (!port) {
      return;
    }

    this.logger.showUserUnlessOneShot(chalk.yellow(`Stopping port-forward for port [${port}]`));

    try {
      let matchedProcesses: ProcessInfo[] = await this.searchProcessListCommandByStrings(['port-forward', `${port}:`]);
      try {
        matchedProcesses = await this.searchProcessListCommandByStrings(['port-forward', `${port}:`]);
      } catch (error) {
        throw new KubeContainerOperationFailedError('process list for port-forward', error);
      }

      this.logger.debug(`Found ${matchedProcesses.length} processes matching port-forward and port ${port}`);

      // if length of matchedProcesses is 0 then could not find port forward running for this port
      if (!matchedProcesses || matchedProcesses.length === 0) {
        this.logger.debug(`No port-forward processes found for port ${port}`);
        return;
      }

      // Extract PIDs and kill the processes
      for (const pid of matchedProcesses.map((p: ProcessInfo): number => p.pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          this.logger.debug(`Successfully sent SIGTERM to PID: ${pid}`);

          // Wait a moment for graceful shutdown
          await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 1000));

          const foundProcess: ProcessInfo[] = await find('pid', pid.toString());

          if (foundProcess.length > 0) {
            this.logger.debug(
              `Process with PID ${pid} is still running after SIGTERM, attempting to kill with SIGKILL`,
            );
            process.kill(pid, 'SIGKILL');
          }
        } catch (killError) {
          this.logger.warn(`Failed to kill process ${pid}: ${killError.message}`);
        }
      }

      this.logger.debug(`Finished stopping port-forwarder for port [${port}]`);
    } catch (error) {
      const errorMessage: string = `Error stopping port-forward for port ${port}: ${error.message}`;
      this.logger.error(errorMessage);
      throw new KubeContainerOperationFailedError(errorMessage, error);
    }
  }

  public static toV1Pod(pod: Pod): V1Pod {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = pod.podReference.name.toString();
    v1Metadata.namespace = pod.podReference.namespace.toString();
    v1Metadata.labels = pod.labels;

    const v1ExecAction: V1ExecAction = new V1ExecAction();
    v1ExecAction.command = pod.startupProbeCommand;

    const v1Probe: V1Probe = new V1Probe();
    v1Probe.exec = v1ExecAction;

    const v1Container: V1Container = new V1Container();
    v1Container.name = pod.containerName.name;
    v1Container.image = pod.containerImage;
    v1Container.command = pod.containerCommand;
    v1Container.startupProbe = v1Probe;

    const v1Spec: V1PodSpec = new V1PodSpec();
    v1Spec.containers = [v1Container];

    const v1Pod: V1Pod = new V1Pod();
    v1Pod.metadata = v1Metadata;
    v1Pod.spec = v1Spec;

    return v1Pod;
  }

  public static fromV1Pod(
    v1Pod: V1Pod,
    pods: Pods,
    coreV1Api: CoreV1Api,
    kubeConfig: KubeConfig,
    kubectlInstallationDirectory: string,
  ): Pod {
    if (!v1Pod) {
      return undefined;
    }

    const allContainerStatuses: K8ClientContainerStatus[] = [
      ...(v1Pod.status?.initContainerStatuses ?? []),
      ...(v1Pod.status?.containerStatuses ?? []),
    ].map((status): K8ClientContainerStatus => K8ClientContainerStatus.from(status));

    return new K8ClientPod(
      PodReference.of(NamespaceName.of(v1Pod.metadata?.namespace), PodName.of(v1Pod.metadata?.name)),
      pods,
      coreV1Api,
      kubeConfig,
      kubectlInstallationDirectory,
      v1Pod.metadata.labels,
      v1Pod.spec.containers[0]?.startupProbe?.exec?.command,
      ContainerName.of(v1Pod.spec.containers[0]?.name),
      v1Pod.spec.containers[0]?.image,
      v1Pod.spec.containers[0]?.command,
      v1Pod.status?.conditions?.map(
        (condition): K8ClientPodCondition => new K8ClientPodCondition(condition.type, condition.status),
      ),
      v1Pod.status?.podIP,
      v1Pod.metadata?.creationTimestamp ? new Date(v1Pod.metadata.creationTimestamp) : undefined,
      v1Pod.metadata.deletionTimestamp ? new Date(v1Pod.metadata.deletionTimestamp) : undefined,
      v1Pod.status?.phase,
      allContainerStatuses,
    );
  }
}
