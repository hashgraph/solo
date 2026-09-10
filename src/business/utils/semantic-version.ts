// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {IllegalArgumentError} from '../../core/errors/classes/validation/illegal-argument-error.js';
import {Numbers} from './numbers.js';

/**
 * A class representing a semantic version, which can be initialized with either a string or a number.
 * The class provides methods for comparing semantic versions, as well as validating and formatting them.
 * It supports both standard semantic versioning (e.g., "1.0.0", "2.1.3-alpha+001") and a simplified numeric versioning (e.g., 1, 2).
 * The class also includes a static method for validating and formatting semantic version strings with optional 'v' prefix handling.
 *
 * @template T - The type of the original value used to create the semantic version, either string or number
 */
export class SemanticVersion<T extends string | number> {
  /**
   * Constant value representing a zero version number.
   */
  public static readonly ZERO: SemanticVersion<string> = new SemanticVersion<string>('0');

  /**
   * Normalizes version-like argv/config values to a valid semantic version.
   *
   * Behavior:
   * - accepts scalar strings and array-shaped yargs values
   * - splits comma-joined values and uses the last non-empty token
   * - returns `0.0.0` when input is empty/undefined/null
   *
   * This is intentionally strict once a token is selected: invalid semantic-version
   * tokens still throw via the SemanticVersion constructor.
   */
  public static normalize(input?: null | string | Array<unknown>): SemanticVersion<string | number> {
    return SemanticVersion.normalizeOptional(input) ?? new SemanticVersion<string | number>('0');
  }

  /**
   * Same normalization logic as `normalize`, but returns `undefined` when no token is found.
   * Useful for precedence-based resolution where "unset" must remain distinct from "0.0.0".
   */
  public static normalizeOptional(input?: unknown): SemanticVersion<string | number> | undefined {
    const normalizedToken: string | undefined = this.normalizeToken(input);
    if (!normalizedToken) {
      return undefined;
    }
    return new SemanticVersion<string | number>(normalizedToken);
  }

  /**
   * Normalizes raw argv/config values into a single version token while preserving token formatting.
   *
   * Examples:
   * - "v0.73.0,v0.73.0" -> "v0.73.0"
   * - ["", "v0.72.0", "v0.73.0"] -> "v0.73.0"
   */
  public static normalizeToken(input?: unknown): string | undefined {
    return this.extractNormalizedVersionToken(input);
  }

  /**
   * The major version number, which is incremented for incompatible API changes.
   * Initialized to 0 by default.
   *
   * @readonly
   */
  public readonly major: number = 0;

  /**
   * The minor version number, which is incremented for added functionality in a backwards-compatible manner.
   * Initialized to 0 by default.
   *
   * @readonly
   */
  public readonly minor: number = 0;

  /**
   * The patch version number, which is incremented for backwards-compatible bug fixes.
   * Initialized to 0 by default.
   *
   * @readonly
   */
  public readonly patch: number = 0;

  /**
   * The pre-release version, which is denoted by a hyphen and can contain alphanumeric identifiers separated by dots.
   * It indicates that the version is unstable and may not satisfy the intended compatibility requirements as denoted by
   *  its associated normal version.
   * Initialized to null by default.
   *
   * @readonly
   */
  public readonly preRelease: string | null = undefined;

  /**
   * The build metadata, which is denoted by a plus sign and can contain alphanumeric identifiers separated by dots.
   * It is ignored when determining version precedence but can be used to provide additional build information.
   * Initialized to null by default.
   *
   * @readonly
   */
  public readonly buildMetadata: string | null = undefined;

  /**
   * The type of the original value used to create the semantic version, either 'string' or 'number'.
   * This is used to determine how to format the version when converting it back to a string.
   *
   * @readonly
   */
  public readonly tType: 'string' | 'number' = 'string';

