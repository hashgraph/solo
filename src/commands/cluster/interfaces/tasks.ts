/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type CommandFlag} from '../../../types/flag_types.js';
import {type ArgvStruct, type AnyObject} from '../../../types/aliases.js';
import {type BaseCommand} from '../../base.js';

export interface IClusterCommandHandlers {
  parent: BaseCommand;
  getConfig: (configName: string, flags: CommandFlag[], extraProperties?: string[]) => AnyObject;

  list(argv: ArgvStruct): Promise<boolean>;
  info(argv: ArgvStruct): Promise<boolean>;
  setup(argv: ArgvStruct): Promise<boolean>;
  reset(argv: ArgvStruct): Promise<boolean>;
  connect(argv: ArgvStruct): Promise<boolean>;
}
