// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../core/constants.js';
import {SubprocessEnvironment} from '../../core/subprocess-environment.js';

/** Resolves which container engine backs kind; neither engine client owns the question. */
export class KindProviderResolver {
  /** The kind provider in effect: the session value, else a user-provided `KIND_EXPERIMENTAL_PROVIDER`. */
  public static current(): string | undefined {
    return (
      SubprocessEnvironment.sessionVariable('KIND_EXPERIMENTAL_PROVIDER') ??
      constants.getEnvironmentVariable('KIND_EXPERIMENTAL_PROVIDER')
    );
  }
}
