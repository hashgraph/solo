// SPDX-License-Identifier: Apache-2.0

import {testNodeAdd} from '../../test-add.js';
import {Duration} from '../../../src/core/time/duration.js';

const localBuildPath = '';
testNodeAdd(localBuildPath, 'Node add with released hedera', Duration.ofMinutes(3).toMillis());
