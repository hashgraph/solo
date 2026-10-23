// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type KeyFormatter} from './key-formatter.js';
import {StringEx} from '../../business/utils/string-ex.js';

export class EnvironmentKeyFormatter implements KeyFormatter {
  private static _instance: EnvironmentKeyFormatter;

  public readonly separator: string = StringEx.UNDERSCORE;

  private constructor() {}

  public normalize(key: string): string {
    if (StringEx.isEmpty(key)) {
      return key;
    }

    return StringEx.camelCaseToSnake(key).trim().toUpperCase().replaceAll(StringEx.PERIOD, this.separator);
  }

  public split(key: string): string[] {
    if (!key || key.trim().length === 0) {
      throw new SoloErrors.validation.illegalArgument('key must not be null or undefined');
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
