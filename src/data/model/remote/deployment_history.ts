// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class DeploymentHistory {
  @Expose()
  public commands: string[];

  @Expose()
  public lastExecutedCommand: string;
}
