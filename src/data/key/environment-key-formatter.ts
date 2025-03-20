// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from './key-formatter.js';
import {IllegalArgumentError} from '../../business/errors/illegal-argument-error.js';

export class EnvironmentKeyFormatter implements KeyFormatter {
  private static _instance: EnvironmentKeyFormatter;

  public readonly separator: string = '_';

  private constructor() {}

  public normalize(key: string): string {
    if (!key || key.trim().length === 0) {
      return key;
    }

    return key.trim().toLowerCase().replace('.', this.separator);
  }

  public split(key: string): string[] {
    if (!key || key.trim().length === 0) {
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
    if (!EnvironmentKeyFormatter._instance) {
      EnvironmentKeyFormatter._instance = new EnvironmentKeyFormatter();
    }

    return EnvironmentKeyFormatter._instance;
  }
}
