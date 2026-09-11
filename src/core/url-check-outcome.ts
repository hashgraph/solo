// SPDX-License-Identifier: Apache-2.0

/** The result of the HEAD pre-check a download performs before fetching a URL. */
export enum UrlCheckOutcome {
  /** The server definitively reported the URL as available. */
  EXISTS = 'exists',

  /** The server definitively reported the URL as absent. */
  MISSING = 'missing',

  /** No definitive answer: a network failure, a timeout, or a non-definitive status such as a 5xx. */
  INCONCLUSIVE = 'inconclusive',
}
