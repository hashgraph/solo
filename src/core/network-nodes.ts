// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, LOG_CONFIG_ZIP_SUFFIX, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
import fs from 'node:fs';
import os from 'node:os';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import * as constants from './constants.js';
import {sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';
import {K8} from '../integration/kube/k8.js';
import {Container} from '../integration/kube/resources/container/container.js';
import {NodeStatusEnums} from './enumerations.js';
import chalk from 'chalk';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {SoloErrors} from './errors/solo-errors.js';
import {Zippy} from './zippy.js';
import {PcesTrimmer} from './pces-trimmer.js';

const STATE_METADATA_FILE_NAME: string = 'stateMetadata.txt';

// Must match the stderr text `wait-for-stable-saved-state.sh` prints before exiting 14.
const NO_HASH_TOOL_STDERR: string = 'No SHA-256 implementation found in container';

/**
 * Class to manage network nodes
 */
@injectable()
export class NetworkNodes {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
  }

  /**
   * Download logs files from all network pods and save to local solo log directory
   * @param namespace - the namespace of the network
   * @param [contexts]
   * @param [baseDirectory] - optional base directory to save logs, defaults to SOLO_LOGS_DIR
   * @param [excludeSensitiveData] - when true, omit TLS certificates, private keys, and data/keys from the archive
   * @returns a promise that resolves when the logs are downloaded
   */
  public async getLogs(
    namespace: NamespaceName,
    contexts?: string[],
    baseDirectory?: string,
    excludeSensitiveData?: boolean,
  ): Promise<void[]> {
    const podsData: {pod: Pod; context?: string}[] = [];

    if (contexts) {
      for (const context of contexts) {
        const pods: Pod[] = await this.k8Factory
          .getK8(context)
          .pods()
          .list(namespace, ['solo.hedera.com/type=network-node']);
        for (const pod of pods) {
          podsData.push({pod, context});
        }
      }
    } else {
      const pods: Pod[] = await this.k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      for (const pod of pods) {
        podsData.push({pod});
      }
    }

    const logBaseDirectory: string = baseDirectory || SOLO_LOGS_DIR;

    const promises: Promise<void>[] = [];
    for (const podData of podsData) {
      promises.push(this.getLog(podData.pod, namespace, logBaseDirectory, podData.context, excludeSensitiveData));
    }
    this.logger.showUser(`Configurations and logs saved to ${logBaseDirectory}`);
    return await Promise.all(promises);
  }

  private async getLog(
    pod: Pod,
    namespace: NamespaceName,
    baseDirectory: string,
    context?: string,
    excludeSensitiveData?: boolean,
  ): Promise<void> {
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): begin...`);
    const targetDirectory: string = PathEx.join(baseDirectory, namespace.name);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);
      const scriptName: string = 'support-zip.sh';
      const sourcePath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName); // script source path
      const k8: K8 = this.k8Factory.getK8(context);
      const container: Container = k8.containers().readByRef(containerReference);

      await container.copyTo(sourcePath, `${HEDERA_HAPI_PATH}`);

      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system

      await container.execContainer([
        'bash',
        '-c',
        `sync ${HEDERA_HAPI_PATH} && chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);

      await container.execContainer(['bash', '-c', `chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await container.execContainer(
        `${HEDERA_HAPI_PATH}/${scriptName} true ${excludeSensitiveData === true ? 'true' : 'false'}`,
      );
      await container.copyFrom(
        `${HEDERA_HAPI_PATH}/data/${podReference.name}${LOG_CONFIG_ZIP_SUFFIX}`,
        targetDirectory,
      );
      this.logger.showUser(
        `Log zip file ${podReference.name}${LOG_CONFIG_ZIP_SUFFIX} downloaded to ${targetDirectory}`,
      );
    } catch (error) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podReference}`, error);
      this.logger.showUser(chalk.red(`${constants.NODE_LOG_FAILURE_MSG} ${podReference}`));
    }
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): ...end`);
  }

  /**
   * Download state files from a pod
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @param [context]
   * @param [baseDirectory] - optional base directory to save state files, defaults to SOLO_LOGS_DIR
   * @returns a promise that resolves when the state files are downloaded
   */
  public async getStatesFromPod(
    namespace: NamespaceName,
    nodeAlias: string,
    context?: string,
    baseDirectory?: string,
    deploymentPhase?: DeploymentPhase,
  ): Promise<void[]> {
    const pods: Pod[] = await this.k8Factory
      .getK8(context)
      .pods()
      .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

    // get length of pods
    const stateBaseDirectory: string = baseDirectory || SOLO_LOGS_DIR;
    const promises: Promise<void>[] = [];
    for (const pod of pods) {
      promises.push(this.getState(pod, namespace, stateBaseDirectory, context, deploymentPhase));
    }
    return await Promise.all(promises);
  }

  /**
   * Normalize downloaded state archives to one common signed round.
   *
   * State downloads contain every round flushed before the archive is created.
   * Restore must use one round that exists and is fully signed in every node
   * archive; otherwise the nodes can start from different state/PCES boundaries.
   */
  public async normalizeDownloadedStateArchives(
    namespace: NamespaceName,
    nodeAliases: string[],
    baseDirectory: string = SOLO_LOGS_DIR,
    deploymentPhase?: DeploymentPhase,
    trimPreconsensusEventsToSelectedRound: boolean = false,
  ): Promise<string> {
    const archivePaths: string[] = nodeAliases.map((nodeAlias: string): string => {
      const archivePath: string = PathEx.join(baseDirectory, namespace.name, `network-${nodeAlias}-0-state.zip`);
      if (!fs.existsSync(archivePath)) {
        throw new SoloErrors.validation.illegalArgument(`State file not found: ${archivePath}`);
      }
      return archivePath;
    });

    const extractedDirectories: string[] = [];
    try {
      const roundSets: Set<string>[] = [];
      const freezeRoundSets: Set<string>[] = [];

      for (const archivePath of archivePaths) {
        const extractedDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-state-'));
        extractedDirectories.push(extractedDirectory);
        this.zippy.unzip(archivePath, extractedDirectory);

        const stateRoot: string = this.findSavedStateRoundRoot(extractedDirectory);
        const signedRounds: Set<string> = new Set<string>();
        const freezeRounds: Set<string> = new Set<string>();
        for (const roundDirectory of fs.readdirSync(stateRoot, {withFileTypes: true})) {
          if (!roundDirectory.isDirectory() || !/^\d+$/.test(roundDirectory.name)) {
            continue;
          }

          const metadataPath: string = PathEx.join(stateRoot, roundDirectory.name, STATE_METADATA_FILE_NAME);
          if (!fs.existsSync(metadataPath)) {
            continue;
          }

          const metadata: string = fs.readFileSync(metadataPath, 'utf8');
          const signingWeight: string | undefined = this.readStateMetadataValue(metadata, 'SIGNING_WEIGHT_SUM');
          const totalWeight: string | undefined = this.readStateMetadataValue(metadata, 'TOTAL_WEIGHT');
          if (!signingWeight || signingWeight !== totalWeight) {
            continue;
          }

          signedRounds.add(roundDirectory.name);
          if (this.readStateMetadataValue(metadata, 'FREEZE_STATE') === 'true') {
            freezeRounds.add(roundDirectory.name);
          }
        }

        roundSets.push(signedRounds);
        freezeRoundSets.push(freezeRounds);
      }

      const commonSignedRounds: Set<string> = this.intersectRoundSets(roundSets);
      const commonFreezeRounds: Set<string> = this.intersectRoundSets(freezeRoundSets);
      const preferFreezeRound: boolean = deploymentPhase === DeploymentPhase.FROZEN;
      const selectedRound: string | undefined = this.selectHighestRound(
        preferFreezeRound && commonFreezeRounds.size > 0 ? commonFreezeRounds : commonSignedRounds,
      );

      if (!selectedRound) {
        throw new SoloErrors.validation.illegalArgument(
          `No common fully signed state round found for nodes: ${nodeAliases.join(',')}`,
        );
      }

      for (const [index, extractedDirectory] of extractedDirectories.entries()) {
        const stateRoot: string = this.findSavedStateRoundRoot(extractedDirectory);
        for (const roundDirectory of fs.readdirSync(stateRoot, {withFileTypes: true})) {
          if (
            roundDirectory.isDirectory() &&
            /^\d+$/.test(roundDirectory.name) &&
            roundDirectory.name !== selectedRound
          ) {
            fs.rmSync(PathEx.join(stateRoot, roundDirectory.name), {recursive: true, force: true});
          }
        }

        // These transient directories are not part of the selected state/PCES boundary.
        fs.rmSync(PathEx.join(extractedDirectory, 'saved'), {recursive: true, force: true});
        fs.rmSync(PathEx.join(extractedDirectory, 'swirlds-tmp'), {recursive: true, force: true});

        if (trimPreconsensusEventsToSelectedRound) {
          // The top-level preconsensus-events stream is what the platform replays on the next
          // restart, and it is not naturally bounded to the selected round: it can contain later
          // events (e.g. a freeze transaction ordered moments after this snapshot was taken) that
          // the selected round's own state does not yet reflect. Trim those out so replay cannot
          // cross back into that later boundary, while keeping every event up to the selected
          // round so the restored node still has other-parent candidates to build new events on
          // (removing the whole stream instead would leave every node with no known events at
          // all, which the platform only permits at true genesis). Only opted into by callers
          // that want the restored network to resume live processing (e.g. `config ops backup`);
          // callers that intentionally restore a frozen snapshot rely on that same trailing
          // freeze event still being present so the restored node lands back in FREEZE_COMPLETE.
          PcesTrimmer.trimDirectoryToBirthRound(
            PathEx.join(extractedDirectory, 'preconsensus-events'),
            Number(selectedRound),
          );
        }
        await this.zippy.zip(extractedDirectory, archivePaths[index]);
      }

      this.logger.showUser(`Normalized state archives to common signed round ${selectedRound}`);
      return selectedRound;
    } finally {
      for (const extractedDirectory of extractedDirectories) {
        fs.rmSync(extractedDirectory, {recursive: true, force: true});
      }
    }
  }

  private findSavedStateRoundRoot(extractedDirectory: string): string {
    const serviceDirectory: string = PathEx.join(extractedDirectory, 'com.hedera.services.ServicesMain');
    const nodeDirectory: string | undefined = fs
      .readdirSync(serviceDirectory, {withFileTypes: true})
      .find((entry): boolean => entry.isDirectory())?.name;
    const realmShardDirectory: string | undefined = nodeDirectory
      ? fs
          .readdirSync(PathEx.join(serviceDirectory, nodeDirectory), {withFileTypes: true})
          .find((entry): boolean => entry.isDirectory())?.name
      : undefined;
    if (!nodeDirectory || !realmShardDirectory) {
      throw new SoloErrors.validation.illegalArgument(`Could not locate saved state rounds in ${extractedDirectory}`);
    }
    return PathEx.join(serviceDirectory, nodeDirectory, realmShardDirectory);
  }

  private readStateMetadataValue(metadata: string, key: string): string | undefined {
    return metadata
      .split('\n')
      .find((line: string): boolean => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim();
  }

  private intersectRoundSets(roundSets: Set<string>[]): Set<string> {
    const [firstSet, ...remainingSets] = roundSets;
    return new Set<string>(
      [...(firstSet ?? [])].filter((round: string): boolean =>
        remainingSets.every((set: Set<string>): boolean => set.has(round)),
      ),
    );
  }

  private selectHighestRound(rounds: Set<string>): string | undefined {
    let highestRound: string | undefined;
    for (const currentRound of rounds) {
      if (highestRound === undefined || Number(currentRound) > Number(highestRound)) {
        highestRound = currentRound;
      }
    }

    return highestRound;
  }

  /**
   * Wait for a fully signed freeze state before a freeze workflow stops the node.
   * A FROZEN platform status alone is not enough: stopping immediately can leave
   * the archive with only a non-freeze state and misaligned PCES replay data.
   */
  public async waitForFrozenStateToBeStable(podReference: PodReference, context?: string): Promise<void> {
    const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);
    const container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
    await this.waitForStableSavedState(container, podReference.name.name, true);
  }

  private async getState(
    pod: Pod,
    namespace: NamespaceName,
    baseDirectory: string,
    context?: string,
    deploymentPhase?: DeploymentPhase,
  ): Promise<void> {
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): begin...`);
    const targetDirectory: string = PathEx.join(baseDirectory, namespace.name);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      // Use zip for compression, similar to tar -czf with -C flag
      const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);

      const k8: K8 = this.k8Factory.getK8(context);
      const zipFileName: string = `${HEDERA_HAPI_PATH}/${podReference.name}-state.zip`;
      // A frozen node should yield a freeze round; a merely stopped node may only
      // have a non-freeze signed round available.
      const requireFreezeRound: boolean = deploymentPhase === DeploymentPhase.FROZEN;

      await this.waitForStableSavedState(
        k8.containers().readByRef(containerReference),
        podReference.name.name,
        requireFreezeRound,
      );

      // Zip doesn't have a -C flag like tar, so we use sh -c with subshell to change directory
      // Use the -X to archive for cross-platform compatibility
      await k8
        .containers()
        .readByRef(containerReference)
        .execContainer([
          'sh',
          '-c',
          `(cd ${HEDERA_HAPI_PATH}/data/saved && zip -rX ${zipFileName} . && sync && test -f ${zipFileName})`,
        ]);
      await sleep(Duration.ofSeconds(1));
      await k8.containers().readByRef(containerReference).copyFrom(`${zipFileName}`, targetDirectory);
    } catch (error: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podReference.name}`, error);
      this.logger.showUser(`Failed to download state from pod ${podReference.name}` + error);
    }
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): ...end`);
  }

  private async waitForStableSavedState(
    container: Container,
    podName: string,
    requireFreezeRound: boolean,
  ): Promise<void> {
    const maxAttempts: number = constants.STATE_DOWNLOAD_STABLE_MAX_ATTEMPTS;
    const stablePollsRequired: number = constants.STATE_DOWNLOAD_STABLE_POLLS_REQUIRED;
    const pollDelay: Duration = Duration.ofMillis(constants.STATE_DOWNLOAD_STABLE_DELAY);
    let lastFingerprint: string | undefined;
    let stablePolls: number = 0;
    const scriptName: string = 'wait-for-stable-saved-state.sh';
    const sourcePath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName);
    const destinationPath: string = `${HEDERA_HAPI_PATH}/${scriptName}`;

    // Reuse a checked-in resource script so the in-pod state-selection logic is
    // versioned alongside Solo and remains readable/testable outside TS strings.
    await container.copyTo(sourcePath, `${HEDERA_HAPI_PATH}`);
    await sleep(Duration.ofSeconds(1));
    await container.execContainer([
      'bash',
      '-c',
      `sync ${HEDERA_HAPI_PATH} && chown hedera:hedera ${destinationPath} && chmod 0755 ${destinationPath}`,
    ]);

    let attempt: number = 0;
    while (attempt < maxAttempts) {
      try {
        const rawOutput: string = await container.execContainer([
          'bash',
          '-lc',
          // The script prints "<tree-fingerprint> <selected-round> <kind>"
          // once it finds the best fully signed saved-state boundary currently
          // persisted on disk, preferring a freeze round when requested.
          `${destinationPath} ${String(requireFreezeRound)} ${HEDERA_HAPI_PATH}/data/saved`,
        ]);
        const output: string = rawOutput.trim();

        const [fingerprint, round, kind] = output.split(/\s+/);
        if (fingerprint && round && kind) {
          stablePolls = fingerprint === lastFingerprint ? stablePolls + 1 : 1;
          lastFingerprint = fingerprint;

          this.logger.debug(
            `[state-download] ${podName}: round ${round} (${kind}) stable poll ${stablePolls}/${stablePollsRequired}`,
          );

          if (kind === 'frozen-fallback') {
            // A frozen deployment can expose the FROZEN platform status without ever
            // producing a fully signed freeze round on disk — some consensus-node
            // versions report SIGNING_WEIGHT_SUM: 0 for freeze states, so this is the
            // expected outcome on those versions rather than a transient condition.
            // Export the newest fully signed non-freeze round instead of waiting
            // indefinitely for a freeze round that may never appear.
            this.logger.warn(
              `[state-download] ${podName}: deployment is FROZEN but no fully signed freeze round exists on disk ` +
                '(expected when the platform does not sign freeze states); using the newest fully signed non-freeze round',
            );
          }

          if (stablePolls >= stablePollsRequired) {
            // One final sync narrows the gap between the successful probe and the
            // subsequent zip/copy operation.
            await container.execContainer('sync');
            return;
          }
        }
      } catch (error) {
        const message: string = error instanceof Error ? error.message : String(error);
        if (message.includes(NO_HASH_TOOL_STDERR)) {
          // Permanent for this image, not a transient "not stable yet" condition: retrying
          // for the remaining attempts cannot succeed, so fail fast with a clear cause.
          throw new SoloErrors.system.savedStateHashToolMissing(podName);
        }

        // The script exits non-zero until a qualifying signed round exists or the
        // saved-state tree stops changing across polls.
        this.logger.debug(`[state-download] ${podName}: saved state not stable yet`, error);
      }

      attempt++;
      await sleep(pollDelay);
    }

    throw new SoloErrors.component.nodeNotReady(
      podName,
      requireFreezeRound
        ? 'showing a stable, fully signed freeze state on disk (the deployment is frozen, but no signed round has become stable yet)'
        : 'showing a stable, fully signed saved state on disk (stop or freeze the node and retry state download)',
      attempt,
      maxAttempts,
    );
  }

  public async getNetworkNodePodStatus(podReference: PodReference, context?: string): Promise<string> {
    return this.k8Factory
      .getK8(context)
      .containers()
      .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
      .execContainer([
        'bash',
        '-c',
        String.raw`curl -s http://localhost:9999/metrics | grep platform_PlatformStatus | grep -v \#`,
      ]);
  }

  public async getNetworkNodePlatformStatusName(podReference: PodReference, context?: string): Promise<string> {
    try {
      const response: string = await this.getNetworkNodePodStatus(podReference, context);
      const statusLine: string | undefined = response
        ?.split('\n')
        .find((line: string): boolean => line.startsWith('platform_PlatformStatus'));
      const statusNumber: number = Number.parseInt(statusLine?.split(' ').pop() ?? '', 10);
      return NodeStatusEnums[statusNumber as keyof typeof NodeStatusEnums] ?? 'UNKNOWN';
    } catch {
      // best-effort diagnostic only: if the pod exec or metrics scrape fails, report UNKNOWN rather than mask the original ping failure
      return 'UNKNOWN';
    }
  }
}
