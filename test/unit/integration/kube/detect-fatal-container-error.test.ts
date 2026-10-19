// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {KubePodCreationFailedError} from '../../../../src/integration/kube/errors/kube-pod-creation-failed-error.js';
import {KubePodReadinessFailedError} from '../../../../src/integration/kube/errors/kube-pod-readiness-failed-error.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type ContainerStatus} from '../../../../src/integration/kube/resources/pod/container-status.js';
import {K8ClientPods} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';
import {resetForTest} from '../../../test-container.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

interface RawContainerStatusFixture {
  readonly name: string;
  readonly state: {
    readonly waiting?: {
      readonly reason: string;
      readonly message?: string;
    };
  };
}

interface RawPodFixture {
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly creationTimestamp: Date;
  };
  readonly spec: {
    readonly containers: {readonly name: string}[];
  };
  readonly status: {
    phase?: string;
    readonly containerStatuses: RawContainerStatusFixture[];
  };
}

function buildPod(containerStatuses: ContainerStatus[], podName: string = 'test-pod'): Pod {
  return {
    podReference: PodReference.of(NamespaceName.of('default'), PodName.of(podName)),
    allContainerStatuses: containerStatuses,
    killPod: async (): Promise<void> => {},
    portForward: async (): Promise<number> => 0,
    stopPortForward: async (): Promise<void> => {},
  };
}

function buildPodWithoutReference(containerStatuses: ContainerStatus[]): Pod {
  return {
    // eslint-disable-next-line unicorn/no-null
    podReference: null,
    allContainerStatuses: containerStatuses,
    killPod: async (): Promise<void> => {},
    portForward: async (): Promise<number> => 0,
    stopPortForward: async (): Promise<void> => {},
  };
}

function buildWaiting(containerName: string, reason: string, message?: string): ContainerStatus {
  return {name: containerName, waitingReason: reason, waitingMessage: message};
}

function buildTerminated(containerName: string, reason: string, exitCode: number): ContainerStatus {
  return {name: containerName, terminatedReason: reason, terminatedExitCode: exitCode};
}

function buildRawPodWithContainerStatus(containerStatus: RawContainerStatusFixture): RawPodFixture {
  return {
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      creationTimestamp: new Date(),
    },
    spec: {
      containers: [{name: 'test-container'}],
    },
    status: {
      containerStatuses: [containerStatus],
    },
  };
}

function buildWaitingRawContainerStatus(reason: string, message?: string): RawContainerStatusFixture {
  return {
    name: 'test-container',
    state: {
      waiting: {
        reason,
        message,
      },
    },
  };
}

