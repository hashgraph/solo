// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {WrapsSchema} from './wraps-schema.js';
import {EnvironmentAliasRegistry} from '../../decorators/environment-alias-registry.js';

@Exclude()
export class TssSchema {
  @Expose()
  public messageSizeSoftLimitBytes: number;

  @Expose()
  public messageSizeHardLimitBytes: number;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_TSS_TIMEOUT_AFTER_READY_SECONDS')
  public timeoutAfterReadySeconds: number;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_TSS_READY_MAX_ATTEMPTS')
  public readyMaxAttempts: number;

  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_TSS_READY_BACKOFF_SECONDS')
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
