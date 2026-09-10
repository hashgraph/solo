// SPDX-License-Identifier: Apache-2.0

/**
 * Persistently port-forward a local port to a port on a Kubernetes pod.
 * This solves an issue where a detached port-forward can be terminated by network issues.
 * Usage: persist-port-forward <namespace> <pod> <context> <port_map> [kubectl_executable] [kubectl_installation_dir]
 * Note: <port_map> needs to be in the format <local>:<remote>.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {SubprocessEnvironment} from '../../../../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../../../core/subprocess-command-profile.js';

// eslint-disable-next-line unicorn/no-unreadable-array-destructuring
const [, , NAMESPACE, POD, CONTEXT, PORT_MAP, KUBECTL_EXECUTABLE, KUBECTL_INSTALLATION_DIRECTORY, EXTERNAL_ADDRESS] =
  process.argv;

if (!NAMESPACE || !POD || !CONTEXT || !PORT_MAP) {
  console.error(
    'Usage: persist-port-forward <namespace> <pod> <context> <port_map> [kubectl_executable] [kubectl_installation_dir]',
  );
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  process.exit(2);
}

const MIN_BACKOFF: number = 1; // seconds
const MAX_BACKOFF: number = 60; // seconds
const POD_EXISTENCE_POLL_INTERVAL_SECONDS: number = 5;
const POD_MISSING_EXIT_THRESHOLD: number = 3;
const CLUSTER_UNAVAILABLE_EXIT_THRESHOLD: number = 3;
let backoff: number = MIN_BACKOFF;
let child: ChildProcess | undefined;
let stopping: boolean = false;
let exitForMissingTarget: boolean = false;
let consecutivePodMissingChecks: number = 0;
let consecutiveClusterUnavailableChecks: number = 0;
let targetResource: string = POD;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecuteKubectlOptions {
  captureOutput: boolean;
  trackAsChild: boolean;
}

function isMissingContextOrNamespaceError(message: string): boolean {
  const errorText: string = message.toLowerCase();

  const missingContext: boolean =
    (errorText.includes('context') && errorText.includes('does not exist')) ||
    (errorText.includes('no context exists with the name') && errorText.includes(CONTEXT.toLowerCase()));
  const missingNamespace: boolean =
    (errorText.includes('namespaces') && errorText.includes('not found')) ||
    (errorText.includes('namespace') && errorText.includes('does not exist'));

  return missingContext || missingNamespace;
}

function isMissingPodError(message: string): boolean {
  const errorText: string = message.toLowerCase();

  return (
    errorText.includes('notfound') ||
    (errorText.includes('not found') && (errorText.includes('pods') || errorText.includes('pod')))
  );
}

function extractPodName(resource: string): string | undefined {
  const podPrefix: string = 'pods/';
  if (!resource.startsWith(podPrefix)) {
    return undefined;
  }
  return resource.slice(podPrefix.length);
}

function derivePodWorkloadPrefix(podName: string): string {
  if (!podName.includes('-')) {
    return podName;
  }

  const deploymentStyleMatch: RegExpMatchArray | null = podName.match(/^(.*)-[a-f0-9]{9,10}-[a-z0-9]{5}$/);
  if (deploymentStyleMatch?.[1]) {
    return deploymentStyleMatch[1];
  }

  const statefulSetStyleMatch: RegExpMatchArray | null = podName.match(/^(.*)-\d+$/);
  if (statefulSetStyleMatch?.[1]) {
    return statefulSetStyleMatch[1];
  }

  return podName;
}

async function findReplacementPodResource(kubectlInstallationDirectory: string): Promise<string | undefined> {
  const currentPodName: string | undefined = extractPodName(targetResource);
  if (!currentPodName) {
    return undefined;
  }

  const workloadPrefix: string = derivePodWorkloadPrefix(currentPodName);
  const currentPodSegmentCount: number = currentPodName.split('-').length;
  const runningPodsResult: CommandResult = await executeKubectl(
    ['--context', CONTEXT, '-n', NAMESPACE, 'get', 'pods', '--field-selector=status.phase=Running', '-o', 'name'],
    kubectlInstallationDirectory,
    {captureOutput: true, trackAsChild: false},
  );
  if (runningPodsResult.code !== 0) {
    return undefined;
  }

  const replacementPodName: string | undefined = runningPodsResult.stdout
    .split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.startsWith('pod/'))
    .map((line: string): string => line.replace(/^pod\//, ''))
    .find(
      (podName: string): boolean =>
        podName !== currentPodName &&
        podName.split('-').length === currentPodSegmentCount &&
        (podName === workloadPrefix || podName.startsWith(`${workloadPrefix}-`)),
    );

  if (!replacementPodName) {
    return undefined;
  }

  return `pods/${replacementPodName}`;
}

async function hasReplacementPodCandidate(kubectlInstallationDirectory: string): Promise<boolean> {
  const currentPodName: string | undefined = extractPodName(targetResource);
  if (!currentPodName) {
    return false;
  }

  const workloadPrefix: string = derivePodWorkloadPrefix(currentPodName);
  const currentPodSegmentCount: number = currentPodName.split('-').length;
  const podsResult: CommandResult = await executeKubectl(
    ['--context', CONTEXT, '-n', NAMESPACE, 'get', 'pods', '-o', 'name'],
    kubectlInstallationDirectory,
    {captureOutput: true, trackAsChild: false},
  );
  if (podsResult.code !== 0) {
    return false;
  }

  return podsResult.stdout
    .split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.startsWith('pod/'))
    .map((line: string): string => line.replace(/^pod\//, ''))
    .some(
      (podName: string): boolean =>
        podName !== currentPodName &&
        podName.split('-').length === currentPodSegmentCount &&
        (podName === workloadPrefix || podName.startsWith(`${workloadPrefix}-`)),
    );
}

function isClusterUnavailableError(message: string): boolean {
  const errorText: string = message.toLowerCase();

  const genericConnectionFailure: boolean =
    errorText.includes('unable to connect to the server') ||
    errorText.includes('the connection to the server') ||
    errorText.includes('server has asked for the client to provide credentials');
  const dialTcpFailure: boolean =
    errorText.includes('dial tcp') &&
    (errorText.includes('connection refused') ||
      errorText.includes('no such host') ||
      errorText.includes('i/o timeout'));

  return genericConnectionFailure || dialTcpFailure;
}

async function executeKubectl(
  commandArguments: string[],
  kubectlInstallationDirectory: string,
  options: ExecuteKubectlOptions,
): Promise<CommandResult> {
  return await new Promise((resolve): void => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const kubectlCommand: string = KUBECTL_EXECUTABLE || 'kubectl';

    const kubectlProcess: ChildProcess = spawn(kubectlCommand, commandArguments, {
      shell: false,
      // The parent baked its session PATH and variables into this worker's environment at spawn.
      env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL, {
        PATH: `${kubectlInstallationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
      }),
      stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: os.platform() === 'win32',
    });

    if (options.trackAsChild) {
      child = kubectlProcess;
    }

    kubectlProcess.stdout?.on('data', (chunk: Buffer): void => {
      stdoutChunks.push(chunk.toString());
    });
    kubectlProcess.stderr?.on('data', (chunk: Buffer): void => {
      stderrChunks.push(chunk.toString());
    });

    kubectlProcess.on('error', (error): void => {
      resolve({
        code: 1,
        stdout: stdoutChunks.join(''),
        stderr: `${stderrChunks.join('')}\n${String(error)}`,
      });
    });

    kubectlProcess.on('close', (code, signal): void => {
      if (options.trackAsChild && child?.pid === kubectlProcess.pid) {
        child = undefined;
      }

      const stderrOutput: string = stderrChunks.join('');
      const signalMessage: string = signal ? `\nProcess terminated by signal: ${signal}` : '';
      let exitCode: number = 1;
      if (typeof code === 'number') {
        exitCode = code;
      } else if (stopping && (signal === 'SIGTERM' || signal === 'SIGINT')) {
        exitCode = 0;
      }

      resolve({
        code: exitCode,
        stdout: stdoutChunks.join(''),
        stderr: `${stderrOutput}${signalMessage}`,
      });
    });
  });
}

/**
 * Check whether the original pod target still exists.
 * If the pod has been removed, this persistent process should stop and not auto-restart.
 */
