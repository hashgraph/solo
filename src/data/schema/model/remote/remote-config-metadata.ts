// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {UserIdentity} from '../common/user-identity.js';

@Exclude()
export class RemoteConfigMetadata {
  @Expose()
  public lastUpdatedAt: Date;

  @Expose()
  @Type(() => UserIdentity)
  public lastUpdatedBy: UserIdentity;
}