  /**
   * Creates a new SemanticVersion instance from a string or number. The constructor validates the input and parses it
   *  into its components (major, minor, patch, pre-release, build metadata) based on the type of the original value.
   * @param originalValue - The original value used to create the semantic version, which can be a string
   *  (e.g., "1.0.0", "2.1.3-alpha+001") or a number (e.g., 1, 2)
   * @throws IllegalArgumentError if the original value is not a valid semantic version string or a non-negative integer
   */
  public constructor(private readonly originalValue: T | SemanticVersion<T>) {
    if (!SemanticVersion.isSemanticVersion(this.originalValue)) {
      throw new IllegalArgumentError(`Invalid semantic version: ${this.originalValue}`, this.originalValue);
    }

    if (this.originalValue instanceof SemanticVersion) {
      this.major = this.originalValue.major;
      this.minor = this.originalValue.minor;
      this.patch = this.originalValue.patch;
      this.preRelease = this.originalValue.preRelease;
      this.buildMetadata = this.originalValue.buildMetadata;
      this.tType = this.originalValue.tType;
    } else if (
      Numbers.isNumeric(`${this.originalValue}`) &&
      Number.isSafeInteger(this.originalValue) &&
      (this.originalValue as number) >= 0
    ) {
      this.major = this.originalValue as number;
      this.tType = 'number';
    } else if (SemanticVersion.isSemanticVersion(this.originalValue) && typeof this.originalValue === 'string') {
      this.tType = 'string';
      // @ts-expect-error - This is safe because the constructor will throw if the type is not correct
      this.originalValue = (originalValue as string).trim();
      const versionParts: string[] = this.originalValue.split('.');
      this.major = Number.parseInt(versionParts[0].replace(/^v/, ''), 10);
      if (versionParts.length > 1) {
        this.minor = Number.parseInt(versionParts[1], 10);
        if (versionParts.length > 2) {
          this.patch = Number.parseInt(versionParts[2].split('-', 1)[0].split('+', 1)[0], 10);
        }
      }

      const preReleaseMatch: RegExpMatchArray = this.originalValue.match(/-(.+?)(?:\+|$)/);
      if (preReleaseMatch) {
        this.preRelease = preReleaseMatch[1];
      }

      const buildMetadataMatch: RegExpMatchArray = this.originalValue.match(/\+(.+)$/);
      if (buildMetadataMatch) {
        this.buildMetadata = buildMetadataMatch[1];
      }
    }
  }

  /**
   * Checks if this semantic version is equal to another semantic version or a valid string/number representation of a semantic version.
   * @param other - The other semantic version or a valid string/number to compare against
   * @returns true if they are equal, false otherwise
   */
  public equals(other: SemanticVersion<T> | T): boolean {
    // other must be a valid semantic version (either an instance of SemanticVersion or a valid string/number)
    if (!SemanticVersion.isSemanticVersion(other)) {
      return false;
    }

    // if both are the same instance, they are equal
    if (this === other) {
      return true;
    }

    const otherValue: SemanticVersion<T> = new SemanticVersion<T>(other);
    return (
      this.tType === otherValue.tType &&
      this.major === otherValue.major &&
      this.minor === otherValue.minor &&
      this.patch === otherValue.patch &&
      this.preRelease === otherValue.preRelease &&
      (this.buildMetadata === otherValue.buildMetadata || !this.buildMetadata || !otherValue.buildMetadata)
    );
  }

  /**
   * Compares this semantic version to another semantic version or a valid string/number representation of a semantic version.
   * @returns 0 if they are equal, 1 if this version is greater, -1 if this version is less, or NaN if the other value is not a valid semantic version
   * @param other - The other semantic version or a valid string/number to compare against
   * @throws IllegalArgumentError if the other value is not a valid semantic version
   * @remarks The comparison is based on the precedence rules defined in the Semantic Versioning specification, which
   *  considers major, minor, patch, pre-release, and build metadata components. Pre-release versions are considered
   *  less than their associated normal versions, and build metadata does not affect precedence.
   */
  public compare(other: SemanticVersion<T> | T): number {
    // throw an error if the other value is not a valid semantic version
    if (!SemanticVersion.isSemanticVersion(other)) {
      throw new IllegalArgumentError(`Cannot compare with non-semantic version: ${other}`, other);
    }

    if (this.equals(other)) {
      return 0;
    }

    if (this.greaterThan(other)) {
      return 1;
    }

    if (this.lessThan(other)) {
      return -1;
    }

    return Number.NaN; // This should never happen if the above conditions are exhaustive
  }

