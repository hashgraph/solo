// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {PvcMountVerifier} from '../../../src/core/pvc-mount-verifier.js';
import {PvcMountFindingKind} from '../../../src/core/pvc-mount-finding-kind.js';
import {type PvcMountFinding} from '../../../src/core/pvc-mount-finding.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {PvcReference} from '../../../src/integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../../../src/integration/kube/resources/pvc/pvc-name.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type PvcDetail} from '../../../src/integration/kube/resources/pvc/pvc-detail.js';
import {resetForTest} from '../../test-container.js';

const NAMESPACE: NamespaceName = NamespaceName.of('solo');
const GIBIBYTE: number = 1024 ** 3;

/** A consensus node pod mounting one claim per stream directory, as the solo chart renders it. */
function buildPod(): Pod {
  return {
    podReference: PodReference.of(NAMESPACE, PodName.of('network-node1-0')),
    persistentVolumeClaimMounts: [
      {
        claimName: 'hgcapp-data-saved-network-node1-0',
        volumeName: 'hgcapp-data-saved',
        containerName: 'root-container',
        mountPath: '/opt/hgcapp/services-hedera/HapiApp2.0/data/saved',
      },
    ],
  } as Pod;
}

function buildClaim(requestedStorageBytes: number): PvcDetail {
  return {
    pvcReference: PvcReference.of(NAMESPACE, PvcName.of('hgcapp-data-saved-network-node1-0')),
    phase: 'Bound',
    requestedStorageBytes,
    storageClassName: 'local-path',
  };
}

describe('PvcMountVerifier', (): void => {
  let listPodsStub: SinonStub;
  let readAllPvcsStub: SinonStub;
  let execContainerStub: SinonStub;
  let verifier: PvcMountVerifier;

  beforeEach((): void => {
    resetForTest();
    listPodsStub = sinon.stub().resolves([buildPod()]);
    readAllPvcsStub = sinon.stub().resolves([buildClaim(500 * GIBIBYTE)]);
    execContainerStub = sinon.stub();

    const k8Factory: object = {
      getK8: (): object => ({
        pods: (): object => ({list: listPodsStub}),
        pvcs: (): object => ({readAll: readAllPvcsStub}),
        containers: (): object => ({readByRef: (): object => ({execContainer: execContainerStub})}),
      }),
    };

    verifier = new PvcMountVerifier(undefined, k8Factory as never);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('reports a claim mounted on a filesystem far smaller than it requested', async (): Promise<void> => {
    // 440GiB system disk standing in for a data array that never mounted, against a 500Gi claim.
    execContainerStub.resolves(`/opt/hgcapp/services-hedera/HapiApp2.0/data/saved\t${440 * GIBIBYTE}\n`);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', [
      'solo.hedera.com/type=network-node',
    ]);

    expect(findings).to.have.lengthOf(1);
    expect(findings[0].kind).to.equal(PvcMountFindingKind.UnderProvisioned);
    expect(findings[0].claimName).to.equal('hgcapp-data-saved-network-node1-0');
    expect(findings[0].description).to.include('requested 500GiB');
    expect(findings[0].description).to.include('backed by only 440GiB');
  });

  it('accepts a mount that provides the requested capacity', async (): Promise<void> => {
    execContainerStub.resolves(`/opt/hgcapp/services-hedera/HapiApp2.0/data/saved\t${500 * GIBIBYTE}\n`);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
  });

  it('tolerates filesystem overhead just under the requested size', async (): Promise<void> => {
    // A correctly provisioned 500Gi volume reports slightly less once formatted.
    execContainerStub.resolves(`/opt/hgcapp/services-hedera/HapiApp2.0/data/saved\t${491 * GIBIBYTE}\n`);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
  });

  it('reports a pod that has no claim-backed mounts at all', async (): Promise<void> => {
    listPodsStub.resolves([
      {podReference: PodReference.of(NAMESPACE, PodName.of('network-node1-0')), persistentVolumeClaimMounts: []} as Pod,
    ]);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.have.lengthOf(1);
    expect(findings[0].kind).to.equal(PvcMountFindingKind.NoPersistentStorage);
    expect(execContainerStub).to.not.have.been.called;
  });

  it('does not report a mount it could not probe', async (): Promise<void> => {
    execContainerStub.rejects(new Error('OCI runtime exec failed: exec format error'));

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
  });

  it('does not report a mount whose probe output is unusable', async (): Promise<void> => {
    execContainerStub.resolves('df: /opt/hgcapp: No such file or directory\n');

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
  });

  it('does not report a claim whose requested size is unknown', async (): Promise<void> => {
    readAllPvcsStub.resolves([]);
    execContainerStub.resolves(`/opt/hgcapp/services-hedera/HapiApp2.0/data/saved\t${1 * GIBIBYTE}\n`);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
  });

  it('makes no probe calls when no pods match the labels', async (): Promise<void> => {
    listPodsStub.resolves([]);

    const findings: PvcMountFinding[] = await verifier.verify(NAMESPACE, 'context-1', ['app=network-node']);

    expect(findings).to.be.empty;
    expect(readAllPvcsStub).to.not.have.been.called;
    expect(execContainerStub).to.not.have.been.called;
  });
});
