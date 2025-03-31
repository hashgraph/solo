// SPDX-License-Identifier: Apache-2.0

import {type ClusterCommand} from './cluster/index.js';
import {type InitCommand} from './init.js';
import {type MirrorNodeCommand} from './mirror-node.js';
import {type NetworkCommand} from './network.js';
import {type NodeCommand} from './node/index.js';
import {type RelayCommand} from './relay.js';
import {type AccountCommand} from './account.js';
import {type DeploymentCommand} from './deployment.js';
import {type ExplorerCommand} from './explorer.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
export function Initialize() {
  const initCmd = container.resolve(InjectTokens.InitCommand) as InitCommand;
  const clusterCmd = container.resolve(InjectTokens.ClusterCommand) as ClusterCommand;
  const networkCommand = container.resolve(InjectTokens.NetworkCommand) as NetworkCommand;
  const nodeCmd = container.resolve(InjectTokens.NodeCommand) as NodeCommand;
  const relayCmd = container.resolve(InjectTokens.RelayCommand) as RelayCommand;
  const accountCmd = container.resolve(InjectTokens.AccountCommand) as AccountCommand;
  const mirrorNodeCmd = container.resolve(InjectTokens.MirrorNodeCommand) as MirrorNodeCommand;
  const explorerCommand = container.resolve(InjectTokens.ExplorerCommand) as ExplorerCommand;
  const deploymentCommand = container.resolve(InjectTokens.DeploymentCommand) as DeploymentCommand;

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
