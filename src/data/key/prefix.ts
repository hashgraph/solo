// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type KeyFormatter} from './key-formatter.js';
import {ConfigKeyFormatter} from './config-key-formatter.js';

export class Prefix {
  private constructor() {
    // Utility class
    throw new SoloErrors.internal.unsupportedOperation('Cannot instantiate utility class');
  }

  /**
   * Prefixes a config key with the formatter's separator, e.g. `helmChart.directory` -> `SOLO_HELM_CHART_DIRECTORY`.
   * A key already carrying the prefix is returned unchanged.
   */
  public static add(key: string, prefix?: string, formatter: KeyFormatter = ConfigKeyFormatter.instance()): string {
    const normalizedKey: string = formatter.normalize(key);
    let finalPrefix: string = prefix ? formatter.normalize(prefix) : null;
    finalPrefix =
      finalPrefix && !finalPrefix.endsWith(formatter.separator) ? `${finalPrefix}${formatter.separator}` : finalPrefix;
    return finalPrefix && !normalizedKey.startsWith(finalPrefix) ? `${finalPrefix}${normalizedKey}` : normalizedKey;
  }
}