  /**
   * Determines if this semantic version is greater than another semantic version or a valid string/number representation of a semantic version.
   * @returns true if this version is greater, false otherwise
   * @param other - The other semantic version or a valid string/number to compare against
   * @remarks The comparison is based on the precedence rules defined in the Semantic Versioning specification, which
   *  considers major, minor, patch, pre-release, and build metadata components. Pre-release versions are considered
   *  less than their associated normal versions, and build metadata does not affect precedence.
   */
  public greaterThan(other: SemanticVersion<T> | T): boolean {
    const otherValue: SemanticVersion<T> = new SemanticVersion<T>(other);

    if (this.major > otherValue.major) {
      return true;
    }
    if (this.major < otherValue.major) {
      return false;
    }

    if (this.minor > otherValue.minor) {
      return true;
    }
    if (this.minor < otherValue.minor) {
      return false;
    }

    if (this.patch > otherValue.patch) {
      return true;
    }
    if (this.patch < otherValue.patch) {
      return false;
    }

    // Handle pre-release comparison
    if (this.preRelease && !otherValue.preRelease) {
      return false;
    } // Pre-release is less than no pre-release
    if (!this.preRelease && otherValue.preRelease) {
      return true;
    } // No pre-release is greater than pre-release
    if (this.preRelease && otherValue.preRelease) {
      const thisPreReleaseParts: string[] = this.preRelease.split('.');
      const otherPreReleaseParts: string[] = otherValue.preRelease.split('.');

      for (let index: number = 0; index < Math.max(thisPreReleaseParts.length, otherPreReleaseParts.length); index++) {
        const thisPart: string = thisPreReleaseParts[index];
        const otherPart: string = otherPreReleaseParts[index];

        if (thisPart === undefined) {
          return false;
        } // shorter pre-release is less
        if (otherPart === undefined) {
          return true;
        } // shorter pre-release is less

        const thisPartIsNumeric: boolean = Numbers.isNumeric(thisPart);
        const otherPartIsNumeric: boolean = Numbers.isNumeric(otherPart);

        if (thisPartIsNumeric && otherPartIsNumeric) {
          const thisNumber: number = Number.parseInt(thisPart, 10);
          const otherNumber: number = Number.parseInt(otherPart, 10);
          if (thisNumber > otherNumber) {
            return true;
          }
          if (thisNumber < otherNumber) {
            return false;
          }
        } else if (thisPartIsNumeric) {
          return false; // Numeric identifiers have lower precedence than non-numeric (semver §11.4.4)
        } else if (otherPartIsNumeric) {
          return true; // Numeric identifiers have lower precedence than non-numeric (semver §11.4.4)
        } else {
          if (thisPart > otherPart) {
            return true;
          }
          if (thisPart < otherPart) {
            return false;
          }
        }
      }
    }

    // Build metadata does not affect precedence
    return false;
  }

  /**
   * Determines if this semantic version is less than another semantic version or a valid string/number representation of a semantic version.
   * @returns true if this version is less, false otherwise
   * @param other - The other semantic version or a valid string/number to compare against
   * @remarks The comparison is based on the precedence rules defined in the Semantic Versioning specification, which
   *  considers major, minor, patch, pre-release, and build metadata components. Pre-release versions are considered
   *  less than their associated normal versions, and build metadata does not affect precedence.
   */
  public lessThan(other: SemanticVersion<T> | T): boolean {
    return !this.equals(other) && !this.greaterThan(other);
  }

