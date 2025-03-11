// SPDX-License-Identifier: Apache-2.0

import {ClusterCommand} from './cluster/index.js';
import {InitCommand} from './init.js';
import {MirrorNodeCommand} from './mirror_node.js';
import {NetworkCommand} from './network.js';
import {NodeCommand} from './node/index.js';
import {RelayCommand} from './relay.js';
import {AccountCommand} from './account.js';
import {DeploymentCommand} from './deployment.js';
import {ExplorerCommand} from './explorer.js';
import {type Opts} from './base.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @param opts it is an Options object containing logger
 * @returns an array of Yargs command builder
 */
export function Initialize(opts: Opts) {
  const initCmd = new InitCommand(opts);
  const clusterCmd = new ClusterCommand(opts);
  const networkCommand = new NetworkCommand(opts);
  const nodeCmd = new NodeCommand(opts);
  const relayCmd = new RelayCommand(opts);
  const accountCmd = new AccountCommand(opts);
  const mirrorNodeCmd = new MirrorNodeCommand(opts);
  const explorerCommand = new ExplorerCommand(opts);
  const deploymentCommand = new DeploymentCommand(opts);

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
