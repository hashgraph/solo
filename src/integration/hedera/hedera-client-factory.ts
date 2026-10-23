// SPDX-License-Identifier: Apache-2.0

import {type HederaClient} from './hedera-client.js';
import {type HederaClientOptions} from './hedera-client-options.js';

export interface HederaClientFactory {
  /**
   * Creates a client for the given network
   * @param options - the network and the client settings
   */
  create(options: HederaClientOptions): HederaClient;
}
