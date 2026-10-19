// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type Context} from '../types/index.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type PodVolumeMount} from '../integration/kube/resources/pod/pod-volume-mount.js';
import {type PvcDetail} from '../integration/kube/resources/pvc/pvc-detail.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {KubernetesQuantity} from '../business/utils/kubernetes-quantity.js';
import {type PvcMountFinding} from './pvc-mount-finding.js';
import {PvcMountFindingKind} from './pvc-mount-finding-kind.js';

/**
 * Verifies that a pod's PersistentVolumeClaim mounts are backed by the storage the claims asked
 * for.
 *
 * This cannot be answered from the Kubernetes API. A provisioner that hands out directories on an
 * existing filesystem (hostPath, local-path, and most bare-metal setups) ignores
 * `spec.resources.requests.storage`: the claim binds, reports the requested size back, the pod
 * mounts it and runs. If the directory tree the provisioner writes into is not the mount point it
 * was meant to be — an unmounted RAID array leaving the path on the system disk, for instance —
 * nothing anywhere reports a problem until the disk fills up. The only place the truth is visible
 * is inside the pod, in the size and device identity of the mounted filesystem.
 */
@injectable()
export class PvcMountVerifier {
  /**
   * Fraction of the requested size a mount must provide before it is reported as
   * under-provisioned. Filesystem metadata overhead means a correctly provisioned volume reports
   * slightly less than requested, so an exact comparison would produce constant false positives;
   * the failure this detects is off by an order of magnitude, not a few percent.
   */
  private static readonly CAPACITY_TOLERANCE: number = 0.9;

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  /**
   * Verify every claim-backed mount of the pods matching `labels`.
   *
   * Best-effort by design: a pod that cannot be probed (exec unavailable, no shell, a probe command
   * that fails) is logged and skipped rather than reported as a finding, because an unverifiable
   * mount is not the same as a bad one.
   *
   * @param namespace - namespace holding the pods and claims
   * @param context - kube context to query
   * @param labels - label selector identifying the pods to verify
   * @returns every problem found, empty when all mounts check out
   */
  public async verify(namespace: NamespaceName, context: Context, labels: string[]): Promise<PvcMountFinding[]> {
    const pods: Pod[] = await this.k8Factory.getK8(context).pods().list(namespace, labels);

    if (pods.length === 0) {
      this.logger.debug(`PVC mount verification found no pods for labels [${labels.join(', ')}]`);
      return [];
    }

    const requestedBytesByClaimName: Map<string, number> = await this.readRequestedBytesByClaimName(namespace, context);

    const findings: PvcMountFinding[] = [];
    for (const pod of pods) {
      findings.push(...(await this.verifyPod(namespace, context, pod, requestedBytesByClaimName)));
    }

    return findings;
  }

  /** Requested size in bytes of every claim in the namespace, keyed by claim name. */
  private async readRequestedBytesByClaimName(
    namespace: NamespaceName,
    context: Context,
  ): Promise<Map<string, number>> {
    const requestedBytesByClaimName: Map<string, number> = new Map<string, number>();
    const claims: PvcDetail[] = await this.k8Factory.getK8(context).pvcs().readAll(namespace);
    for (const claim of claims) {
      if (claim.requestedStorageBytes !== undefined) {
        requestedBytesByClaimName.set(claim.pvcReference.name.toString(), claim.requestedStorageBytes);
      }
    }
    return requestedBytesByClaimName;
  }

