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
import { describe } from '@jest/globals'
import { testNodeAdd } from '../../test_add.mjs'

describe('Node add with hedera local build', () => {
  const localBuildPath = 'node0=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node2=../hedera-services/hedera-node/data'
  testNodeAdd(localBuildPath)
})
