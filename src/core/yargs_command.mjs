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

'use strict'
import * as commandFlags from '../commands/flags.mjs'
import { IllegalArgumentError } from './errors.mjs'

export class YargsCommand {
  /**
     * @param {{command: string, description: string, requiredFlags: CommandFlag[], requiredFlagsWithDisabledPrompt: CommandFlag[], optionalFlags: CommandFlag[], commandDef: BaseCommand, handler: string}} opts
     */
  constructor (opts = {}) {
    const { command, description, requiredFlags, requiredFlagsWithDisabledPrompt, optionalFlags, commandDef, handler } = opts

    if (!command) throw new IllegalArgumentError('A string is required as the \'command\' property', command)
    if (!description) throw new IllegalArgumentError('A string is required as the \'description\' property', description)
    if (!requiredFlags) throw new IllegalArgumentError('An array of CommandFlag is required as the \'requiredFlags\' property', requiredFlags)
    if (!requiredFlagsWithDisabledPrompt) throw new IllegalArgumentError('An array of CommandFlag is required as the \'requiredFlagsWithDisabledPrompt\' property', requiredFlagsWithDisabledPrompt)
    if (!optionalFlags) throw new IllegalArgumentError('An array of CommandFlag is required as the \'optionalFlags\' property', optionalFlags)
    if (!commandDef) throw new IllegalArgumentError('An instance of BaseCommand is required as the \'commandDef\' property', commandDef)
    if (!handler) throw new IllegalArgumentError('A string is required as the \'handler\' property', handler)

    let commandNamespace = ''
    if (commandDef.getCommandDefinition) {
      const definition = commandDef.getCommandDefinition()
      if (definition && definition.command) {
        commandNamespace = commandDef.getCommandDefinition().command
      }
    }

    const allFlags = [
      ...requiredFlags,
      ...requiredFlagsWithDisabledPrompt,
      ...optionalFlags
    ]

    return {
      command,
      desc: description,
      builder: y => commandFlags.setCommandFlags(y, ...allFlags),
      handler: argv => {
        commandDef.logger.debug(`==== Running '${commandNamespace} ${command}' ===`)
        commandDef.logger.debug(argv)

        argv.requiredFlags = requiredFlags
        argv.requiredFlagsWithDisabledPrompt = requiredFlagsWithDisabledPrompt
        argv.optionalFlags = optionalFlags

        commandDef[handler](argv).then(r => {
          commandDef.logger.debug(`==== Finished running '${commandNamespace} ${command}' ====`)
          if (!r) process.exit(1)
        }).catch(err => {
          commandDef.logger.showUserError(err)
          process.exit(1)
        })
      }
    }
  }
}
