// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientPods} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';
import {KubePodNotFoundError} from '../../../../src/integration/kube/errors/kube-pod-not-found-error.js';
import {KubePodNotReadyError} from '../../../../src/integration/kube/errors/kube-pod-not-ready-error.js';
import {KubePodReadinessFailedError} from '../../../../src/integration/kube/errors/kube-pod-readiness-failed-error.js';
import {KubeErrorTranslator} from '../../../../src/core/errors/kube-error-translator.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloError} from '../../../../src/core/errors/solo-error.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

interface RawPodFixture {
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly creationTimestamp: Date;
  };
  readonly spec: {
    readonly containers: {readonly name: string}[];
    readonly volumes?: {readonly name: string; readonly persistentVolumeClaim?: {readonly claimName: string}}[];
  };
  readonly status: {
    phase?: string;
    readonly containerStatuses: object[];
  };
}

/** A pod that exists and is Running but whose container never becomes ready (e.g. a failing startup probe). */
function buildUnreadyRunningPod(): RawPodFixture {
  return {
    metadata: {
      name: 'relay-1-bc544d79d-vkmgq',
      namespace: 'solo',
      creationTimestamp: new Date(),
    },
    spec: {
      containers: [{name: 'relay'}],
    },
    status: {
      phase: 'Running',
      containerStatuses: [{name: 'relay', ready: false, restartCount: 2}],
    },
  };
}

/** A pod stuck in Pending whose only volume is a PersistentVolumeClaim that never binds. */
function buildPendingPodWithPvcVolume(): RawPodFixture {
  return {
    metadata: {
      name: 'network-node1-0',
      namespace: 'solo',
      creationTimestamp: new Date(),
    },
    spec: {
      containers: [{name: 'root-container'}],
      volumes: [{name: 'data', persistentVolumeClaim: {claimName: 'hgcapp-data-saved-network-node1-0'}}],
    },
    status: {
      phase: 'Pending',
      containerStatuses: [],
    },
  };
}

describe('K8ClientPods wait timeout errors', (): void => {
  let listNamespacedPodStub: SinonStub;
  let listNamespacedPersistentVolumeClaimStub: SinonStub;
  let listNamespacedEventStub: SinonStub;
  let pods: K8ClientPods;

  beforeEach((): void => {
    resetForTest();
    listNamespacedPodStub = sinon.stub();
    listNamespacedPersistentVolumeClaimStub = sinon.stub().resolves({items: []});
    listNamespacedEventStub = sinon.stub().resolves({items: []});
    pods = new K8ClientPods(
      {
        listNamespacedPod: listNamespacedPodStub,
        listNamespacedPersistentVolumeClaim: listNamespacedPersistentVolumeClaimStub,
        listNamespacedEvent: listNamespacedEventStub,
      } as never,
      {} as never,
      '',
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('waitForReadyStatus reports the observed pod when it exists but never becomes ready', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildUnreadyRunningPod()]});

    try {
      await pods.waitForReadyStatus(NamespaceName.of('solo'), ['app.kubernetes.io/name=relay'], 3, 0);
      expect.fail('Expected waitForReadyStatus to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodReadinessFailedError);
      const cause: KubePodNotReadyError = (error as KubePodReadinessFailedError).cause as KubePodNotReadyError;
      expect(cause).to.be.instanceOf(KubePodNotReadyError);
      expect(cause.message).to.not.include('No pod found');
      expect(cause.message).to.include('relay-1-bc544d79d-vkmgq');
      expect(cause.message).to.include('phase: Running');
      expect(cause.message).to.include('relay (ready: false, restarts: 2)');
    }
    expect(listNamespacedPodStub).to.have.callCount(3);
  });

  it('waitForRunningPhase still reports KubePodNotFoundError when no pod ever matches the labels', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: []});

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app=missing'], 3, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotFoundError);
      expect((error as KubePodNotFoundError).message).to.include('No pod found for: labels:app=missing');
    }
  });

  it('waitForRunningPhase reports the last observed pod even if it later disappears', async (): Promise<void> => {
    listNamespacedPodStub.onFirstCall().resolves({items: [buildUnreadyRunningPod()]});
    listNamespacedPodStub.resolves({items: []});

    try {
      await pods.waitForRunningPhase(
        NamespaceName.of('solo'),
        ['app.kubernetes.io/name=relay'],
        3,
        0,
        (): boolean => false,
      );
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotReadyError);
      expect((error as KubePodNotReadyError).podName).to.equal('relay-1-bc544d79d-vkmgq');
    }
  });

  it('waitForRunningPhase includes a PVC/event diagnostic when the pod is stuck on an unbound volume', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildPendingPodWithPvcVolume()]});
    listNamespacedPersistentVolumeClaimStub.resolves({
      items: [{metadata: {name: 'hgcapp-data-saved-network-node1-0'}, status: {phase: 'Pending'}}],
    });
    listNamespacedEventStub.resolves({
      items: [
        {
          reason: 'FailedMount',
          involvedObject: {name: 'hgcapp-data-saved-network-node1-0'},
          message: 'MountVolume.SetUp failed for volume "pvc-1234" : mount failed: exit status 32',
        },
      ],
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotReadyError);
      const notReadyError: KubePodNotReadyError = error as KubePodNotReadyError;
      expect(notReadyError.volumeMountDiagnostic).to.include('hgcapp-data-saved-network-node1-0" is Pending');
      expect(notReadyError.volumeMountDiagnostic).to.include('event FailedMount: MountVolume.SetUp failed');
      expect(notReadyError.message).to.include('volume mount diagnostic');
    }
  });

  it('waitForRunningPhase omits the diagnostic when the pod has no PVC-backed volumes', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildUnreadyRunningPod()]});

    try {
      await pods.waitForRunningPhase(
        NamespaceName.of('solo'),
        ['app.kubernetes.io/name=relay'],
        2,
        0,
        (): boolean => false,
      );
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotReadyError);
      expect((error as KubePodNotReadyError).volumeMountDiagnostic).to.be.undefined;
      expect(listNamespacedPersistentVolumeClaimStub).to.not.have.been.called;
      expect(listNamespacedEventStub).to.not.have.been.called;
    }
  });

  it('KubeErrorTranslator maps KubePodNotReadyError to PodNotReadySoloError with the pod details', (): void => {
    const kubeError: KubePodNotReadyError = new KubePodNotReadyError('labels:app=relay', 'relay-1-x', 'Running', [
      {name: 'relay', ready: false, restartCount: 2, waitingReason: 'CrashLoopBackOff'},
    ]);

    const translated: SoloError | undefined = KubeErrorTranslator.tryTranslate(kubeError);

    expect(translated).to.be.instanceOf(SoloErrors.system.podNotReady);
    expect(translated.message).to.include('relay-1-x');
    expect(translated.message).to.include('phase: Running');
    expect(translated.message).to.include('waiting: CrashLoopBackOff');
  });

  it('KubeErrorTranslator forwards the volume mount diagnostic to PodNotReadySoloError', (): void => {
    const kubeError: KubePodNotReadyError = new KubePodNotReadyError(
      'labels:app=network-node',
      'network-node1-0',
      'Pending',
      [],
      'PVC "hgcapp-data-saved-network-node1-0" is Pending; event FailedMount: mount failed: exit status 32',
    );

    const translated: SoloError | undefined = KubeErrorTranslator.tryTranslate(kubeError);

    expect(translated.message).to.include('volume mount diagnostic');
    expect(translated.message).to.include('hgcapp-data-saved-network-node1-0" is Pending');
  });
});