async function shouldExitForMissingTarget(kubectlInstallationDirectory: string): Promise<boolean> {
  // The pod argument is the original pod reference this process was started for.
  const podResult: CommandResult = await executeKubectl(
    ['--context', CONTEXT, '-n', NAMESPACE, 'get', targetResource, '-o', 'name'],
    kubectlInstallationDirectory,
    {captureOutput: true, trackAsChild: false},
  );
  if (podResult.code !== 0) {
    const combinedPodError: string = `${podResult.stderr}\n${podResult.stdout}`.trim();
    if (isMissingContextOrNamespaceError(combinedPodError)) {
      console.error(
        `Stopping persistent port-forward: original target/context is no longer available (${combinedPodError || 'unknown kubectl error'})`,
      );
      return true;
    }

    if (isMissingPodError(combinedPodError)) {
      const replacementResource: string | undefined = await findReplacementPodResource(kubectlInstallationDirectory);
      if (replacementResource) {
        console.error(`Switching persistent port-forward target from ${targetResource} to ${replacementResource}`);
        targetResource = replacementResource;
        consecutivePodMissingChecks = 0;
        if (child) {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
        }
        return false;
      }

      if (await hasReplacementPodCandidate(kubectlInstallationDirectory)) {
        consecutivePodMissingChecks = 0;
        return false;
      }

      consecutivePodMissingChecks += 1;
      if (consecutivePodMissingChecks >= POD_MISSING_EXIT_THRESHOLD) {
        console.error(
          `Stopping persistent port-forward: target pod appears gone after ${consecutivePodMissingChecks} checks (${combinedPodError || 'unknown kubectl error'})`,
        );
        return true;
      }
      return false;
    }

    if (isClusterUnavailableError(combinedPodError)) {
      consecutiveClusterUnavailableChecks += 1;
      if (consecutiveClusterUnavailableChecks >= CLUSTER_UNAVAILABLE_EXIT_THRESHOLD) {
        console.error(
          `Stopping persistent port-forward: cluster appears unavailable after ${consecutiveClusterUnavailableChecks} checks (${combinedPodError || 'unknown kubectl error'})`,
        );
        return true;
      }
      return false;
    }

    consecutivePodMissingChecks = 0;
    consecutiveClusterUnavailableChecks = 0;
    return false;
  }

  consecutivePodMissingChecks = 0;
  consecutiveClusterUnavailableChecks = 0;
  return false;
}

