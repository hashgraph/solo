// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from './key-formatter.js';
import {IllegalArgumentError} from '../../business/errors/illegal-argument-error.js';

export class ConfigKeyFormatter implements KeyFormatter {
  private static _instance: ConfigKeyFormatter;

  public readonly separator: string = '.';

  private constructor() {}

  public normalize(key: string): string {
    if (!key || key.trim().length === 0) {
      return key;
    }

    return key.trim().toLowerCase().replaceAll('_', this.separator);
  }

  public split(key: string): string[] {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    return key.split(this.separator);
  }

  public join(...parts: string[]): string {
    if (!parts || parts.length === 0) {
      return null;
    }

    return parts.join(this.separator);
  }

  public static instance(): KeyFormatter {
    if (!ConfigKeyFormatter._instance) {
      ConfigKeyFormatter._instance = new ConfigKeyFormatter();
    }

    return ConfigKeyFormatter._instance;
  }
}
