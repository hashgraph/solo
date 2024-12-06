/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

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
