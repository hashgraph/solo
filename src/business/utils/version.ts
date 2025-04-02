// SPDX-License-Identifier: Apache-2.0

import {SemVer} from 'semver';

export class Version<T extends SemVer | number> {
  constructor(public readonly value: T) {
    if (Version.isSemVer(value) && !value) {
      throw new RangeError('Invalid version');
    }

    if (Version.isNumeric(value)) {
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new RangeError('Invalid version');
      }
    }
  }

  public equals(other: Version<T>): boolean {
    if (Version.isSemVer(this.value) && Version.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer) === 0;
    }

    if (Version.isNumeric(this.value) && Version.isNumeric(other.value)) {
      return this.value === other.value;
    }

    return false;
  }

  public compare(other: Version<T>): number {
    if (Version.isSemVer(this.value) && Version.isSemVer(other.value)) {
      return (this.value as SemVer).compare(other.value as SemVer);
    }

    if (Version.isNumeric(this.value) && Version.isNumeric(other.value)) {
      if (this.value < other.value) {
        return -1;
      } else if (this.value > other.value) {
        return 1;
      }
      return 0;
    }

    return Number.NaN;
  }

  public toString(): string {
    return this.value.toString();
  }

  private static isSemVer<R extends SemVer | number>(v: R): boolean {
    return v instanceof SemVer;
  }

  private static isNumeric<R extends SemVer | number>(v: R): boolean {
    return Number.isSafeInteger(v) && !Number.isNaN(v);
  }
}
