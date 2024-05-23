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
import { beforeAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { v4 as uuid4 } from 'uuid'
import { FullstackTestingError } from '../../../src/core/errors.mjs'
import { ConfigManager, constants, logging, Templates } from '../../../src/core/index.mjs'
import { K8 } from '../../../src/core/k8.mjs'

const defaultTimeout = 20000

describe('K8', () => {
  const testLogger = logging.NewLogger('debug', true)
  const configManager = new ConfigManager(testLogger)
  const k8 = new K8(configManager, testLogger)

  beforeAll(() => {
    configManager.load()
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

  it('should be able to detect pod IP of a pod', async () => {
    const podName = Templates.renderNetworkPodName('node0')
    await expect(k8.getPodIP(podName)).resolves.not.toBeNull()
    await expect(k8.getPodIP('INVALID')).rejects.toThrow(FullstackTestingError)
  }, defaultTimeout)

  it('should be able to detect cluster IP', async () => {
    const svcName = Templates.renderNetworkSvcName('node0')
    await expect(k8.getClusterIP(svcName)).resolves.not.toBeNull()
    await expect(k8.getClusterIP('INVALID')).rejects.toThrow(FullstackTestingError)
  }, defaultTimeout)

  it('should be able to check if a path is directory inside a container', async () => {
    const podName = Templates.renderNetworkPodName('node0')
    await expect(k8.hasDir(podName, constants.ROOT_CONTAINER, constants.HEDERA_USER_HOME_DIR)).resolves.toBeTruthy()
  }, defaultTimeout)

  it('should be able to copy a file to and from a container', async () => {
    const podName = Templates.renderNetworkPodName('node0')
    const containerName = constants.ROOT_CONTAINER

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8-'))
    const destDir = constants.HEDERA_USER_HOME_DIR
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
    const podName = Templates.renderNetworkPodName('node0')
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
  }, defaultTimeout)

  it('should be able to run wait for pod', async () => {
    const labels = [
      'fullstack.hedera.com/type=network-node'
    ]

    const pods = await k8.waitForPods([constants.POD_PHASE_RUNNING], labels, 1)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to run wait for pod ready', async () => {
    const labels = [
      'fullstack.hedera.com/type=network-node'
    ]

    const pods = await k8.waitForPodReady(labels, 1)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to run wait for pod conditions', async () => {
    const labels = [
      'fullstack.hedera.com/type=network-node'
    ]

    const conditions = new Map()
      .set(constants.POD_CONDITION_INITIALIZED, constants.POD_CONDITION_STATUS_TRUE)
      .set(constants.POD_CONDITION_POD_SCHEDULED, constants.POD_CONDITION_STATUS_TRUE)
      .set(constants.POD_CONDITION_READY, constants.POD_CONDITION_STATUS_TRUE)
    const pods = await k8.waitForPodConditions(conditions, labels, 1)
    expect(pods.length).toStrictEqual(1)
  }, defaultTimeout)

  it('should be able to cat a log file inside the container', async () => {
    const podName = Templates.renderNetworkPodName('node0')
    const containerName = constants.ROOT_CONTAINER
    const testFileName = 'test.txt'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8-'))
    const tmpFile = path.join(tmpDir, testFileName)
    const destDir = constants.HEDERA_USER_HOME_DIR
    const destPath = `${destDir}/${testFileName}`
    fs.writeFileSync(tmpFile, 'TEST\nNow current platform status = ACTIVE')

    await expect(k8.copyTo(podName, containerName, tmpFile, destDir)).resolves.toBeTruthy()
    const output = await k8.execContainer(podName, containerName, ['tail', '-10', destPath])
    expect(output.indexOf('Now current platform status = ACTIVE')).toBeGreaterThan(0)

    fs.rmdirSync(tmpDir, { recursive: true })
  }, defaultTimeout)

  it('should be able to list persistent volume claims', async () => {
    const pvcs = await k8.listPvcsByNamespace(k8._getNamespace())
    expect(pvcs.length).toBeGreaterThan(0)
  }, defaultTimeout)

  it('should be able to recycle pod by labels', async () => {
    const podLabels = ['app=haproxy-node0', 'fullstack.hedera.com/type=haproxy']
    const podArray1 = await k8.getPodsByLabel(podLabels)
    const podsArray2 = await k8.recyclePodByLabels(podLabels)
    expect(podsArray2.length >= podArray1.length).toBeTruthy()
  }, 120000)
})
