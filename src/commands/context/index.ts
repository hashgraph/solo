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

import {YargsCommand} from '../../core/index.js';
import {ContextCommandHandlers} from './handlers.js';
import * as ContextFlags from './flags.js';
import {autoInjectable} from "tsyringe-neo";
import {CommandWithHandlers} from "../../types/index.js";

/**
 * Defines the core functionalities of 'node' command
 */
@autoInjectable()
export class ContextCommand extends ContextCommandHandlers implements CommandWithHandlers {

  constructor() {
    super();
  }

  getCommandDefinition() {
    return {
      command: 'context',
      desc: 'Manage local and remote configurations',
      builder: (yargs: any) => {
        return yargs
          .command(
            new YargsCommand(
              {
                command: 'connect',
                description: 'updates the local configuration by connecting a deployment to a k8s context',
                commandDef: this,
                handler: 'connect',
              },
              ContextFlags.USE_FLAGS,
            ),
          )
          .demandCommand(1, 'Select a context command');
      },
    };
  }
}