function runKubectl(kubectlInstallationDirectory: string): Promise<number> {
  const arguments_: string[] = ['port-forward', '-n', NAMESPACE];
  if (EXTERNAL_ADDRESS) {
    arguments_.push('--address', EXTERNAL_ADDRESS);
  }
  if (CONTEXT) {
    arguments_.push('--context', CONTEXT);
  }

  const [LOCAL, REMOTE] = PORT_MAP.split(':');
  arguments_.push(targetResource, `${LOCAL}:${REMOTE}`);

  console.error(`Starting kubectl ${arguments_.join(' ')}`);

  return executeKubectl(arguments_, kubectlInstallationDirectory, {captureOutput: false, trackAsChild: true}).then(
    (result: CommandResult): number => {
      if (result.code !== 0) {
        console.error('Failed to start kubectl:', result.stderr || `exit code ${result.code}`);
      }
      return result.code;
    },
  );
}

function sleepSeconds(s: number): Promise<void> {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  return new Promise((res): NodeJS.Timeout => setTimeout(res, s * 1000));
}

async function runKubectlUntilPodMissing(kubectlInstallationDirectory: string): Promise<number> {
  const TICK: unique symbol = Symbol('tick');
  const kubectlRunPromise: Promise<number> = runKubectl(kubectlInstallationDirectory);

  while (!stopping && !exitForMissingTarget) {
    const result: number | typeof TICK = await Promise.race<number | typeof TICK>([
      kubectlRunPromise,
      sleepSeconds(POD_EXISTENCE_POLL_INTERVAL_SECONDS).then((): typeof TICK => TICK),
    ]);

    if (result !== TICK) {
      return result;
    }

    if (await shouldExitForMissingTarget(kubectlInstallationDirectory)) {
      exitForMissingTarget = true;
      if (child) {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
      break;
    }
  }

  return await kubectlRunPromise;
}

async function main(): Promise<void> {
  const kubectlInstallationDirectory: string = KUBECTL_INSTALLATION_DIRECTORY || '';
  while (!stopping && !exitForMissingTarget) {
    if (await shouldExitForMissingTarget(kubectlInstallationDirectory)) {
      exitForMissingTarget = true;
      break;
    }

    const rc: number = await runKubectlUntilPodMissing(kubectlInstallationDirectory);
    if (stopping || exitForMissingTarget) {
      break;
    }
    console.error(`kubectl exited with code ${rc}, restarting in ${backoff} seconds`);
    await sleepSeconds(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  }
}

function shutdown(signal: string): void {
  stopping = true;
  console.error(`Received ${signal}, shutting down`);
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  // give processes a moment to terminate gracefully
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  setTimeout((): never => process.exit(0), 500);
}

process.on('SIGINT', (): void => shutdown('SIGINT'));
process.on('SIGTERM', (): void => shutdown('SIGTERM'));

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error): never => {
  console.error('Unhandled error in persist-port-forward:', error);
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  process.exit(1);
});