  private async verifyPod(
    namespace: NamespaceName,
    context: Context,
    pod: Pod,
    requestedBytesByClaimName: Map<string, number>,
  ): Promise<PvcMountFinding[]> {
    const podName: string = pod.podReference?.name?.toString() ?? '<unknown>';
    const mounts: PodVolumeMount[] = pod.persistentVolumeClaimMounts ?? [];

    if (mounts.length === 0) {
      return [
        {
          kind: PvcMountFindingKind.NoPersistentStorage,
          podName,
          claimName: undefined,
          mountPath: undefined,
          description:
            `pod "${podName}" has no PersistentVolumeClaim-backed mounts, so all of its data is ` +
            'ephemeral and is lost when the pod is replaced',
        },
      ];
    }

    // Probe once per container, since a mount is only visible from the container that mounts it.
    const findings: PvcMountFinding[] = [];
    const mountsByContainerName: Map<string, PodVolumeMount[]> = new Map<string, PodVolumeMount[]>();
    for (const mount of mounts) {
      const containerMounts: PodVolumeMount[] = mountsByContainerName.get(mount.containerName) ?? [];
      containerMounts.push(mount);
      mountsByContainerName.set(mount.containerName, containerMounts);
    }

    for (const [containerName, containerMounts] of mountsByContainerName) {
      const totalBytesByMountPath: Map<string, number> | undefined = await this.probeContainer(
        namespace,
        context,
        pod,
        containerName,
        containerMounts,
      );
      if (!totalBytesByMountPath) {
        continue;
      }

      for (const mount of containerMounts) {
        const totalBytes: number | undefined = totalBytesByMountPath.get(mount.mountPath);
        const requestedBytes: number | undefined = requestedBytesByClaimName.get(mount.claimName);
        if (totalBytes === undefined || requestedBytes === undefined) {
          continue;
        }

        if (totalBytes < requestedBytes * PvcMountVerifier.CAPACITY_TOLERANCE) {
          findings.push({
            kind: PvcMountFindingKind.UnderProvisioned,
            podName,
            claimName: mount.claimName,
            mountPath: mount.mountPath,
            description:
              `claim "${mount.claimName}" requested ${KubernetesQuantity.format(requestedBytes)} but ` +
              `${mount.mountPath} is backed by only ${KubernetesQuantity.format(totalBytes)}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Read the total size in bytes of the filesystem backing each mount path. Returns undefined when
   * the container cannot be probed.
   */
  private async probeContainer(
    namespace: NamespaceName,
    context: Context,
    pod: Pod,
    containerName: string,
    mounts: PodVolumeMount[],
  ): Promise<Map<string, number> | undefined> {
    const mountPaths: string[] = [...new Set(mounts.map((mount: PodVolumeMount): string => mount.mountPath))];
    // `df -B1 -P` guarantees one line per filesystem, sized in bytes, with the total in field 2.
    const script: string = mountPaths
      .map(
        (mountPath: string): string =>
          String.raw`printf '%s\t%s\n' '${mountPath}' ` +
          `"$(df -B1 -P '${mountPath}' 2>/dev/null | tail -n 1 | tr -s ' ' | cut -d' ' -f2)"`,
      )
      .join('; ');

    const containerReference: ContainerReference = ContainerReference.of(
      pod.podReference,
      ContainerName.of(containerName),
    );

    let output: string;
    try {
      const podContainer: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
      output = await podContainer.execContainer(['/bin/sh', '-c', script]);
    } catch (error: Error | unknown) {
      // An unverifiable mount is not a failed one: containers without a shell, or exec being
      // unavailable, must not be reported as a storage problem.
      this.logger.debug(
        `PVC mount verification could not probe ${namespace.name}/${pod.podReference?.name?.toString()} container ${containerName}`,
        error,
      );
      return undefined;
    }

    return PvcMountVerifier.parseProbeOutput(output);
  }

  private static parseProbeOutput(output: string): Map<string, number> {
    const totalBytesByMountPath: Map<string, number> = new Map<string, number>();

    for (const line of (output ?? '').split('\n')) {
      const [mountPath, totalBytesText] = line.trim().split('\t');
      const totalBytes: number = Number.parseInt(totalBytesText, 10);
      if (mountPath && !Number.isNaN(totalBytes) && totalBytes > 0) {
        totalBytesByMountPath.set(mountPath, totalBytes);
      }
    }

    return totalBytesByMountPath;
  }
}
