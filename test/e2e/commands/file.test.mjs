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
 * @jest-environment steps
 */

import {
  AccountId,
  FileContentsQuery,
  FileId,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType,
  PrivateKey
} from '@hashgraph/sdk'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import {
  constants
} from '../../../src/core/index.mjs'
import * as version from '../../../version.mjs'
import {
  bootstrapNetwork, bootstrapTestVariables,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js'
import { AccountCommand } from '../../../src/commands/account.mjs'
import { flags } from '../../../src/commands/index.mjs'
import {getNodeLogs, sleep} from '../../../src/core/helpers.mjs'
import fs from "fs";
import AdmZip from "adm-zip";
import crypto from "crypto";

describe('AccountCommand', () => {
  const testName = 'account-cmd-e2e'
  const namespace = testName
  const defaultTimeout = 20000
  const testSystemAccounts = [[3, 5]]
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node0'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const accountCmd = new AccountCommand(bootstrapResp.opts, testSystemAccounts)


  describe('test update file 0.0.150', () => {
    let accountId1, accountId2

    it('should update file 0.0.150', async () => {
      await accountManager.loadNodeClient(namespace)
      const client = accountManager._nodeClient


      // fetch special file
      // const fileQuery = new FileContentsQuery().setFileId(fileId)
      // const addressBookBytes = await fileQuery.execute(client)
      // const fileHash = crypto.createHash('sha384').update(addressBookBytes).digest('hex')

      // create a file VERSION with content
      // VERSION=0.2
      //  Thu Jun 27 11:07:20 UTC 2024
      const versionFile = `/Users/jeffrey//.solo/cache/v0.51/staging/v0.51.0/VERSION`
      fs.writeFileSync(versionFile, '0.2\n')
      fs.appendFileSync(versionFile, `${new Date().toUTCString()}\n`)

      // bundle config.txt and VERSIO into a zip file
      const zipFile = `/Users/jeffrey//.solo/cache/v0.51/staging/v0.51.0/freeze.zip`
      const zip = AdmZip('', {})
      zip.addLocalFile(`/Users/jeffrey//.solo/cache/v0.51/staging/v0.51.0/VERSION`)
      zip.addLocalFile(`/Users/jeffrey//.solo/cache/v0.51/staging/v0.51.0/config.txt`)
      // get byte value of the zip file
      const zipBytes = zip.toBuffer()
      const zipHash = crypto.createHash('sha384').update(zipBytes).digest('hex')

      accountManager.logger.debug(`zipHash = ${zipHash}  zipBytes.length = ${zipBytes.length}`)
      // create a file upload transaction to upload file to the network
      const fileId = FileId.fromString('0.0.150')
      const fileTransaction = new FileUpdateTransaction()
        .setFileId(fileId)
        .setContents(zipBytes)


      const fileTransactionReceipt = await fileTransaction.execute(client)
      accountManager.logger.debug(`fileTransactionReceipt = ${fileTransactionReceipt.toString()}`)


      const prepareUpgradeTx = await new FreezeTransaction()
        .setFreezeType(FreezeType.PrepareUpgrade)
        .setFileId(fileId)
        .setFileHash(zipHash)
        .freezeWith(client)
        .execute(client)

      const prepareUpgradeReceipt = await prepareUpgradeTx.getReceipt(client)

      accountManager.logger.debug(
        `Upgrade prepared with transaction id: ${prepareUpgradeTx.transactionId.toString()}`,
        prepareUpgradeReceipt.status.toString()
      )

      const fileQuery = new FileContentsQuery().setFileId(fileId)
      const updateFileBinary = await fileQuery.execute(client)
      // save updateFileBinary to a file
      fs.writeFileSync(`/Users/jeffrey//.solo/cache/v0.51/staging/v0.51.0//update.zip`, updateFileBinary)

    }, defaultTimeout)

  })
})