  /**
   * Determines if this semantic version is greater than or equal to another semantic version or a valid string/number representation of a semantic version.
   * @returns true if this version is greater than or equal, false otherwise
   * @param other - The other semantic version or a valid string/number to compare against
   * @remarks The comparison is based on the precedence rules defined in the Semantic Versioning specification, which
   *  considers major, minor, patch, pre-release, and build metadata components. Pre-release versions are considered
   *  less than their associated normal versions, and build metadata does not affect precedence.
   */
  public greaterThanOrEqual(other: SemanticVersion<T> | T): boolean {
    return this.equals(other) || this.greaterThan(other);
  }

  /**
   * Determines if this semantic version is less than or equal to another semantic version or a valid string/number
   *  representation of a semantic version.
   * @returns true if this version is less than or equal, false otherwise
   * @param other - The other semantic version or a valid string/number to compare against
   * @remarks The comparison is based on the precedence rules defined in the Semantic Versioning specification, which
   *  considers major, minor, patch, pre-release, and build metadata components. Pre-release versions are considered
   *  less than their associated normal versions, and build metadata does not affect precedence.
   */
  public lessThanOrEqual(other: SemanticVersion<T> | T): boolean {
    return this.equals(other) || this.lessThan(other);
  }

  /**
   * Converts this semantic version to a string representation. If the original type was a number, it returns just the
   *  major version as a string.
   * If the original type was a string, it returns the full semantic version string, including pre-release and build
   *  metadata if present.
   * @returns The string representation of this semantic version
   */
  public toString(): string {
    if (this.tType === 'number') {
      return `${this.major}`;
    }
    return `${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}${this.buildMetadata ? `+${this.buildMetadata}` : ''}`;
  }

  /**
   * Converts this semantic version to a string representation with a 'v' prefix. If the original type was a number, it
   *  returns just the major version with a 'v' prefix.
   * If the original type was a string, it returns the full semantic version string with a 'v' prefix, including
   *  pre-release and build metadata if present.
   * @returns The string representation of this semantic version with a 'v' prefix
   */
  public toPrefixedString(): string {
    return `v${this.toString()}`;
  }

  /**
   * Validates if a value is a valid semantic version, which can be an instance of SemanticVersion, a numeric value, or a
   *  string that matches the semantic version pattern.
   * The validation allows for an optional 'v' prefix in string representations and ensures that numeric values are
   *  non-negative safe integers.
   * @returns true if the value is a valid semantic version, false otherwise
   * @param value - The value to validate, which can be an instance of SemanticVersion, a numeric value, or a string
   * @private
   */
  private static isSemanticVersion<R extends string | number | SemanticVersion<string | number>>(value: R): boolean {
    // if it's an instance of SemanticVersion it must be valid
    if (value instanceof SemanticVersion) {
      return true;
    }

    if (typeof value === 'string') {
      value = value.trim().replace(/^v/, '') as R; // Remove 'v' prefix if present for validation
    }

    // if it's numeric, a safe integer, and non-negative, it's valid
    if (Numbers.isNumeric(`${value}`) && Number.isSafeInteger(value) && (value as number) >= 0) {
      return true;
    }

    // if it's a string and matches a semantic version regex pattern,
    //  it's valid,
    //  allows for an optional 'v' prefix,
    //  '0',
    //  '0.1',
    //  '0.0.1',
    //  as well as acceptable pre-release and build metadata formats
    if (typeof value === 'string') {
      return /^v?(0|[1-9]\d*)(\.(0|[1-9]\d*)(\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?)?)?$/.test(
        value.trim(),
      );
    }

    return false;
  }

