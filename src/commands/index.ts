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
import * as flags from './flags.js';
import {ClusterCommand} from './cluster.js';
import {ContextCommand} from './context/index.js';
import {InitCommand} from './init.js';
import {MirrorNodeCommand} from './mirror_node.js';
import {NetworkCommand} from './network.js';
import {NodeCommand} from './node/index.js';
import {RelayCommand} from './relay.js';
import {AccountCommand} from './account.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
function Initialize() {
  const initCmd = new InitCommand();
  const clusterCmd = new ClusterCommand();
  const contextCmd = new ContextCommand();
  const networkCommand = new NetworkCommand();
  const nodeCmd = new NodeCommand();
  const relayCmd = new RelayCommand();
  const accountCmd = new AccountCommand();
  const mirrorNodeCmd = new MirrorNodeCommand();

  return [
    initCmd.getCommandDefinition(),
    clusterCmd.getCommandDefinition(),
    contextCmd.getCommandDefinition(),
    networkCommand.getCommandDefinition(),
    nodeCmd.getCommandDefinition(),
    relayCmd.getCommandDefinition(),
    accountCmd.getCommandDefinition(),
    mirrorNodeCmd.getCommandDefinition(),
  ];
}

// Expose components from the command module
export {Initialize, flags};
