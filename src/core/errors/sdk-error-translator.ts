// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './solo-errors.js';
import {type SoloError} from './solo-error.js';

export class SdkErrorTranslator {
  /** Message thrown by the Hedera SDK's ManagedNetwork when all of the client's gRPC channels are marked unhealthy. */
  private static readonly NO_HEALTHY_NODE_MESSAGE: string = 'failed to find a healthy working node';

  /**
   * Attempts to translate a raw Hedera SDK error into the corresponding SoloError.
   * The SDK error may be buried in the cause chain of wrapping errors, so the chain is walked (depth-capped).
   * Returns the translated SoloError, or undefined if the error is not a known SDK error.
   */
  public static tryTranslate(error: unknown): SoloError | undefined {
    let depth: number = 0;
    for (let current: unknown = error; current instanceof Error && depth < 10; current = current.cause, depth++) {
      if (current.message?.toLowerCase().includes(SdkErrorTranslator.NO_HEALTHY_NODE_MESSAGE)) {
        return new SoloErrors.component.sdkClientNoHealthyNodes(error as Error);
      }
    }
    return undefined;
  }
}
