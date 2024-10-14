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
import { ClusterCommand } from './cluster'
import { InitCommand } from './init'
import { MirrorNodeCommand } from './mirror_node'
import { NetworkCommand } from './network'
import { NodeCommand } from './node'
import { RelayCommand } from './relay'
import { AccountCommand } from './account'
import * as flags from './flags'
import { type Opts } from '../index'

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @param opts it is an Options object containing logger
 * @returns an array of Yargs command builder
 */
function Initialize (opts: Opts) {
  const initCmd = new InitCommand(opts)
  const clusterCmd = new ClusterCommand(opts)
  const networkCommand = new NetworkCommand(opts)
  const nodeCmd = new NodeCommand(opts)
  const relayCmd = new RelayCommand(opts)
  const accountCmd = new AccountCommand(opts)
  const mirrorNodeCmd = new MirrorNodeCommand(opts)

  return [
    initCmd.getCommandDefinition(),
    clusterCmd.getCommandDefinition(),
    networkCommand.getCommandDefinition(),
    nodeCmd.getCommandDefinition(),
    relayCmd.getCommandDefinition(),
    accountCmd.getCommandDefinition(),
    mirrorNodeCmd.getCommandDefinition()
  ]
}

// Expose components from the command module
export { Initialize, flags }