describe('detectFatalContainerError', (): void => {
  let podsClient: K8ClientPods;

  before((): void => {
    resetForTest();
    // detectFatalContainerError does not use the K8s client or config; pass undefined for test setup.
    podsClient = new K8ClientPods(undefined as never, undefined as never, '');
  });

  it('should return undefined for a pod with no container statuses', (): void => {
    const pod: Pod = buildPod([]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should return undefined for a pod with a healthy running container', (): void => {
    const pod: Pod = buildPod([{name: 'healthy-container'}]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('passes previous flag when reading logs for named containers', async (): Promise<void> => {
    const podReference: PodReference = PodReference.of(NamespaceName.of('default'), PodName.of('test-pod'));
    const readNamespacedPodStub: SinonStub = sinon.stub().resolves({
      spec: {
        containers: [{name: 'main-container'}, {name: 'sidecar-container'}],
      },
    });
    const readNamespacedPodLogStub: SinonStub = sinon.stub().callsFake(({container}: {container: string}): string => {
      return `${container} previous log`;
    });
    const pods: K8ClientPods = new K8ClientPods(
      {
        readNamespacedPod: readNamespacedPodStub,
        readNamespacedPodLog: readNamespacedPodLogStub,
      } as never,
      {} as never,
      '',
    );

    const logs: string = await pods.readLogs(podReference, true, true);

    expect(logs).to.include('main-container previous log');
    expect(logs).to.include('sidecar-container previous log');
    expect(readNamespacedPodLogStub).to.have.been.calledWithMatch({
      name: 'test-pod',
      namespace: 'default',
      container: 'main-container',
      timestamps: true,
      previous: true,
    });
    expect(readNamespacedPodLogStub).to.have.been.calledWithMatch({
      name: 'test-pod',
      namespace: 'default',
      container: 'sidecar-container',
      timestamps: true,
      previous: true,
    });
  });

  for (const reason of ['InvalidImageName', 'RegistryUnavailable', 'CrashLoopBackOff']) {
    it(`should detect fatal waiting reason: ${reason}`, (): void => {
      const pod: Pod = buildPod([buildWaiting('test-container', reason)]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.include(reason);
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });
  }

  for (const reason of ['ImagePullBackOff', 'ErrImagePull', 'ImageInspectError']) {
    it(`should detect fatal waiting reason when message is non-recoverable: ${reason}`, (): void => {
      const message: string = 'failed to pull image "ghcr.io/example/app:1.2.3": not found';
      const pod: Pod = buildPod([buildWaiting('test-container', reason, message)]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.include(reason);
      expect(result).to.include(message);
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });
  }

  it('should include message detail when present for ImagePullBackOff', (): void => {
    const message: string = 'failed to pull image "gcr.io/example/app:0.1.0-SNAPSHOT": not found';
    const pod: Pod = buildPod([buildWaiting('test-container', 'ImagePullBackOff', message)]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include(message);
  });

  it('should return undefined for a non-fatal waiting reason (e.g. ContainerCreating)', (): void => {
    const pod: Pod = buildPod([buildWaiting('test-container', 'ContainerCreating')]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect OOMKilled terminated reason', (): void => {
    const pod: Pod = buildPod([buildTerminated('test-container', 'OOMKilled', 137)]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('OOMKilled');
    expect(result).to.include('137');
  });

  it('should return undefined for a non-fatal terminated reason (e.g. Completed)', (): void => {
    const pod: Pod = buildPod([buildTerminated('test-container', 'Completed', 0)]);
    expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
  });

  it('should detect fatal error across multiple container statuses (init container first)', (): void => {
    const pod: Pod = buildPod([
      buildWaiting('init-container', 'ImagePullBackOff', 'manifest unknown'),
      {name: 'main-container'},
    ]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('ImagePullBackOff');
    expect(result).to.include('"init-container"');
  });

  it('should use <unknown> for pod name when podReference is null', (): void => {
    const pod: Pod = buildPodWithoutReference([buildWaiting('<unknown>', 'ImagePullBackOff', 'not found')]);
    const result: string | undefined = podsClient.detectFatalContainerError(pod);
    expect(result).to.include('<unknown>');
  });

  describe('containerd socket error (Docker Desktop macOS race)', (): void => {
    const containerdSocketMessage: string =
      'Failed to inspect image "ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.76.2": ' +
      'rpc error: code = Unavailable desc = connection error: desc = "transport: Error while dialing: ' +
      'dial unix /run/containerd/containerd.sock: connect: connection refused"';

    it('isContainerdSocketError returns true for containerd socket message', (): void => {
      expect(K8ClientPods.isContainerdSocketError(containerdSocketMessage)).to.be.true;
    });

    it('isContainerdSocketError returns false for undefined', (): void => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(K8ClientPods.isContainerdSocketError(undefined)).to.be.false;
    });

    it('isContainerdSocketError returns false for an unrelated image pull error', (): void => {
      expect(K8ClientPods.isContainerdSocketError('not found')).to.be.false;
    });

    it('detectFatalContainerError returns an actionable message for ImageInspectError with containerd socket', (): void => {
      const pod: Pod = buildPod([buildWaiting('test-container', 'ImageInspectError', containerdSocketMessage)]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.not.be.undefined;
      expect(result).to.include('containerd socket error');
      expect(result).to.include('Docker Desktop');
      expect(result).to.include('"test-pod"');
      expect(result).to.include('"test-container"');
    });

    it('detectFatalContainerError returns undefined for ImageInspectError with a non-containerd transient message', (): void => {
      const pod: Pod = buildPod([buildWaiting('test-container', 'ImageInspectError', 'Some transient network hiccup')]);
      expect(podsClient.detectFatalContainerError(pod)).to.be.undefined;
    });

    it('detectFatalContainerError still treats ImageInspectError + "not found" as non-recoverable', (): void => {
      const pod: Pod = buildPod([buildWaiting('test-container', 'ImageInspectError', 'image not found in registry')]);
      const result: string | undefined = podsClient.detectFatalContainerError(pod);
      expect(result).to.not.be.undefined;
      expect(result).to.include('non-recoverable');
    });

    it('waitForRunningPhase waits for the containerd socket threshold before rejecting', async (): Promise<void> => {
      const pod: RawPodFixture = buildRawPodWithContainerStatus(
        buildWaitingRawContainerStatus('ImageInspectError', containerdSocketMessage),
      );
      pod.status.phase = 'Pending';

      const listNamespacedPodStub: SinonStub = sinon.stub().resolves({items: [pod]});
      const pods: K8ClientPods = new K8ClientPods({listNamespacedPod: listNamespacedPodStub} as never, {} as never, '');

      try {
        await pods.waitForRunningPhase(NamespaceName.of('test-namespace'), ['app=test'], 5, 0);
        expect.fail('Expected waitForRunningPhase to reject');
      } catch (error: Error | unknown) {
        expect(error).to.be.instanceOf(KubePodCreationFailedError);
        expect((error as KubePodCreationFailedError).result).to.include('containerd socket error');
      }
      expect(listNamespacedPodStub).to.have.callCount(5);
    });

    it('waitForReadyStatus wraps readiness context while preserving pod creation failures', async (): Promise<void> => {
      const pod: RawPodFixture = buildRawPodWithContainerStatus(
        buildWaitingRawContainerStatus('ImageInspectError', containerdSocketMessage),
      );
      pod.status.phase = 'Pending';

      const listNamespacedPodStub: SinonStub = sinon.stub().resolves({items: [pod]});
      const pods: K8ClientPods = new K8ClientPods({listNamespacedPod: listNamespacedPodStub} as never, {} as never, '');

      try {
        await pods.waitForReadyStatus(NamespaceName.of('test-namespace'), ['app=test'], 5, 0);
        expect.fail('Expected waitForReadyStatus to reject');
      } catch (error: Error | unknown) {
        expect(error).to.be.instanceOf(KubePodReadinessFailedError);
        expect((error as KubePodReadinessFailedError).message).to.include('test-namespace');
        expect((error as KubePodReadinessFailedError).message).to.include('app=test');
        expect((error as KubePodReadinessFailedError).cause).to.be.instanceOf(KubePodCreationFailedError);
        expect(((error as KubePodReadinessFailedError).cause as KubePodCreationFailedError).result).to.include(
          'containerd socket error',
        );
      }
      expect(listNamespacedPodStub).to.have.callCount(5);
    });
  });
});
