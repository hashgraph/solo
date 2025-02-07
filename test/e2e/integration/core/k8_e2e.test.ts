/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {v4 as uuid4} from 'uuid';
import {SoloError} from '../../../../src/core/errors.js';
import * as constants from '../../../../src/core/constants.js';
import {Templates} from '../../../../src/core/templates.js';
import {ConfigManager} from '../../../../src/core/config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1PersistentVolumeClaim,
  V1PersistentVolumeClaimSpec,
  V1Pod,
  V1PodSpec,
  V1Probe,
  V1Service,
  V1ServicePort,
  V1ServiceSpec,
  V1VolumeResourceRequirements,
} from '@kubernetes/client-node';
import crypto from 'crypto';
import {PodName} from '../../../../src/core/kube/pod_name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {type K8Client} from '../../../../src/core/kube/k8_client.js';
import {NamespaceName} from '../../../../src/core/kube/namespace_name.js';
import {PodRef} from '../../../../src/core/kube/pod_ref.js';
import {ContainerName} from '../../../../src/core/kube/container_name.js';
import {ContainerRef} from '../../../../src/core/kube/container_ref.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();

async function createPod(
  podRef: PodRef,
  containerName: ContainerName,
  podLabelValue: string,
  k8: K8Client,
): Promise<void> {
  const v1Pod = new V1Pod();
  const v1Metadata = new V1ObjectMeta();
  v1Metadata.name = podRef.podName.name;
  v1Metadata.namespace = podRef.namespaceName.name;
  v1Metadata.labels = {app: podLabelValue};
  v1Pod.metadata = v1Metadata;
  const v1Container = new V1Container();
  v1Container.name = containerName.name;
  v1Container.image = 'alpine:latest';
  v1Container.command = ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'];
  const v1Probe = new V1Probe();
  const v1ExecAction = new V1ExecAction();
  v1ExecAction.command = ['bash', '-c', 'exit 0'];
  v1Probe.exec = v1ExecAction;
  v1Container.startupProbe = v1Probe;
  const v1Spec = new V1PodSpec();
  v1Spec.containers = [v1Container];
  v1Pod.spec = v1Spec;
  await k8.kubeClient.createNamespacedPod(podRef.namespaceName.name, v1Pod);
}

