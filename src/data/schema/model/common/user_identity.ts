// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import os from 'os';

@Exclude()
export class UserIdentity {
  @Expose()
  public name: string;

  @Expose()
  public hostname: string;

  constructor(name?: string, hostname?: string) {
    this.name = name || os.userInfo().username;
    this.hostname = hostname || os.hostname();
  }
}