  /**
   * Validates if a string is a valid semantic version and handles the 'v' prefix
   *
   * @param versionString - The version string to validate
   * @param isNeedPrefix - If true, adds 'v' prefix if missing; if false, removes 'v' prefix if present
   * @param label - Label to use in error messages (e.g., 'Release tag', 'SemanticVersion')
   * @param minimumVersion - Optional minimum version; throws if versionString is below it
   * @returns The processed version string with proper prefix handling
   * @throws SoloError or IllegalArgumentError if the version string is invalid or below minimum
   */
  public static getValidSemanticVersion(
    versionString: string,
    isNeedPrefix: boolean = false,
    label: string = 'SemanticVersion',
    minimumVersion?: string,
  ): string {
    if (!versionString) {
      throw new SoloErrors.validation.illegalArgument(`${label} cannot be empty`);
    }

    // Validate the version string
    if (!SemanticVersion.isSemanticVersion<string>(versionString)) {
      throw new IllegalArgumentError(`Invalid ${label.toLowerCase()}: ${versionString}`, versionString);
    }

    const value: SemanticVersion<string> = new SemanticVersion<string>(versionString);

    if (minimumVersion !== undefined) {
      const minimum: SemanticVersion<string> = new SemanticVersion<string>(minimumVersion);
      if (value.lessThan(minimum)) {
        throw new IllegalArgumentError(
          `${label} ${versionString} is below the minimum supported version ${minimumVersion}`,
          versionString,
        );
      }
    }

    return isNeedPrefix ? value.toPrefixedString() : value.toString();
  }

  /**
   * Returns a new SemanticVersion instance with the minor version incremented by 1 and major versions unchanged.
   * The patch version is reset to 0, and pre-release and build metadata are cleared.
   * The returned instance is always of type SemanticVersion<string> to ensure that the version is represented in a
   *  standard semantic version format.
   * @returns A new SemanticVersion instance with the minor version incremented by 1
   * @remarks This method is useful for automatically generating the next minor version based on the current version,
   *  following semantic versioning rules.
   *  For example, if the current version is "1.2.3", calling bumpMinor() will return a new SemanticVersion instance
   *  representing "1.3.0".
   *  If the current version is "1.2.3-alpha+001", calling bumpMinor() will return a new SemanticVersion instance
   *  representing "1.3.0" (pre-release and build metadata are cleared).
   */
  public bumpMinor(): SemanticVersion<string> {
    return new SemanticVersion<string>(`${this.major}.${this.minor + 1}.${0}`);
  }

  /**
   * Returns a new SemanticVersion instance with the major version incremented by 1 and minor and patch versions reset to 0.
   * Pre-release and build metadata are cleared.
   * The returned instance is of the same type as the original (string or number) to maintain consistency in version representation.
   * @returns A new SemanticVersion instance with the major version incremented by 1
   * @remarks This method is useful for automatically generating the next major version based on the current version,
   *  following semantic versioning rules.
   *  For example, if the current version is "1.2.3", calling bumpMajor() will return a new SemanticVersion instance
   *  representing "2.0.0".
   */
  public bumpMajor(): SemanticVersion<T> {
    return this.tType === 'number'
      ? // @ts-expect-error - This is safe because the constructor will throw if the type is not correct
        new SemanticVersion<number>(this.major + 1)
      : // @ts-expect-error - This is safe because the constructor will throw if the type is not correct
        new SemanticVersion<string>(`${this.major + 1}.0.0`);
  }

  private static extractNormalizedVersionToken(input: unknown): string | undefined {
    if (input === undefined || input === null) {
      return undefined;
    }

    if (Array.isArray(input)) {
      for (let index: number = input.length - 1; index >= 0; index -= 1) {
        const normalized: string | undefined = this.extractNormalizedVersionToken(input[index]);
        if (normalized) {
          return normalized;
        }
      }
      return undefined;
    }

    const rawValue: string = typeof input === 'string' ? input : `${input}`;
    const segments: string[] = rawValue
      .split(',')
      .map((segment: string): string => segment.trim())
      .filter((segment: string): boolean => segment.length > 0);

    return segments.at(-1);
  }
}
