// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {v4 as uuid4} from 'uuid';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import crypto from 'node:crypto';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {ServiceReference} from '../../../../src/integration/kube/resources/service/service-reference.js';
import {ServiceName} from '../../../../src/integration/kube/resources/service/service-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

const defaultTimeout: number = Duration.ofMinutes(2).toMillis();
const TEST_POD_IMAGE: string = process.env.K8_E2E_TEST_IMAGE ?? 'registry.k8s.io/e2e-test-images/busybox:1.29';

async function createPod(
  podReference: PodReference,
  containerName: ContainerName,
  podLabelValue: string,
  k8Factory: K8Factory,
  image: string,
): Promise<void> {
  await k8Factory
    .default()
    .pods()
    .create(
      podReference,
      {app: podLabelValue},
      containerName,
      image,
      ['/bin/sh', '-c', 'sleep 7200'],
      ['/bin/sh', '-c', 'exit 0'],
    );
}

describe('K8', (): void => {
  const testLogger: SoloLogger = new SoloPinoLogger('debug', true);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
  const testNamespace: NamespaceName = NamespaceName.of('k8-e2e');
  const argv: Argv = Argv.initializeEmpty();
  const podName: PodName = PodName.of(`test-pod-${uuid4()}`);
  const podReference: PodReference = PodReference.of(testNamespace, podName);
  const containerName: ContainerName = ContainerName.of('alpine');
  const podLabelValue: string = `test-${uuid4()}`;
  const serviceName: string = `test-service-${uuid4()}`;

  before(async (): Promise<void> => {
    try {
      argv.setArg(flags.namespace, testNamespace.name);
      configManager.update(argv.build());
      if (!(await k8Factory.default().namespaces().has(testNamespace))) {
        await k8Factory.default().namespaces().create(testNamespace);
      }
      await createPod(podReference, containerName, podLabelValue, k8Factory, TEST_POD_IMAGE);

      const serviceReference: ServiceReference = ServiceReference.of(testNamespace, ServiceName.of(serviceName));
      await k8Factory.default().services().create(serviceReference, {app: 'svc-test'}, 80, 80);
      // wait 10 seconds for the pod up and running
      await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 10_000));
    } catch (error) {
      console.log(`${error}, ${error.stack}`);
      throw error;
    }
  }).timeout(defaultTimeout);

  after(async (): Promise<void> => {
    try {
      await k8Factory.default().pods().readByReference(PodReference.of(testNamespace, podName)).killPod();
      argv.setArg(flags.namespace, constants.SOLO_SETUP_NAMESPACE.name);
      configManager.update(argv.build());
    } catch (error) {
      console.log(error);
      throw error;
    }
  }).timeout(defaultTimeout);

  it('should be able to list clusters', async (): Promise<void> => {
    const clusters: string[] = k8Factory.default().clusters().list();
    expect(clusters).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to list namespaces', async (): Promise<void> => {
    const namespaces: NamespaceName[] = await k8Factory.default().namespaces().list();
    expect(namespaces).not.to.have.lengthOf(0);
    const match: NamespaceName[] = namespaces.filter(
      (n: NamespaceName): boolean => n.name === constants.DEFAULT_NAMESPACE.name,
    );
    expect(match).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to list context names', (): void => {
    const contexts: string[] = k8Factory.default().contexts().list();
    expect(contexts).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to create and delete a namespaces', async (): Promise<void> => {
    const name: string = uuid4();
    expect(await k8Factory.default().namespaces().create(NamespaceName.of(name))).to.be.true;
    expect(await k8Factory.default().namespaces().delete(NamespaceName.of(name))).to.be.true;
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod', async (): Promise<void> => {
    const labels: string[] = [`app=${podLabelValue}`];

    const pods: Pod[] = await k8Factory
      .default()
      .pods()
      .waitForRunningPhase(testNamespace, labels, 30, constants.PODS_RUNNING_DELAY);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod ready', async (): Promise<void> => {
    const labels: string[] = [`app=${podLabelValue}`];

    const pods: Pod[] = await k8Factory.default().pods().waitForReadyStatus(testNamespace, labels, 100);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to check if a path is directory inside a container', async (): Promise<void> => {
    const pods: Pod[] = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    expect(
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(pods[0].podReference, containerName))
        .hasDir('/tmp'),
    ).to.be.true;
  }).timeout(defaultTimeout);

  const testCases: string[] = ['test/data/pem/keys/a-private-node0.pem', 'test/data/build-v0.54.0-alpha.4.zip'];

  each(testCases).describe('test copyTo and copyFrom', (localFilePath: string): void => {
    it('should be able to copy a file to and from a container', async (): Promise<void> => {
      const pods: Pod[] = await k8Factory
        .default()
        .pods()
        .waitForReadyStatus(testNamespace, [`app=${podLabelValue}`], 20);
      expect(pods).to.have.lengthOf(1);

      const localTemporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'k8-test'));
      const remoteTemporaryDirectory: string = '/tmp';
      const fileName: string = path.basename(localFilePath);
      const remoteFilePath: string = `${remoteTemporaryDirectory}/${fileName}`;
      const originalFileData: Buffer = fs.readFileSync(localFilePath);
      const originalFileHash: string = crypto.createHash('sha384').update(originalFileData).digest('hex');
      const originalStat: fs.Stats = fs.statSync(localFilePath);

      // upload the file
      expect(
        await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, containerName))
          .copyTo(localFilePath, remoteTemporaryDirectory),
      ).to.be.true;

      // download the same file
      expect(
        await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, containerName))
          .copyFrom(remoteFilePath, localTemporaryDirectory),
      ).to.be.true;
      const downloadedFilePath: string = PathEx.joinWithRealPath(localTemporaryDirectory, fileName);
      const downloadedFileData: Buffer = fs.readFileSync(downloadedFilePath);
      const downloadedFileHash: string = crypto.createHash('sha384').update(downloadedFileData).digest('hex');
      const downloadedStat: fs.Stats = fs.statSync(downloadedFilePath);

      expect(downloadedStat.size, 'downloaded file size should match original file size').to.equal(originalStat.size);
      expect(downloadedFileHash, 'downloaded file hash should match original file hash').to.equal(originalFileHash);

      // rm file inside the container
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(podReference, containerName))
        .execContainer(['rm', '-f', remoteFilePath]);

      fs.rmSync(localTemporaryDirectory, {recursive: true});
    }).timeout(defaultTimeout);
  });

  it('should be able to port forward gossip port', (done: Mocha.Done): void => {
    const localPort: number = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    try {
      const podReference: PodReference = PodReference.of(testNamespace, podName);
      k8Factory
        .default()
        .pods()
        .readByReference(podReference)
        .portForward(localPort, +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        .then(async (server: number): Promise<void> => {
          // sleep for 5 seconds to allow the port forward to start
          await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, 5000));
          expect(server).not.to.be.null;

          // client
          const s: net.Socket = new net.Socket();
          s.on('ready', async (): Promise<void> => {
            s.destroy();
            await k8Factory.default().pods().readByReference(podReference).stopPortForward(server);
            done();
          });

          s.on('error', async (error: Error): Promise<void> => {
            s.destroy();
            await k8Factory.default().pods().readByReference(podReference).stopPortForward(server);
            done(new SoloError(`could not connect to local port '${localPort}': ${error.message}`, error));
          });

          s.connect(localPort);
        });
    } catch (error) {
      testLogger.showUserError(error);
      expect.fail();
    }
    // TODO enhance this test to do something with the port, this pod isn't even running, but it is still passing
  }).timeout(defaultTimeout);

  it('should be able to cat a file inside the container', async (): Promise<void> => {
    const pods: Pod[] = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    const podName: PodName = pods[0].podReference.name;
    const output: string = await k8Factory
      .default()
      .containers()
      .readByRef(ContainerReference.of(PodReference.of(testNamespace, podName), containerName))
      .execContainer(['cat', '/etc/hostname']);
    expect(output.indexOf(podName.name)).to.equal(0);
  }).timeout(defaultTimeout);

  it('should be able to list persistent volume claims', async (): Promise<void> => {
    const pvcReference: PodReference = PodReference.of(testNamespace, PodName.of(`test-pvc-${uuid4()}`));
    try {
      await k8Factory.default().pvcs().create(pvcReference, {storage: '50Mi'}, ['ReadWriteOnce']);
      const pvcs: string[] = await k8Factory.default().pvcs().list(testNamespace);
      expect(pvcs).to.have.length.greaterThan(0);
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      await k8Factory.default().pvcs().delete(pvcReference);
    }
  }).timeout(defaultTimeout);

  it('should be able to kill a pod', async (): Promise<void> => {
    const podName: PodName = PodName.of(`test-pod-${uuid4()}`);
    const podReference: PodReference = PodReference.of(testNamespace, podName);
    const podLabelValue: string = `test-${uuid4()}`;
    await createPod(podReference, containerName, podLabelValue, k8Factory, TEST_POD_IMAGE);
    await k8Factory.default().pods().readByReference(podReference).killPod();
    const newPods: Pod[] = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    expect(newPods).to.have.lengthOf(0);
  });
});
