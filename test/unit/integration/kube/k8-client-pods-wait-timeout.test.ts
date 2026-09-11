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
  it('waitForRunningPhase reports a volume-caused FailedScheduling event on the pod', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildPendingPodWithPvcVolume()]});
    listNamespacedPersistentVolumeClaimStub.resolves({
      items: [{metadata: {name: 'hgcapp-data-saved-network-node1-0'}, status: {phase: 'Bound'}}],
    });
    listNamespacedEventStub.resolves({
      items: [
        {
          reason: 'FailedScheduling',
          involvedObject: {name: 'network-node1-0'},
          message: '0/3 nodes are available: 1 node(s) had volume node affinity conflict.',
          lastTimestamp: new Date('2026-08-20T10:00:00Z'),
        },
      ],
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect((error as KubePodNotReadyError).volumeMountDiagnostic).to.include('volume node affinity conflict');
    }
  });

  it('waitForRunningPhase ignores a FailedScheduling event that is not about a volume', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildPendingPodWithPvcVolume()]});
    listNamespacedPersistentVolumeClaimStub.resolves({
      items: [{metadata: {name: 'hgcapp-data-saved-network-node1-0'}, status: {phase: 'Bound'}}],
    });
    listNamespacedEventStub.resolves({
      items: [
        {
          reason: 'FailedScheduling',
          involvedObject: {name: 'network-node1-0'},
          message: '0/3 nodes are available: 3 Insufficient cpu.',
          lastTimestamp: new Date('2026-08-20T10:00:00Z'),
        },
      ],
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect((error as KubePodNotReadyError).volumeMountDiagnostic).to.be.undefined;
    }
  });

  it('waitForRunningPhase reports the newest volume event regardless of list order', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: [buildPendingPodWithPvcVolume()]});
    listNamespacedEventStub.resolves({
      items: [
        {
          reason: 'FailedMount',
          involvedObject: {name: 'network-node1-0'},
          message: 'stale failure from an earlier deploy',
          lastTimestamp: new Date('2026-08-20T09:00:00Z'),
        },
        {
          reason: 'FailedMount',
          involvedObject: {name: 'network-node1-0'},
          message: 'current failure',
          lastTimestamp: new Date('2026-08-20T11:00:00Z'),
        },
        {
          reason: 'FailedMount',
          involvedObject: {name: 'network-node1-0'},
          message: 'another stale failure',
          lastTimestamp: new Date('2026-08-20T10:00:00Z'),
        },
      ],
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      const diagnostic: string = (error as KubePodNotReadyError).volumeMountDiagnostic;
      expect(diagnostic).to.include('current failure');
      expect(diagnostic).to.not.include('stale failure');
    }
  });

  it('waitForRunningPhase explains a never-created pod with a namespace-wide volume sweep', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: []});
    listNamespacedPersistentVolumeClaimStub.resolves({
      items: [
        {metadata: {name: 'hgcapp-data-saved-network-node1-0'}, status: {phase: 'Pending'}},
        {metadata: {name: 'hgcapp-event-streams-network-node1-0'}, status: {phase: 'Pending'}},
      ],
    });
    listNamespacedEventStub.resolves({
      items: [
        {
          reason: 'ProvisioningFailed',
          involvedObject: {name: 'hgcapp-data-saved-network-node1-0'},
          message: 'failed to provision volume with StorageClass "local-path": no space left on device',
          lastTimestamp: new Date('2026-08-20T10:00:00Z'),
        },
      ],
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubePodNotFoundError);
      const notFoundError: KubePodNotFoundError = error as KubePodNotFoundError;
      expect(notFoundError.volumeMountDiagnostic).to.include('hgcapp-data-saved-network-node1-0" is Pending');
      expect(notFoundError.volumeMountDiagnostic).to.include('ProvisioningFailed');
      expect(notFoundError.message).to.include('volume mount diagnostic');
    }
  });

  it('waitForRunningPhase caps the number of individually named unbound claims', async (): Promise<void> => {
    listNamespacedPodStub.resolves({items: []});
    listNamespacedPersistentVolumeClaimStub.resolves({
      items: Array.from({length: 9}, (_: unknown, index: number): object => ({
        metadata: {name: `claim-${index}`},
        status: {phase: 'Pending'},
      })),
    });

    try {
      await pods.waitForRunningPhase(NamespaceName.of('solo'), ['app.kubernetes.io/name=network-node'], 2, 0);
      expect.fail('Expected waitForRunningPhase to reject');
    } catch (error: Error | unknown) {
      expect((error as KubePodNotFoundError).volumeMountDiagnostic).to.include('(+4 more unbound claim(s))');
    }
  });

  it('KubePodReadinessFailedError carries the volume mount diagnostic of its cause', (): void => {
    const cause: KubePodNotReadyError = new KubePodNotReadyError(
      'labels:app=network-node',
      'network-node1-0',
      'Pending',
      [],
      'PVC "hgcapp-data-saved-network-node1-0" is Pending',
    );

    const readinessError: KubePodReadinessFailedError = new KubePodReadinessFailedError(
      'solo',
      ['solo.hedera.com/type=network-node'],
      cause,
    );

    expect(readinessError.volumeMountDiagnostic).to.include('hgcapp-data-saved-network-node1-0" is Pending');
    expect(readinessError.podName).to.equal('network-node1-0');
  });

  it('KubeErrorTranslator translates a readiness failure into a pod-not-ready SoloError', (): void => {
    const cause: KubePodNotReadyError = new KubePodNotReadyError(
      'labels:app=network-node',
      'network-node1-0',
      'Pending',
      [],
      'PVC "hgcapp-data-saved-network-node1-0" is Pending',
    );
    const readinessError: KubePodReadinessFailedError = new KubePodReadinessFailedError(
      'solo',
      ['solo.hedera.com/type=network-node'],
      cause,
    );

    const translated: SoloError | undefined = KubeErrorTranslator.tryTranslate(readinessError);

    expect(translated).to.be.instanceOf(SoloErrors.system.podNotReady);
    expect(translated.message).to.include('volume mount diagnostic');
    expect(translated.message).to.include('network-node1-0');
  });

  it('KubeErrorTranslator translates a readiness failure with no observed pod into pod-not-found', (): void => {
    const cause: KubePodNotFoundError = new KubePodNotFoundError(
      'labels:solo.hedera.com/type=network-node',
      undefined,
      'PVC "hgcapp-data-saved-network-node1-0" is Pending',
    );
    const readinessError: KubePodReadinessFailedError = new KubePodReadinessFailedError(
      'solo',
      ['solo.hedera.com/type=network-node'],
      cause,
    );

    const translated: SoloError | undefined = KubeErrorTranslator.tryTranslate(readinessError);

    expect(translated).to.be.instanceOf(SoloErrors.system.podNotFound);
    expect(translated.message).to.include('volume mount diagnostic');
  });
});
