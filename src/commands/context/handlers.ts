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
import { type BaseCommand } from '../base.js'
import { type ContextCommandTasks } from './tasks.js'
import * as helpers from '../../core/helpers.js'
import { constants } from '../../core/index.js'
import { type CommandHandlers } from '../../types/index.js'
import * as ContextFlags from './flags.js'

export class ContextCommandHandlers implements CommandHandlers {
  readonly parent: BaseCommand
  readonly tasks: ContextCommandTasks

  constructor (parent: BaseCommand, tasks: ContextCommandTasks) {
    this.parent = parent
    this.tasks = tasks
  }

  async connect (argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS)

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv),
      this.parent.getLocalConfig().promptLocalConfigTask(this.parent.getK8(), argv),
      this.tasks.updateLocalConfig(argv),
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'context use', null)

    await action(argv, this)
    return true
  }

}
