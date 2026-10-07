// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {K8ClientPod} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pod.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type PodVolumeMount} from '../../../../src/integration/kube/resources/pod/pod-volume-mount.js';
import {resetForTest} from '../../../test-container.js';

/** Builds a pod from a raw spec fixture, exercising the volume/volumeMount join in `fromV1Pod`. */
function buildPod(spec: object): Pod {
  const rawPod: object = {
    metadata: {name: 'network-node1-0', namespace: 'solo', labels: {}},
    spec,
    status: {phase: 'Running'},
  };
  return K8ClientPod.fromV1Pod(rawPod as never, undefined as never, undefined as never, undefined as never, '');
}

describe('K8ClientPod persistent volume claim mounts', (): void => {
  beforeEach((): void => {
    resetForTest();
  });

  it('pairs each claim with every path it is mounted on', (): void => {
    const pod: Pod = buildPod({
      containers: [
        {
          name: 'root-container',
          volumeMounts: [
            {name: 'hgcapp-data-saved', mountPath: '/opt/hgcapp/data/saved'},
            {name: 'hgcapp-event-streams', mountPath: '/opt/hgcapp/eventStreams'},
            {name: 'config', mountPath: '/etc/config'},
          ],
        },
      ],
      volumes: [
        {name: 'hgcapp-data-saved', persistentVolumeClaim: {claimName: 'hgcapp-data-saved-network-node1-0'}},
        {name: 'hgcapp-event-streams', persistentVolumeClaim: {claimName: 'hgcapp-event-streams-network-node1-0'}},
        {name: 'config', configMap: {name: 'network-node1-config'}},
      ],
    });

    const mounts: PodVolumeMount[] = pod.persistentVolumeClaimMounts;

    expect(mounts).to.have.lengthOf(2);
    expect(mounts[0]).to.deep.equal({
      claimName: 'hgcapp-data-saved-network-node1-0',
      volumeName: 'hgcapp-data-saved',
      containerName: 'root-container',
      mountPath: '/opt/hgcapp/data/saved',
    });
    expect(mounts[1].claimName).to.equal('hgcapp-event-streams-network-node1-0');
  });

  it('includes init container mounts', (): void => {
    const pod: Pod = buildPod({
      initContainers: [{name: 'init', volumeMounts: [{name: 'data', mountPath: '/data'}]}],
      containers: [{name: 'root-container', volumeMounts: []}],
      volumes: [{name: 'data', persistentVolumeClaim: {claimName: 'data-network-node1-0'}}],
    });

    expect(pod.persistentVolumeClaimMounts).to.have.lengthOf(1);
    expect(pod.persistentVolumeClaimMounts[0].containerName).to.equal('init');
  });

  it('is empty when the pod has no claim-backed volumes', (): void => {
    const pod: Pod = buildPod({
      containers: [{name: 'root-container', volumeMounts: [{name: 'scratch', mountPath: '/scratch'}]}],
      volumes: [{name: 'scratch', emptyDir: {}}],
    });

    expect(pod.persistentVolumeClaimMounts).to.be.empty;
  });

  it('omits a claim that no container mounts', (): void => {
    const pod: Pod = buildPod({
      containers: [{name: 'root-container', volumeMounts: []}],
      volumes: [{name: 'data', persistentVolumeClaim: {claimName: 'data-network-node1-0'}}],
    });

    expect(pod.persistentVolumeClaimMounts).to.be.empty;
  });
});
