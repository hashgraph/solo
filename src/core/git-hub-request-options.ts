// SPDX-License-Identifier: Apache-2.0

import {type Duration} from './time/duration.js';

/** Optional settings for {@link GitHubApiClient.get}. */
export interface GitHubRequestOptions {
  /** Aborts each attempt that takes longer. Unset means no timeout. */
  timeout?: Duration;
  /** Closes the connection with the response instead of keeping it open for reuse. Defaults to false. */
  closeConnection?: boolean;
}