describe('K8', () => {
  const testLogger = logging.NewLogger('debug', true);
  const configManager = container.resolve(ConfigManager);
  const k8 = container.resolve('K8') as K8Client;
  const testNamespace = NamespaceName.of('k8-e2e');
  const argv = [];
  const podName = PodName.of(`test-pod-${uuid4()}`);
  const podRef = PodRef.of(testNamespace, podName);
  const containerName = ContainerName.of('alpine');
  const podLabelValue = `test-${uuid4()}`;
  const serviceName = `test-service-${uuid4()}`;

  before(async function () {
    this.timeout(defaultTimeout);
    try {
      argv[flags.namespace.name] = testNamespace.name;
      configManager.update(argv);
      if (!(await k8.hasNamespace(testNamespace))) {
        await k8.createNamespace(testNamespace);
      }
      await createPod(podRef, containerName, podLabelValue, k8);
      const v1Svc = new V1Service();
      const v1SvcMetadata = new V1ObjectMeta();
      v1SvcMetadata.name = serviceName;
      v1SvcMetadata.namespace = testNamespace.name;
      v1SvcMetadata.labels = {app: 'svc-test'};
      v1Svc.metadata = v1SvcMetadata;
      const v1SvcSpec = new V1ServiceSpec();
      const v1SvcPort = new V1ServicePort();
      v1SvcPort.port = 80;
      v1SvcPort.targetPort = 80;
      v1SvcSpec.ports = [v1SvcPort];
      v1Svc.spec = v1SvcSpec;
      await k8.kubeClient.createNamespacedService(testNamespace.name, v1Svc);
    } catch (e) {
      console.log(`${e}, ${e.stack}`);
      throw e;
    }
  });

  after(async function () {
    this.timeout(defaultTimeout);
    try {
      await k8.killPod(PodRef.of(testNamespace, podName));
      argv[flags.namespace.name] = constants.SOLO_SETUP_NAMESPACE.name;
      configManager.update(argv);
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  it('should be able to list clusters', async () => {
    const clusters = k8.clusters().list();
    expect(clusters).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to list namespaces', async () => {
    const namespaces = await k8.getNamespaces();
    expect(namespaces).not.to.have.lengthOf(0);
    const match = namespaces.filter(n => n.name === constants.DEFAULT_NAMESPACE.name);
    expect(match).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to list context names', () => {
    const contexts = k8.getContextNames();
    expect(contexts).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to create and delete a namespaces', async () => {
    const name = uuid4();
    expect(await k8.createNamespace(NamespaceName.of(name))).to.be.true;
    expect(await k8.deleteNamespace(NamespaceName.of(name))).to.be.true;
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod', async () => {
    const labels = [`app=${podLabelValue}`];

    const pods = await k8.waitForPods([constants.POD_PHASE_RUNNING], labels, 1, 30);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod ready', async () => {
    const labels = [`app=${podLabelValue}`];

    const pods = await k8.waitForPodReady(labels, 1, 100);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to check if a path is directory inside a container', async () => {
    const pods = await k8.getPodsByLabel([`app=${podLabelValue}`]);
    const podName = PodName.of(pods[0].metadata.name);
    expect(await k8.hasDir(ContainerRef.of(PodRef.of(testNamespace, podName), containerName), '/tmp')).to.be.true;
  }).timeout(defaultTimeout);

  const testCases = ['test/data/pem/keys/a-private-node0.pem', 'test/data/build-v0.54.0-alpha.4.zip'];

  each(testCases).describe('test copyTo and copyFrom', localFilePath => {
    it('should be able to copy a file to and from a container', async () => {
      const pods = await k8.waitForPodReady([`app=${podLabelValue}`], 1, 20);
      expect(pods).to.have.lengthOf(1);

      const localTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8-test'));
      const remoteTmpDir = '/tmp';
      const fileName = path.basename(localFilePath);
      const remoteFilePath = `${remoteTmpDir}/${fileName}`;
      const originalFileData = fs.readFileSync(localFilePath);
      const originalFileHash = crypto.createHash('sha384').update(originalFileData).digest('hex');
      const originalStat = fs.statSync(localFilePath);

      // upload the file
      expect(await k8.copyTo(ContainerRef.of(podRef, containerName), localFilePath, remoteTmpDir)).to.be.true;

      // download the same file
      expect(await k8.copyFrom(ContainerRef.of(podRef, containerName), remoteFilePath, localTmpDir)).to.be.true;
      const downloadedFilePath = path.join(localTmpDir, fileName);
      const downloadedFileData = fs.readFileSync(downloadedFilePath);
      const downloadedFileHash = crypto.createHash('sha384').update(downloadedFileData).digest('hex');
      const downloadedStat = fs.statSync(downloadedFilePath);

      expect(downloadedStat.size, 'downloaded file size should match original file size').to.equal(originalStat.size);
      expect(downloadedFileHash, 'downloaded file hash should match original file hash').to.equal(originalFileHash);

      // rm file inside the container
      await k8.execContainer(ContainerRef.of(podRef, containerName), ['rm', '-f', remoteFilePath]);

      fs.rmdirSync(localTmpDir, {recursive: true});
    }).timeout(defaultTimeout);
  });

  it('should be able to port forward gossip port', done => {
    const podName = Templates.renderNetworkPodName('node1');
    const localPort = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    try {
      k8.portForward(PodRef.of(testNamespace, podName), localPort, +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT).then(
        server => {
          expect(server).not.to.be.null;

          // client
          const s = new net.Socket();
          s.on('ready', async () => {
            s.destroy();
            await k8.stopPortForward(server);
            done();
          });

          s.on('error', async e => {
            s.destroy();
            await k8.stopPortForward(server);
            done(new SoloError(`could not connect to local port '${localPort}': ${e.message}`, e));
          });

          s.connect(localPort);
        },
      );
    } catch (e) {
      testLogger.showUserError(e);
      expect.fail();
    }
    // TODO enhance this test to do something with the port, this pod isn't even running, but it is still passing
  }).timeout(defaultTimeout);

  it('should be able to cat a file inside the container', async () => {
    const pods = await k8.getPodsByLabel([`app=${podLabelValue}`]);
    const podName = PodName.of(pods[0].metadata.name);
    const output = await k8.execContainer(ContainerRef.of(PodRef.of(testNamespace, podName), containerName), [
      'cat',
      '/etc/hostname',
    ]);
    expect(output.indexOf(podName.name)).to.equal(0);
  }).timeout(defaultTimeout);

  it('should be able to list persistent volume claims', async () => {
    const v1Pvc = new V1PersistentVolumeClaim() as V1PersistentVolumeClaim & {name: string};
    try {
      v1Pvc.name = `test-pvc-${uuid4()}`;
      const v1Spec = new V1PersistentVolumeClaimSpec();
      v1Spec.accessModes = ['ReadWriteOnce'];
      const v1ResReq = new V1VolumeResourceRequirements();
      v1ResReq.requests = {storage: '50Mi'};
      v1Spec.resources = v1ResReq;
      v1Pvc.spec = v1Spec;
      const v1Metadata = new V1ObjectMeta();
      v1Metadata.name = v1Pvc.name;
      v1Pvc.metadata = v1Metadata;
      await k8.kubeClient.createNamespacedPersistentVolumeClaim(testNamespace.name, v1Pvc);
      const pvcs = await k8.listPvcsByNamespace(testNamespace);
      expect(pvcs).to.have.length.greaterThan(0);
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      await k8.deletePvc(v1Pvc.name, testNamespace);
    }
  }).timeout(defaultTimeout);

  it('should be able to kill a pod', async () => {
    const podName = PodName.of(`test-pod-${uuid4()}`);
    const podRef = PodRef.of(testNamespace, podName);
    const podLabelValue = `test-${uuid4()}`;
    await createPod(podRef, containerName, podLabelValue, k8);
    await k8.killPod(podRef);
    const newPods = await k8.getPodsByLabel([`app=${podLabelValue}`]);
    expect(newPods).to.have.lengthOf(0);
  });
});
