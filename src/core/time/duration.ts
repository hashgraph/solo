// SPDX-License-Identifier: Apache-2.0

import {IllegalArgumentError} from '../errors/IllegalArgumentError.js';
import {MathEx} from '../util/math-ex.js';
import {Time} from './time.js';

/**
 * A time-based amount of time, such as '34.5 seconds'.
 *
 * This class models a quantity or amount of time in terms of seconds and nanoseconds. It can be accessed using other
 * duration-based units, such as minutes and hours. In addition, the DAYS unit can be used and is treated as exactly
 * equal to 24 hours, thus ignoring daylight savings effects.
 *
 * A physical duration could be of infinite length. The duration uses nanosecond resolution with a maximum value of the
 * seconds that can be held in a long. This is greater than the current estimated age of the universe.
 *
 * The range of a duration requires the storage of a number larger than a long. To achieve this, the class stores a long
 * representing seconds and an integer representing nanosecond-of-second, which will always be between 0 and 999,999,999.
 * The model is of a directed duration, meaning that the duration may be negative.
 *
 * The duration is measured in "seconds", but these are not necessarily identical to the scientific "SI second"
 * definition based on atomic clocks. This difference only impacts durations measured near a leap-second and should not
 * affect most applications.
 *
 * This is a value-based class; use of identity-sensitive operations on instances of Duration may have unpredictable
 * results and should be avoided. The equals method should be used for comparisons.
 */
export class Duration {
  /**
   * A constant for a duration of zero.
   */
  public static readonly ZERO = new Duration(0, 0);

  /**
   * A constant for a duration of forever.
   */
  public static readonly FOREVER = new Duration(Number.MAX_SAFE_INTEGER, 999-999-999);

  /**
   * Creates a new instance of Duration with the specified number of seconds and nanoseconds.
   * This is a private constructor and not intended to be called directly.
   *
   * @param seconds - the number of seconds
   * @param nanos - the number of nanoseconds
   */
  private constructor(
    public readonly seconds: number,
    public readonly nanos: number,
  ) {
    Duration.checkValidNanos(nanos);
  }

  /**
   * Checks if this duration is zero.
   *
   * @returns true if this duration is zero; false otherwise.
   */
  public isZero(): boolean {
    return (this.seconds | this.nanos) === 0;
  }

  /**
   * Checks if this duration is negative.
   *
   * @returns true if this duration is negative; false otherwise.
   */
  public isNegative(): boolean {
    return this.seconds < 0;
  }

  /**
   * Creates a new Duration instance with the specified number of seconds. The current number of nanoseconds in this
   * duration is preserved.
   *
   * @param seconds - the number of seconds for the new duration
   * @returns a new Duration instance with the specified number of seconds.
   */
  public withSeconds(seconds: number): Duration {
    return Duration.create(seconds, this.nanos);
  }

  /**
   * Creates a new Duration instance with the specified number of nanoseconds. The current number of seconds in this
   * duration is preserved.
   *
   * @param nanos - the number of nanoseconds for the new duration
   * @returns a new Duration instance with the specified number of nanoseconds.
   */
  public withNanos(nanos: number): Duration {
    Duration.checkValidNanos(nanos);
    return Duration.create(this.seconds, nanos);
  }

  /**
   * Creates a new Duration instance by adding the specified duration to this duration.
   *
   * @param other - the duration to add
   * @returns a new Duration instance with the sum of this duration and the specified duration.
   */
  public plus(other: Duration): Duration {
    return this.plusExact(other.seconds, other.nanos);
  }

  /**
   * Creates a new Duration instance by adding the specified number of days to this duration.
   *
   * @param daysToAdd - the number of days to add
   * @returns a new Duration instance with the sum of this duration and the specified number of days.
   */
  public plusDays(daysToAdd: number): Duration {
    return this.plusExact(MathEx.multiplyExact(daysToAdd, Time.SECONDS_PER_DAY), 0);
  }

