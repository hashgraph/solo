// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../../business/errors/unsupported-operation-error.js';
import {Regex} from '../../business/utils/regex.js';
import {type KeyFormatter} from './key-formatter.js';
import {ConfigKeyFormatter} from './config-key-formatter.js';

export class Prefix {
  public static readonly DEFAULT_PREFIX: string = 'SOLO';

  private constructor() {
    // Utility class
    throw new UnsupportedOperationError('Cannot instantiate utility class');
  }

  public static add(key: string, prefix?: string, formatter: KeyFormatter = ConfigKeyFormatter.instance()): string {
    const normalizedKey: string = formatter.normalize(key);
    let finalPrefix: string = prefix ? formatter.normalize(prefix) : null;
    finalPrefix =
      finalPrefix && !finalPrefix.endsWith(formatter.separator) ? `${finalPrefix}${formatter.separator}` : finalPrefix;
    return finalPrefix && !normalizedKey.startsWith(finalPrefix) ? `${finalPrefix}${normalizedKey}` : normalizedKey;
  }

  public static strip(key: string, prefix?: string, formatter: KeyFormatter = ConfigKeyFormatter.instance()): string {
    const normalizedKey: string = formatter.normalize(key);
    let finalPrefix: string = prefix ? formatter.normalize(prefix) : null;
    finalPrefix = finalPrefix?.endsWith(formatter.separator) ? finalPrefix : `${finalPrefix}${formatter.separator}`;
    return finalPrefix && normalizedKey.startsWith(finalPrefix)
      ? normalizedKey.replace(new RegExp(`^${Regex.escape(finalPrefix)}`), '')
      : normalizedKey;
  }

  public static matcher(
    key: string,
    prefix?: string,
    formatter: KeyFormatter = ConfigKeyFormatter.instance(),
  ): boolean {
    if (!key) {
      return false;
    }

    let prefixFilter = prefix ? formatter.normalize(prefix) : null;

    if (prefixFilter && !prefixFilter.endsWith(formatter.separator)) {
      prefixFilter = prefixFilter.concat(formatter.separator);
    }

    return prefixFilter ? formatter.normalize(key)?.startsWith(prefixFilter) : true;
  }
}
