// SPDX-License-Identifier: Apache-2.0

export interface KeyFormatter {
  readonly separator: string;

  normalize(key: string): string;

  split(key: string): string[];
}
