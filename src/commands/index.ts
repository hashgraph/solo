// SPDX-License-Identifier: Apache-2.0

import {ClusterCommand} from './cluster/index.js';
import {InitCommand} from './init.js';
import {MirrorNodeCommand} from './mirror-node.js';
import {NetworkCommand} from './network.js';
import {NodeCommand} from './node/index.js';
import {RelayCommand} from './relay.js';
import {AccountCommand} from './account.js';
import {DeploymentCommand} from './deployment.js';
import {ExplorerCommand} from './explorer.js';
import {BlockNodeCommand} from './block-node.js';
import {type Options} from './base.js';
import {type CommandDefinition} from '../types/index.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @param options it is an Options object containing logger
 * @returns an array of Yargs command builder
 */
export function Initialize(options: Options): CommandDefinition[] {
  return [
    new InitCommand(options).getCommandDefinition(),
    new ClusterCommand(options).getCommandDefinition(),
    new NetworkCommand(options).getCommandDefinition(),
    new NodeCommand(options).getCommandDefinition(),
    new RelayCommand(options).getCommandDefinition(),
    new AccountCommand(options).getCommandDefinition(),
    new MirrorNodeCommand(options).getCommandDefinition(),
    new ExplorerCommand(options).getCommandDefinition(),
    new DeploymentCommand(options).getCommandDefinition(),
    new BlockNodeCommand(options).getCommandDefinition(),
  ];
}
