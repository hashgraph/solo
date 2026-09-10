// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {Flags} from '../../../flags.js';
import {argvPushGlobalFlags, newArgv, optionFromFlag} from '../../../command-helpers.js';

export class DestroyArgvBuilders {
  public static buildDestroyExplorerArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ExplorerCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.force),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDestroyRelayArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...RelayCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      'node1',
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDestroyMirrorNodeArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...MirrorCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.debugMode),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDestroyBlockNodeArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...BlockCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDestroyConsensusNodeArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.DESTROY_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.deletePvcs),
      optionFromFlag(Flags.deleteSecrets),
      optionFromFlag(Flags.enableTimeout),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterResetArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.RESET_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.force),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterDisconnectArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.DISCONNECT_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDeploymentDeleteArgv(config: OneShotSingleDestroyConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.DELETE_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.quiet),
    );
    return argvPushGlobalFlags(argv);
  }
}
