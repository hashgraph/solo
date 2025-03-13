// SPDX-License-Identifier: Apache-2.0

import {InvalidSemanticVersionException} from './InvalidSemanticVersionException.js';

/**
 * A standard representation of a semantic version number.
 */
export class SemanticVersion {
  /**
   * Constant value representing a zero version number.
   */
  public static readonly ZERO = new SemanticVersion(0, 0, 0, '', '');

  /**
   * A precompiled regular expression used to parse a semantic version string and extract the individual components.
   */
  private static readonly SEMVER_PATTERN = new RegExp(
    '^' +
      '((\\d+)\\.(\\d+)\\.(\\d+))' + // version string
      '(?:-([\\dA-Za-z]+(?:\\.[\\dA-Za-z]+)*))?' + // prerelease suffix (optional)
      '(?:\\+([\\dA-Za-z\\-]+(?:\\.[\\dA-Za-z\\-]+)*))?' + // build suffix (optional)
      '$',
  );

  /**
   * Constructs a new instance of a {@link SemanticVersion} with the supplied components.
   *
   * @param major      the major version.
   * @param minor      the minor version.
   * @param patch      the patch version.
   * @param prerelease the optional prerelease specifier.
   * @param build      the optional build specifier.
   */
  constructor(
    private readonly _major: number,
    private readonly _minor: number,
    private readonly _patch: number,
    private readonly _prerelease: string = '',
    private readonly _build: string = '',
  ) {
    this._prerelease = SemanticVersion.nullToBlank(_prerelease);
    this._build = SemanticVersion.nullToBlank(_build);
  }

  public get major(): number {
    return this._major;
  }

  public get minor(): number {
    return this._minor;
  }

  public get patch(): number {
    return this._patch;
  }

  public get prerelease(): string {
    return this._prerelease;
  }

  public get build(): string {
    return this._build;
  }

  /**
   * Parses a semantic version string into the individual components.
   *
   * @param version a semantic version number in string form.
   * @returns an instance of a {@link SemanticVersion} containing the individual components.
   * @throws InvalidSemanticVersionException if the supplied string cannot be parsed as a semantic version number.
   * @throws Error if the {@code version} argument is a {@code null} reference.
   */
  public static parse(version: string): SemanticVersion {
    if (!version) {
      throw new Error('version cannot be null');
    }

    const matcher = version.trim().match(SemanticVersion.SEMVER_PATTERN);

    if (!matcher) {
      throw new InvalidSemanticVersionException(`The supplied version '${version}' is not a valid semantic version`);
    }

    try {
      const major = parseInt(matcher[2], 10);
      const minor = parseInt(matcher[3], 10);
      const patch = parseInt(matcher[4], 10);
      const prerelease = SemanticVersion.nullToBlank(matcher[5]);
      const build = SemanticVersion.nullToBlank(matcher[6]);

      return new SemanticVersion(major, minor, patch, prerelease, build);
    } catch (e) {
      throw new InvalidSemanticVersionException(
        `The supplied version '${version}' is not a valid semantic version`,
        e as Error,
      );
    }
  }

  /**
   * Returns a new instance of a {@link SemanticVersion} with the build information cleared.
   *
   * @returns a new instance of a {@link SemanticVersion}.
   */
  public withClearedBuild(): SemanticVersion {
    return new SemanticVersion(this._major, this._minor, this._patch, this._prerelease, '');
  }

  /**
   * Returns a new instance of a {@link SemanticVersion} with prerelease information cleared.
   *
   * @returns a new instance of a {@link SemanticVersion}.
   */
  public withClearedPrerelease(): SemanticVersion {
    return new SemanticVersion(this._major, this._minor, this._patch, '', this._build);
  }

  /**
   * Compares this version with another version.
   *
   * @param other the other version to compare with
   * @returns a negative number if this version is less than the other,
   *          zero if they are equal, or a positive number if this version is greater
   */
  public compareTo(other: SemanticVersion | null): number {
    if (!other) {
      return 1;
    }

    let result = this._major - other._major;
    if (result !== 0) {
      return result;
    }

    result = this._minor - other._minor;
    if (result !== 0) {
      return result;
    }

    result = this._patch - other._patch;
    if (result !== 0) {
      return result;
    }

    result = this.compareStrings(this._prerelease, other._prerelease);
    if (result !== 0) {
      return result;
    }

    return this.compareStrings(this._build, other._build);
  }

  /**
   * Checks if this version equals another object.
   *
   * @param obj the object to compare with
   * @returns true if the objects are equal, false otherwise
   */
  public equals(obj: unknown): boolean {
    if (this === obj) return true;
    if (!(obj instanceof SemanticVersion)) return false;
    return (
      this._major === obj._major &&
      this._minor === obj._minor &&
      this._patch === obj._patch &&
      this._prerelease === obj._prerelease &&
      this._build === obj._build
    );
  }

  /**
   * Returns a string representation of this version.
   *
   * @returns the version string
   */
  public toString(): string {
    const parts = [`${this._major}.${this._minor}.${this._patch}`];

    if (this._prerelease && this._prerelease.trim()) {
      parts.push('-', this._prerelease);
    }

    if (this._build && this._build.trim()) {
      parts.push('+', this._build);
    }

    return parts.join('');
  }

  /**
   * Helper method to convert null to blank string.
   *
   * @param str the string to check
   * @returns the string or blank if null/undefined
   */
  private static nullToBlank(str: string | null | undefined): string {
    return str ?? '';
  }

  /**
   * Helper method to compare strings.
   *
   * @param a first string
   * @param b second string
   * @returns comparison result
   */
  private compareStrings(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
}
