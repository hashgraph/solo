// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';

export class StringEx {
  public static readonly EMPTY: string = '';
  public static readonly DASH: string = '-';
  public static readonly UNDERSCORE: string = '_';
  public static readonly PERIOD: string = '.';

  private constructor() {
    throw new SoloErrors.internal.unsupportedOperation('This class cannot be instantiated');
  }

  public static isUppercase(value: string): boolean {
    return value === value.toUpperCase();
  }

  public static isEmpty(value: string): boolean {
    return !value || value.trim().length === 0;
  }

  public static isUnderscored(value: string): boolean {
    return value.includes(StringEx.UNDERSCORE);
  }

  public static isDashed(value: string): boolean {
    return value.includes(StringEx.DASH);
  }

  public static nounCase(value: string): string {
    if (StringEx.isEmpty(value)) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  public static verbCase(value: string): string {
    if (StringEx.isEmpty(value)) {
      return value;
    }

    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  public static kebabToCamelCase(value: string): string {
    if (StringEx.isEmpty(value) || !StringEx.isDashed(value)) {
      return StringEx.verbCase(value);
    }

    const parts: string[] = value.split(StringEx.DASH);
    for (let index: number = 0; index < parts.length; index++) {
      const part: string = parts[index];
      parts[index] = index === 0 ? StringEx.verbCase(part) : StringEx.nounCase(part);
    }

    return parts.join(StringEx.EMPTY);
  }

  public static snakeToCamelCase(value: string): string {
    return StringEx.snakeKebabToXJoinedCase(value, StringEx.EMPTY, StringEx.verbCase, StringEx.nounCase);
  }

  public static snakeToDotCase(value: string): string {
    return StringEx.snakeKebabToXJoinedCase(value, StringEx.PERIOD, StringEx.verbCase, StringEx.verbCase);
  }

  private static snakeKebabToXJoinedCase(
    value: string,
    separator: string,
    firstWordCase: (x: string) => string,
    subsequentWordCase: (x: string) => string,
  ): string {
    if (StringEx.isEmpty(value) || !StringEx.isUnderscored(value)) {
      return firstWordCase(value);
    }

    const parts: string[] = value.split(StringEx.UNDERSCORE);
    for (let index: number = 0; index < parts.length; index++) {
      const part: string = parts[index];
      parts[index] = StringEx.kebabToCamelCase(part.toLowerCase());
      parts[index] = index === 0 ? firstWordCase(parts[index]) : subsequentWordCase(parts[index]);
    }

    return parts.join(separator);
  }

  /** Splits camelCase word boundaries with an underscore, e.g. `helmChart` -> `helm_chart`. */
  public static camelCaseToSnake(key: string): string {
    if (StringEx.isEmpty(key)) {
      return key;
    }

    return key.replaceAll(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }
}
