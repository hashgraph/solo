/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { v4 as uuid4 } from 'uuid'
import { FullstackTestingError } from '../../../src/core/errors.mjs'
import { ConfigManager, constants, logging, Templates } from '../../../src/core/index.mjs'
import { K8 } from '../../../src/core/k8.mjs'
import { flags } from '../../../src/commands/index.mjs'
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
  V1VolumeResourceRequirements
} from '@kubernetes/client-node'

const defaultTimeout = 120000

describe('K8', () => {
  const testLogger = logging.NewLogger('debug', true)
  const configManager = new ConfigManager(testLogger)
  const k8 = new K8(configManager, testLogger)
  const testNamespace = 'k8-e2e'
  const argv = []
  const podName = `test-pod-${uuid4()}`
  const containerName = 'alpine'
  const podLabelValue = `test-${uuid4()}`
  const serviceName = `test-service-${uuid4()}`

  beforeAll(async () => {
    try {
      argv[flags.namespace.name] = testNamespace
      configManager.update(argv)
      if (!await k8.hasNamespace(testNamespace)) {
        await k8.createNamespace(testNamespace)
      }
      const v1Pod = new V1Pod()
      const v1Metadata = new V1ObjectMeta()
      v1Metadata.name = podName
      v1Metadata.namespace = testNamespace
      v1Metadata.labels = { app: podLabelValue }
      v1Pod.metadata = v1Metadata
      const v1Container = new V1Container()
      v1Container.name = containerName
      v1Container.image = 'alpine:latest'
      v1Container.command = ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200']
      const v1Probe = new V1Probe()
      const v1ExecAction = new V1ExecAction()
      v1ExecAction.command = ['bash', '-c', 'exit 0']
      v1Probe.exec = v1ExecAction
      v1Container.startupProbe = v1Probe
      const v1Spec = new V1PodSpec()
      v1Spec.containers = [v1Container]
      v1Pod.spec = v1Spec
      await k8.kubeClient.createNamespacedPod(testNamespace, v1Pod)
      const v1Svc = new V1Service()
      const v1SvcMetadata = new V1ObjectMeta()
      v1SvcMetadata.name = serviceName
      v1SvcMetadata.namespace = testNamespace
      v1SvcMetadata.labels = { app: 'svc-test' }
      v1Svc.metadata = v1SvcMetadata
      const v1SvcSpec = new V1ServiceSpec()
      const v1SvcPort = new V1ServicePort()
      v1SvcPort.port = 80
      v1SvcPort.targetPort = 80
      v1SvcSpec.ports = [v1SvcPort]
      v1Svc.spec = v1SvcSpec
      await k8.kubeClient.createNamespacedService(testNamespace, v1Svc)
    } catch (e) {
      console.log(`${e}, ${e.stack}`)
      throw e
    }
  }, defaultTimeout)

  afterAll(async () => {
    try {
      await k8.kubeClient.deleteNamespacedPod(podName, testNamespace, undefined, undefined, 1)
      argv[flags.namespace.name] = constants.FULLSTACK_SETUP_NAMESPACE
      configManager.update(argv)
    } catch (e) {
      console.log(e)
      throw e
    }
  }, defaultTimeout)

  it('should be able to list clusters', async () => {
    const clusters = await k8.getClusters()
    expect(clusters).not.toHaveLength(0)
  }, defaultTimeout)

  it('should be able to list namespaces', async () => {
    const namespaces = await k8.getNamespaces()
    expect(namespaces).not.toHaveLength(0)
    expect(namespaces).toContain(constants.DEFAULT_NAMESPACE)
  }, defaultTimeout)

  it('should be able to list contexts', async () => {
    const contexts = await k8.getContexts()
    expect(contexts).not.toHaveLength(0)
  }, defaultTimeout)

  it('should be able to create and delete a namespaces', async () => {
    const name = uuid4()
    await expect(k8.createNamespace(name)).resolves.toBeTruthy()
    await expect(k8.deleteNamespace(name)).resolves.toBeTruthy()
  }, defaultTimeout)

  it('should be able to run wait for pod', async () => {
    const labels = [`app=${podLabelValue}`]

    const pods = await k8.waitForPods([constants.POD_PHASE_RUNNING], labels, 1, 30)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to run wait for pod ready', async () => {
    const labels = [`app=${podLabelValue}`]

    const pods = await k8.waitForPodReady(labels, 1, 100)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to run wait for pod conditions', async () => {
    const labels = [`app=${podLabelValue}`]

    const conditions = new Map()
      .set(constants.POD_CONDITION_INITIALIZED, constants.POD_CONDITION_STATUS_TRUE)
      .set(constants.POD_CONDITION_POD_SCHEDULED, constants.POD_CONDITION_STATUS_TRUE)
      .set(constants.POD_CONDITION_READY, constants.POD_CONDITION_STATUS_TRUE)
    const pods = await k8.waitForPodConditions(conditions, labels, 1)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to detect pod IP of a pod', async () => {
    const pods = await k8.getPodsByLabel([`app=${podLabelValue}`])
    const podName = pods[0].metadata.name
    await expect(k8.getPodIP(podName)).resolves.not.toBeNull()
    await expect(k8.getPodIP('INVALID')).rejects.toThrow(FullstackTestingError)
  }, defaultTimeout)

  it('should be able to detect cluster IP', async () => {
    await expect(k8.getClusterIP(serviceName)).resolves.not.toBeNull()
    await expect(k8.getClusterIP('INVALID')).rejects.toThrow(FullstackTestingError)
  }, defaultTimeout)

  it('should be able to check if a path is directory inside a container', async () => {
    const pods = await k8.getPodsByLabel([`app=${podLabelValue}`])
    const podName = pods[0].metadata.name
    await expect(k8.hasDir(podName, containerName, '/tmp')).resolves.toBeTruthy()
  }, defaultTimeout)

  it('should be able to copy a file to and from a container', async () => {
    const pods = await k8.waitForPodReady([`app=${podLabelValue}`], 1, 20)
    expect(pods.length).toStrictEqual(1)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8-'))
    const destDir = '/tmp'
    const srcPath = 'test/data/pem/keys/a-private-node0.pem'
    const destPath = `${destDir}/a-private-node0.pem`

    // upload the file
    await expect(k8.copyTo(podName, containerName, srcPath, destDir)).resolves.toBeTruthy()

    // download the same file
    await expect(k8.copyFrom(podName, containerName, destPath, tmpDir)).resolves.toBeTruthy()

    // rm file inside the container
    await expect(k8.execContainer(podName, containerName, ['rm', '-f', destPath])).resolves

    fs.rmdirSync(tmpDir, { recursive: true })
  }, defaultTimeout)

  it('should be able to port forward gossip port', (done) => {
    const podName = Templates.renderNetworkPodName('node1')
    const localPort = constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT
    try {
      k8.portForward(podName, localPort, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT).then((server) => {
        expect(server).not.toBeNull()

        // client
        const s = new net.Socket()
        s.on('ready', async () => {
          s.destroy()
          await k8.stopPortForward(server)
          done()
        })

        s.on('error', async (e) => {
          s.destroy()
          await k8.stopPortForward(server)
          done(new FullstackTestingError(`could not connect to local port '${localPort}': ${e.message}`, e))
        })

        s.connect(localPort)
      })
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
    // TODO enhance this test to do something with the port, this pod isn't even running, but it is still passing
  }, defaultTimeout)

  it('should be able to cat a file inside the container', async () => {
    const pods = await k8.getPodsByLabel([`app=${podLabelValue}`])
    const podName = pods[0].metadata.name
    const output = await k8.execContainer(podName, containerName, ['cat', '/etc/hostname'])
    expect(output.indexOf(podName)).toEqual(0)
  }, defaultTimeout)

  it('should be able to list persistent volume claims', async () => {
    const v1Pvc = new V1PersistentVolumeClaim()
    try {
      v1Pvc.name = `test-pvc-${uuid4()}`
      const v1Spec = new V1PersistentVolumeClaimSpec()
      v1Spec.accessModes = ['ReadWriteOnce']
      const v1ResReq = new V1VolumeResourceRequirements()
      v1ResReq.requests = { storage: '50Mi' }
      v1Spec.resources = v1ResReq
      v1Pvc.spec = v1Spec
      const v1Metadata = new V1ObjectMeta()
      v1Metadata.name = v1Pvc.name
      v1Pvc.metadata = v1Metadata
      await k8.kubeClient.createNamespacedPersistentVolumeClaim(testNamespace, v1Pvc)
      const pvcs = await k8.listPvcsByNamespace(testNamespace)
      expect(pvcs.length).toBeGreaterThan(0)
    } catch (e) {
      console.error(e)
      throw e
    } finally {
      await k8.deletePvc(v1Pvc.name, testNamespace)
    }
  }, defaultTimeout)
})
