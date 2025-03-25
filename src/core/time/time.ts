// SPDX-License-Identifier: Apache-2.0

/**
 * Provides constants for working with time.
 */
export class Time {
  /**
   * The number of hours in a day.
   */
  public static readonly HOURS_PER_DAY = 24;
  /**
   * The number of minutes in an hour.
   */
  public static readonly MINUTES_PER_HOUR = 60;
  /**
   * The number of seconds in a minute.
   */
  public static readonly SECONDS_PER_MINUTE = 60;
  /**
   * The number of seconds in an hour.
   */
  public static readonly SECONDS_PER_HOUR = Time.SECONDS_PER_MINUTE * Time.MINUTES_PER_HOUR;
  /**
   * The number of seconds in a day.
   */
  public static readonly SECONDS_PER_DAY = Time.SECONDS_PER_HOUR * Time.HOURS_PER_DAY;
  /**
   * The number of milliseconds in a second.
   */
  public static readonly MILLIS_PER_SECOND = 1000;
  /**
   * The number of nanoseconds in a second.
   */
  public static readonly NANOS_PER_SECOND = 1_000_000_000;
  /**
   * The number of nanoseconds in a millisecond.
   */
  public static readonly NANOS_PER_MILLI = 1_000_000;
}
