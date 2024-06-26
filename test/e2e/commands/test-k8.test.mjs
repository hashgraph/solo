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
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import {constants, K8, Templates} from '../../../src/core/index.mjs'
import { getTestConfigManager, testLogger } from '../../test_util.js'
import { flags } from '../../../src/commands/index.mjs'
import * as Base64 from "js-base64";
import {PrivateKey} from "@hashgraph/sdk";



const defaultTimeout = 20000

describe('K8 Create Secret Unit Tests', () => {
  const argv = { }
  let k8

  beforeAll(async () => {
    argv[flags.namespace.name] = 'namespace'
    const configManager = getTestConfigManager('k8-solo.config')
    configManager.update(argv, true)
    k8 = await new K8(configManager, testLogger)
  }, defaultTimeout)


  it('k8 create secret in a loop many times', async () => {
    const privateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
    for (let i = 0; i < 100; i++) {
      const index = i.toString()
      const accountSecretCreated = await k8.createSecret(
        index,
        "solo-e2e", 'Opaque', {
          privateKey: Base64.encode(privateKey.toString()),
          publicKey: Base64.encode(privateKey.publicKey.toString())
        },
        Templates.renderAccountKeySecretLabelObject(index), true)
    }
  }, defaultTimeout)

})
