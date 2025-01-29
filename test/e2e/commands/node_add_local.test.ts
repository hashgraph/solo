/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe} from 'mocha';

import {testNodeAdd} from '../../test_add.js';
import {Duration} from '../../../src/core/time/duration.js';

describe('Node add with hedera local build', () => {
  const localBuildPath =
    'node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node3=../hedera-services/hedera-node/data';
  testNodeAdd(localBuildPath);
}).timeout(Duration.ofMinutes(3).toMillis());
