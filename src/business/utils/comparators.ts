// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../../data/configuration/spi/config-source.js';

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

  public static readonly configSource = (l: ConfigSource, r: ConfigSource): number => {
    return Comparators.number(l.ordinal, r.ordinal);
  };
}