  /**
   * Creates a new Duration instance by adding the specified number of hours to this duration.
   *
   * @param hoursToAdd - the number of hours to add
   * @returns a new Duration instance with the sum of this duration and the specified number of hours.
   */
  public plusHours(hoursToAdd: number): Duration {
    return this.plusExact(MathEx.multiplyExact(hoursToAdd, Time.SECONDS_PER_HOUR), 0);
  }

  /**
   * Creates a new Duration instance by adding the specified number of minutes to this duration.
   *
   * @param minutesToAdd - the number of minutes to add
   * @returns a new Duration instance with the sum of this duration and the specified number of minutes.
   */
  public plusMinutes(minutesToAdd: number): Duration {
    return this.plusExact(MathEx.multiplyExact(minutesToAdd, Time.SECONDS_PER_MINUTE), 0);
  }

  /**
   * Creates a new Duration instance by adding the specified number of seconds to this duration.
   *
   * @param secondsToAdd - the number of seconds to add
   * @returns a new Duration instance with the sum of this duration and the specified number of seconds.
   */
  public plusSeconds(secondsToAdd: number): Duration {
    return this.plusExact(secondsToAdd, 0);
  }

  /**
   * Creates a new Duration instance by adding the specified number of milliseconds to this duration.
   *
   * @param millisToAdd - the number of milliseconds to add
   * @returns a new Duration instance with the sum of this duration and the specified number of milliseconds.
   */
  public plusMillis(millisToAdd: number): Duration {
    return this.plusExact(
      Math.trunc(millisToAdd / Time.MILLIS_PER_SECOND),
      (millisToAdd % Time.MILLIS_PER_SECOND) * Time.NANOS_PER_MILLI,
    );
  }

  /**
   * Creates a new Duration instance by adding the specified number of nanoseconds to this duration.
   *
   * @param nanosToAdd - the number of nanoseconds to add
   * @returns a new Duration instance with the sum of this duration and the specified number of nanoseconds.
   */
  public plusNanos(nanosToAdd: number): Duration {
    return this.plusExact(0, nanosToAdd);
  }

