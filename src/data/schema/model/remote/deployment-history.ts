// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class DeploymentHistory {
  @Expose()
  public commands: string[];

  @Expose()
  public lastExecutedCommand: string;

  public constructor(commands?: string[], lastExecutedCommand?: string) {
    this.commands = commands || [];
    this.lastExecutedCommand = lastExecutedCommand;
  }
}
