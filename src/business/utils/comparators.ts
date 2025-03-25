// SPDX-License-Identifier: Apache-2.0

export class Comparators {
  private constructor() {
    // Utility class
    throw new Error('Cannot instantiate utility class');
  }

  public static readonly number = (l: number, r: number): number => {
    if (l < r) {
      return -1;
    } else if (l > r) {
      return 1;
    }

    return 0;
  };
}
