/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type CommandFlag} from '../../../types/flag_types.js';
import {type AnyArgv, type AnyObject} from '../../../types/aliases.js';
import {type BaseCommand} from '../../base.js';

export interface IClusterCommandHandlers {
  parent: BaseCommand;
  getConfig: (configName: string, flags: CommandFlag[], extraProperties?: string[]) => AnyObject;

  list(argv: AnyArgv): Promise<boolean>;
  info(argv: AnyArgv): Promise<boolean>;
  setup(argv: AnyArgv): Promise<boolean>;
  reset(argv: AnyArgv): Promise<boolean>;
  connect(argv: AnyArgv): Promise<boolean>;
}