  /**
   * Creates a new Duration instance by subtracting the specified duration from this duration.
   *
   * @param other - the duration to subtract
   * @returns a new Duration instance with the difference of this duration and the specified duration.
   */
  public minus(other: Duration): Duration {
    const secondsToSubtract: number = other.seconds;
    const nanosToSubtract: number = other.nanos;

    if (secondsToSubtract === Number.MIN_SAFE_INTEGER) {
      return this.plusExact(Number.MAX_SAFE_INTEGER, -nanosToSubtract).plusExact(1, 0);
    }

    return this.plusExact(-secondsToSubtract, -nanosToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of days from this duration.
   *
   * @param daysToSubtract - the number of days to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of days.
   */
  public minusDays(daysToSubtract: number): Duration {
    return daysToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusDays(Number.MAX_SAFE_INTEGER).plusDays(1)
      : this.plusDays(-daysToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of hours from this duration.
   *
   * @param hoursToSubtract - the number of hours to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of hours.
   */
  public minusHours(hoursToSubtract: number): Duration {
    return hoursToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusHours(Number.MAX_SAFE_INTEGER).plusHours(1)
      : this.plusHours(-hoursToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of minutes from this duration.
   *
   * @param minutesToSubtract - the number of minutes to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of minutes.
   */
  public minusMinutes(minutesToSubtract: number): Duration {
    return minutesToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusMinutes(Number.MAX_SAFE_INTEGER).plusMinutes(1)
      : this.plusMinutes(-minutesToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of seconds from this duration.
   *
   * @param secondsToSubtract - the number of seconds to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of seconds.
   */
  public minusSeconds(secondsToSubtract: number): Duration {
    return secondsToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusSeconds(Number.MAX_SAFE_INTEGER).plusSeconds(1)
      : this.plusSeconds(-secondsToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of milliseconds from this duration.
   *
   * @param millisToSubtract - the number of milliseconds to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of milliseconds.
   */
  public minusMillis(millisToSubtract: number): Duration {
    return millisToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusMillis(Number.MAX_SAFE_INTEGER).plusMillis(1)
      : this.plusMillis(-millisToSubtract);
  }

  /**
   * Creates a new Duration instance by subtracting the specified number of nanoseconds from this duration.
   *
   * @param nanosToSubtract - the number of nanoseconds to subtract
   * @returns a new Duration instance with the difference of this duration and the specified number of nanoseconds.
   */
  public minusNanos(nanosToSubtract: number): Duration {
    return nanosToSubtract === Number.MIN_SAFE_INTEGER
      ? this.plusNanos(Number.MAX_SAFE_INTEGER).plusNanos(1)
      : this.plusNanos(-nanosToSubtract);
  }

  /**
   * Converts this duration to days.
   *
   * @returns the number of days in this duration.
   */
  public toDays(): number {
    return this.seconds / Time.SECONDS_PER_DAY;
  }

  /**
   * Converts this duration to hours.
   *
   * @returns the number of hours in this duration.
   */
  public toHours(): number {
    return this.seconds / Time.SECONDS_PER_HOUR;
  }

  /**
   * Converts this duration to minutes.
   *
   * @returns the number of minutes in this duration.
   */
  public toMinutes(): number {
    return this.seconds / Time.SECONDS_PER_MINUTE;
  }

  /**
   * Converts this duration to milliseconds.
   *
   * @returns the number of milliseconds in this duration.
   */
  public toMillis(): number {
    const millis = MathEx.multiplyExact(this.seconds, Time.MILLIS_PER_SECOND);
    return MathEx.addExact(millis, Math.trunc(this.nanos / Time.NANOS_PER_MILLI));
  }

  /**
   * Converts this duration to nanoseconds.
   *
   * @returns the number of nanoseconds in this duration.
   */
  public toNanos(): number {
    const totalNanos = MathEx.multiplyExact(this.seconds, Time.NANOS_PER_SECOND);
    return MathEx.addExact(totalNanos, this.nanos);
  }

  /**
   * Compares this duration to the specified duration.
   *
   * @param other - the duration being compared to this duration
   * @returns true if the two durations are equal; false otherwise.
   */
  public equals(other: Duration): boolean {
    return this.seconds === other.seconds && this.nanos === other.nanos;
  }

  /**
   * Compares this duration to the specified duration.
   *
   * @param other - the duration being compared to this duration
   * @returns a negative value if this duration is less than the specified duration, a positive value if this duration
   * is greater than the specified duration, or zero if the two durations are equal.
   */
  public compareTo(other: Duration): number {
    const cmp = this.seconds - other.seconds;
    if (cmp !== 0) {
      return cmp;
    }
    return this.nanos - other.nanos;
  }

  /**
   * Creates a new Duration instance representing the specified number of days.
   *
   * @param days - the number of days
   * @returns a new Duration instance representing the specified number of days.
   */
  public static ofDays(days: number): Duration {
    return Duration.create(MathEx.multiplyExact(days, Time.SECONDS_PER_DAY), 0);
  }

  /**
   * Creates a new Duration instance representing the specified number of hours.
   *
   * @param hours - the number of hours
   * @returns a new Duration instance representing the specified number of hours.
   */
  public static ofHours(hours: number): Duration {
    return Duration.create(MathEx.multiplyExact(hours, Time.SECONDS_PER_HOUR), 0);
  }

  /**
   * Creates a new Duration instance representing the specified number of minutes.
   *
   * @param minutes - the number of minutes
   * @returns a new Duration instance representing the specified number of minutes.
   */
  public static ofMinutes(minutes: number): Duration {
    return Duration.create(MathEx.multiplyExact(minutes, Time.SECONDS_PER_MINUTE), 0);
  }

  /**
   * Creates a new Duration instance representing the specified number of seconds.
   *
   * @param seconds - the number of seconds
   * @returns a new Duration instance representing the specified number of seconds.
   */
  public static ofSeconds(seconds: number): Duration {
    return Duration.create(seconds, 0);
  }

  /**
   * Creates a new Duration instance representing the specified number of seconds adjusted by a number of nanoseconds.
   *
   * @param seconds - the number of seconds
   * @param nanoAdjustment - the number of nanoseconds by which to adjust the seconds
   * @returns a new Duration instance representing the specified number of seconds adjusted by the specified number of nanoseconds.
   */
  public static ofSecondsAdjusted(seconds: number, nanoAdjustment: number): Duration {
    const secs: number = MathEx.addExact(seconds, MathEx.floorDiv(nanoAdjustment, Time.NANOS_PER_SECOND));
    const nos: number = MathEx.floorMod(nanoAdjustment, Time.NANOS_PER_SECOND);
    return Duration.create(secs, nos);
  }

  /**
   * Creates a new Duration instance representing the specified number of milliseconds.
   *
   * @param millis - the number of milliseconds
   * @returns a new Duration instance representing the specified number of milliseconds.
   */
  public static ofMillis(millis: number): Duration {
    let secs = millis / Time.MILLIS_PER_SECOND;
    let mos = millis % Time.MILLIS_PER_SECOND;

    if (mos < 0) {
      mos += Time.MILLIS_PER_SECOND;
      secs--;
    }

    return Duration.create(Math.trunc(secs), mos * Time.NANOS_PER_MILLI);
  }

  /**
   * Creates a new Duration instance representing the specified number of nanoseconds.
   *
   * @param nanos - the number of nanoseconds
   * @returns a new Duration instance representing the specified number of nanoseconds.
   */
  public static ofNanos(nanos: number): Duration {
    let secs = nanos / Time.NANOS_PER_SECOND;
    let nos = nanos % Time.NANOS_PER_SECOND;

    if (nos < 0) {
      nos += Time.NANOS_PER_SECOND;
      secs--;
    }

    return Duration.create(Math.trunc(secs), nos);
  }

  /**
   * Private utility method to create a new Duration instance representing the specified number of seconds and
   * nanoseconds.
   *
   * @param seconds - the number of seconds
   * @param nanoAdjustment - the number of nanoseconds
   * @returns a new Duration instance representing the specified number of seconds and nanoseconds.
   */
  private static create(seconds: number, nanoAdjustment: number): Duration {
    if ((seconds | nanoAdjustment) === 0) {
      return Duration.ZERO;
    }

    return new Duration(seconds, nanoAdjustment);
  }

  /**
   * Private utility method to create a new Duration instance by adding the specified number of seconds and nanoseconds.
   *
   * @param secondsToAdd - the number of seconds to add
   * @param nanosToAdd - the number of nanoseconds to add
   * @returns a new Duration instance with the sum of this duration and the specified number of seconds and nanoseconds.
   */
  private plusExact(secondsToAdd: number, nanosToAdd: number): Duration {
    if ((secondsToAdd | nanosToAdd) === 0) {
      return this;
    }

    let epochSec: number = MathEx.addExact(this.seconds, secondsToAdd);
    epochSec = MathEx.addExact(epochSec, Math.trunc(nanosToAdd / Time.NANOS_PER_SECOND));
    nanosToAdd = nanosToAdd % Time.NANOS_PER_SECOND;
    const nanoAdjustment: number = this.nanos + nanosToAdd;

    return Duration.ofSecondsAdjusted(epochSec, nanoAdjustment);
  }

  /**
   * Private utility method to validate the specified number of nanoseconds.
   *
   * @param nanos - the number of nanoseconds to validate
   * @returns true if the specified number of nanoseconds is valid; false otherwise.
   */
  private static isValidNanos(nanos: number): boolean {
    return Number.isSafeInteger(nanos) && nanos >= 0 && nanos <= 999-999-999;
  }

  /**
   * Private utility method to validate the specified number of nanoseconds.
   *
   * @param nanos - the number of nanoseconds to validate
   * @throws IllegalArgumentError if the specified number of nanoseconds is invalid.
   */
  private static checkValidNanos(nanos: number): void {
    if (!Duration.isValidNanos(nanos)) {
      throw new IllegalArgumentError(
        'The nanoseconds value must be zero or greater and less than or equal to 999,999,999',
      );
    }
  }
}
