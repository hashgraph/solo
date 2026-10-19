// SPDX-License-Identifier: Apache-2.0

/**
 * Which Node.js handler reported an error that escaped every other handler.
 *
 * Named rather than `string` because the value is rendered verbatim into the user-visible message
 * (`Unhandled ${kind}`) and into the error metadata, so a typo would otherwise ship as rendered text.
 */
export type FatalErrorKind = 'uncaughtException' | 'unhandledRejection';
