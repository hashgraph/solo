// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {WrapsSchema} from './wraps-schema.js';

@Exclude()
export class TssSchema {
  @Expose()
  public messageSizeSoftLimitBytes: number;

  @Expose()
  public messageSizeHardLimitBytes: number;

  @Expose()
  public timeoutAfterReadySeconds: number;

  @Expose()
  public readyMaxAttempts: number;

  @Expose()
  public readyBackoffSeconds: number;

  @Expose()
  @Type((): typeof WrapsSchema => WrapsSchema)
  public wraps: WrapsSchema;

  public constructor(
    messageSizeSoftLimitBytes?: number,
    messageSizeHardLimitBytes?: number,
    timeoutAfterReadySeconds?: number,
    readyMaxAttempts?: number,
    readyBackoffSeconds?: number,
    wraps?: WrapsSchema,
  ) {
    this.messageSizeSoftLimitBytes = messageSizeSoftLimitBytes ?? 4_194_304;
    this.messageSizeHardLimitBytes = messageSizeHardLimitBytes ?? 37_748_736;
    this.timeoutAfterReadySeconds = timeoutAfterReadySeconds ?? 10;
    this.readyMaxAttempts = readyMaxAttempts ?? 60;
    this.readyBackoffSeconds = readyBackoffSeconds ?? 3;
    this.wraps = wraps || new WrapsSchema();
  }
}
