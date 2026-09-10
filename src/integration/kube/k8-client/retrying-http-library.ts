// SPDX-License-Identifier: Apache-2.0

import {
  type HttpLibrary,
  type PromiseHttpLibrary,
  type RequestContext,
  type ResponseContext,
} from '@kubernetes/client-node';
import {StatusCodes} from 'http-status-codes';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {sleep} from '../../../core/helpers.js';
import {Duration} from '../../../core/time/duration.js';

/**
 * Retries requests throttled by the Kubernetes API server with HTTP 429 (safe, as throttled requests are
 * rejected before processing); the generated client fails on 429 immediately, ignoring `Retry-After`.
 */
export class RetryingHttpLibrary implements PromiseHttpLibrary {
  /** The maximum number of times a throttled request is resent before the throttled response is returned. */
  private static readonly MAX_RETRIES: number = 5;

  /** The upper bound applied to the delay between retries, regardless of the `Retry-After` header value. */
  private static readonly MAX_RETRY_DELAY_SECONDS: number = 15;

  public constructor(private readonly delegate: HttpLibrary) {}

  public async send(request: RequestContext): Promise<ResponseContext> {
    let response: ResponseContext = await this.delegate.send(request).toPromise();

    for (
      let attempt: number = 1;
      attempt <= RetryingHttpLibrary.MAX_RETRIES && response.httpStatusCode === StatusCodes.TOO_MANY_REQUESTS;
      attempt++
    ) {
      await RetryingHttpLibrary.discardResponseBody(response);

      const delay: Duration = RetryingHttpLibrary.resolveRetryDelay(response, attempt);
      container
        .resolve<SoloLogger>(InjectTokens.SoloLogger)
        .info(
          `Kubernetes API server throttled '${request.getHttpMethod()} ${request.getUrl()}' with HTTP ` +
            `${StatusCodes.TOO_MANY_REQUESTS}, retrying in ${delay.seconds} seconds ` +
            `(attempt ${attempt} of ${RetryingHttpLibrary.MAX_RETRIES})`,
        );
      await sleep(delay);

      response = await this.delegate.send(request).toPromise();
    }

    return response;
  }

  /** The delay before resending: the `Retry-After` header when present, exponential backoff otherwise, capped. */
  private static resolveRetryDelay(response: ResponseContext, attempt: number): Duration {
    const retryAfterHeader: string = response.headers['retry-after'] ?? '';
    const retryAfterSeconds: number = Number.parseInt(retryAfterHeader, 10);

    const delaySeconds: number =
      Number.isNaN(retryAfterSeconds) || retryAfterSeconds <= 0 ? 2 ** (attempt - 1) : retryAfterSeconds;

    return Duration.ofSeconds(Math.min(delaySeconds, RetryingHttpLibrary.MAX_RETRY_DELAY_SECONDS));
  }

  /** Consumes a discarded response body so the underlying connection is released before resending. */
  private static async discardResponseBody(response: ResponseContext): Promise<void> {
    try {
      await response.body.text();
    } catch {
      // best-effort: failing to read the discarded throttled response body must not prevent the retry
    }
  }
}
