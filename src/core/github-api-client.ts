// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import {SoloErrors} from './errors/solo-errors.js';
import {Duration} from './time/duration.js';

export class GitHubApiClient {
  private static readonly RETRY_MAX_ATTEMPTS: number = 3;
  private static readonly RETRY_BASE_DELAY: Duration = Duration.ofSeconds(1);
  private static readonly RETRY_MAX_DELAY: Duration = Duration.ofMinutes(1);

  private constructor() {}

  /**
   * Builds standard GitHub API request headers, adding an Authorization header
   * when GITHUB_TOKEN or GH_TOKEN is present in the environment.  The token raises the
   * unauthenticated rate-limit from 60 req/hour to 5 000 req/hour and
   * eliminates the shared-IP rate-limit problem on GitHub-hosted runners.
   */
  private static buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': constants.SOLO_USER_AGENT_HEADER,
      Accept: 'application/vnd.github.v3+json',
    };
    const token: string | undefined = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Derives a retry delay in milliseconds from GitHub's rate-limit response headers.
   * Priority: Retry-After > X-RateLimit-Reset when exhausted > exponential backoff.
   */
  private static computeRetryDelay(response: Response, attempt: number): number {
    const maxDelayMs: number = GitHubApiClient.RETRY_MAX_DELAY.toMillis();

    const retryAfterHeader: string | null = response.headers.get('Retry-After');
    if (retryAfterHeader) {
      return Math.min(Number.parseInt(retryAfterHeader, 10) * 1000, maxDelayMs);
    }

    const rateLimitReset: string | null = response.headers.get('X-RateLimit-Reset');
    const rateLimitRemaining: string | null = response.headers.get('X-RateLimit-Remaining');
    if (rateLimitReset && rateLimitRemaining === '0') {
      const resetMs: number = Number.parseInt(rateLimitReset, 10) * 1000 - Date.now();
      return Math.min(Math.max(resetMs, 0), maxDelayMs);
    }

    return Math.min(GitHubApiClient.RETRY_BASE_DELAY.toMillis() * 2 ** (attempt - 1), maxDelayMs);
  }

  /**
   * Makes an authenticated GET request to the GitHub API with automatic retry on
   * HTTP 403 (rate-limited) and HTTP 429 (too many requests) responses.
   * Up to three attempts are made with exponential backoff honouring the
   * Retry-After and X-RateLimit-Reset headers when present.
   *
   * @throws SoloError on network failure or a non-retryable HTTP error status.
   */
  public static async get(url: string): Promise<Response> {
    const headers: Record<string, string> = GitHubApiClient.buildHeaders();
    let lastStatus: number = 0;

    for (let attempt: number = 1; attempt <= GitHubApiClient.RETRY_MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {method: 'GET', headers});
      } catch (error) {
        throw new SoloErrors.system.githubApiRequestFailed(url, error);
      }

      if (response.ok) {
        return response;
      }

      lastStatus = response.status;
      const isRateLimited: boolean = response.status === 403 || response.status === 429;
      if (isRateLimited && attempt < GitHubApiClient.RETRY_MAX_ATTEMPTS) {
        const delayMs: number = GitHubApiClient.computeRetryDelay(response, attempt);
        await new Promise<void>((resolve: () => void): void => {
          setTimeout(resolve, delayMs);
        });
      } else {
        break;
      }
    }

    throw new SoloErrors.system.githubApiHttpResponseError(url, lastStatus);
  }
}
