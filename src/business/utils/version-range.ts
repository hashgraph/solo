// SPDX-License-Identifier: Apache-2.0

import {type SemVer} from 'semver';
import {Version} from './version.js';

/**
 * A range of versions which includes the beginning version and excludes the end version.
 */
export class VersionRange<T extends SemVer | number> {
  public constructor(
    /**
     * The beginning of the version range (inclusive).
     */
    public readonly begin: Version<T>,
    /**
     * The end of the version range (exclusive).
     */
    public readonly end: Version<T>,
  ) {
    if (this.begin !== null && this.end !== null && this.begin.compare(this.end) >= 0) {
      throw new RangeError('Invalid version range');
    }
  }

  /**
   * Creates a version range from the given integer bounds.
   *
   * @param begin - the beginning of the version range (inclusive).
   * @param end - the end of the version range (exclusive).
   * @returns the version range.
   * @throws RangeError if the bounds are invalid.
   */
  public static fromIntegerBounds(begin: number, end: number): VersionRange<number> {
    return new VersionRange(new Version(begin), new Version(end));
  }

  /**
   * Creates a version range from the given integer version.
   *
   * @param version - the specific version for which to create a range.
   * @returns the version range.
   * @throws RangeError if the version is invalid.
   */
  public static fromIntegerVersion(version: number): VersionRange<number> {
    return new VersionRange(new Version(version), new Version(version + 1));
  }

  /**
   * Creates a version range from the given semantic version bounds.
   *
   * @param begin - the beginning of the version range (inclusive).
   * @param end - the end of the version range (exclusive).
   * @returns the version range.
   * @throws RangeError if the bounds are invalid.
   */
  public static fromSemVerBounds(begin: SemVer, end: SemVer): VersionRange<SemVer> {
    return new VersionRange(new Version(begin), new Version(end));
  }

  /**
   * Creates a version range which includes all patch releases for the given major and minor version.
   *
   * @param version - the semantic version.
   * @returns the version range.
   */
  public static patchVersionBounds(version: SemVer): VersionRange<SemVer> {
    return new VersionRange(new Version(version), new Version(version.inc('minor')));
  }

  /**
   * Creates a version range which includes all minor and patch releases for the given major version.
   *
   * @param version - the semantic version.
   * @returns the version range.
   */
  public static minorVersionBounds(version: SemVer): VersionRange<SemVer> {
    return new VersionRange(new Version(version), new Version(version.inc('major')));
  }

  public equals(other: VersionRange<T>): boolean {
    return this.begin !== null && this.end !== null && this.begin.equals(other.begin) && this.end.equals(other.end);
  }

  public compare(other: VersionRange<T>): number {
    if (this.begin === null || this.end === null) {
      throw new RangeError('Invalid version range');
    }

    const beginComparison = this.begin.compare(other.begin);
    if (beginComparison !== 0) {
      return beginComparison;
    }
    return this.end.compare(other.end);
  }

  public contains(version: Version<T>): boolean {
    if (this.begin === null || this.end === null) {
      throw new RangeError('Invalid version range');
    }

    return this.begin.compare(version) <= 0 && this.end.compare(version) > 0;
  }

  public toString(): string {
    return `[${this.begin}, ${this.end})`;
  }
}
