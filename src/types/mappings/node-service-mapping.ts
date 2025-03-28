// SPDX-License-Identifier: Apache-2.0

import {type NetworkNodeServices} from '../../core/network-node-services.js';
import {type NodeAlias} from '../aliases.js';

export type NodeServiceMapping = Map<NodeAlias, NetworkNodeServices>;
