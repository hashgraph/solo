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
import {type Options} from './base.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @param opts it is an Options object containing logger
 * @returns an array of Yargs command builder
 */
export function Initialize(options: Options) {
  const initCmd = new InitCommand(options);
  const clusterCmd = new ClusterCommand(options);
  const networkCommand = new NetworkCommand(options);
  const nodeCmd = new NodeCommand(options);
  const relayCmd = new RelayCommand(options);
  const accountCmd = new AccountCommand(options);
  const mirrorNodeCmd = new MirrorNodeCommand(options);
  const explorerCommand = new ExplorerCommand(options);
  const deploymentCommand = new DeploymentCommand(options);

  return [
    initCmd.getCommandDefinition(),
    accountCmd.getCommandDefinition(),
    clusterCmd.getCommandDefinition(),
    networkCommand.getCommandDefinition(),
    nodeCmd.getCommandDefinition(),
    relayCmd.getCommandDefinition(),
    mirrorNodeCmd.getCommandDefinition(),
    explorerCommand.getCommandDefinition(),
    deploymentCommand.getCommandDefinition(),
  ];
}
