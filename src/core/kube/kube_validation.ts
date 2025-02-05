/**
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @include DNS_1123_LABEL
 * @param value - the string to check
 * @returns true if the string is a valid DNS-1123 label
 */
export function isDns1123Label(value: string) {
  return /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(value);
}
