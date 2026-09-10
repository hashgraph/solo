// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DeploymentCommand} from '../deployment.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {NodeCommand} from '../node/index.js';
import * as NodeFlags from '../node/flags.js';

@injectable()
export class DeploymentCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DeploymentCommand) public readonly deploymentCommand?: DeploymentCommand,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.deploymentCommand = patchInject(deploymentCommand, InjectTokens.DeploymentCommand, this.constructor.name);
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'deployment';
  protected static override readonly DESCRIPTION: string =
    'Create, modify, and delete deployment configurations. ' +
    'Deployments are required for most of the other commands.';

  public static readonly CLUSTER_SUBCOMMAND_NAME: string = 'cluster';
  private static readonly CLUSTER_SUBCOMMAND_DESCRIPTION: string =
    'View and manage Solo cluster references used by a deployment.';

  public static readonly CONFIG_SUBCOMMAND_NAME: string = 'config';
  private static readonly CONFIG_SUBCOMMAND_DESCRIPTION: string =
    'List, view, create, delete, and import deployments. These commands affect the local configuration only.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  private static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'View the actual state of the deployment on the Kubernetes clusters or ' +
    'teardown/destroy all remote and local configuration for a given deployment.';

  public static readonly PORT_FORWARDS_SUBCOMMAND_NAME: string = 'port-forwards';
  private static readonly PORT_FORWARDS_SUBCOMMAND_DESCRIPTION: string =
    'Manage the port-forward processes for all components in the deployment.';

  // Deprecated: the 'refresh port-forwards' path is superseded by 'port-forwards refresh'. It is kept as a hidden
  // alias for backward compatibility and emits a deprecation notice when invoked.
  public static readonly REFRESH_SUBCOMMAND_NAME: string = 'refresh';
  private static readonly REFRESH_SUBCOMMAND_DESCRIPTION: string =
    "[DEPRECATED] Use 'solo deployment port-forwards refresh' instead. " +
    'Refresh port-forward processes for all components in the deployment.';

  public static readonly DIAGNOSTICS_SUBCOMMAND_NAME: string = 'diagnostics';
  private static readonly DIAGNOSTIC_SUBCOMMAND_DESCRIPTION: string =
    'Capture diagnostic information such as logs, signed states, and ledger/network/node configurations.';

  public static readonly CLUSTER_ATTACH: string = 'attach';

  public static readonly CONFIG_LIST: string = 'list';
  public static readonly CONFIG_CREATE: string = 'create';
  public static readonly CONFIG_DELETE: string = 'delete';
  public static readonly CONFIG_INFO: string = 'info';
  public static readonly CONFIG_PORTS: string = 'ports';
  public static readonly CONFIG_IMPORT: string = 'import';

  public static readonly DIAGNOSTICS_ALL: string = 'all';
  public static readonly DIAGNOSTICS_ANALYZE: string = 'analyze';
  public static readonly DIAGNOSTICS_DEBUG: string = 'debug';
  public static readonly DIAGNOSTICS_LOGS: string = 'logs';
  public static readonly DIAGNOSTICS_CONNECTIONS: string = 'connections';
  public static readonly DIAGNOSTICS_REPORT: string = 'report';
  public static readonly REFRESH_PORT_FORWARDS: string = 'port-forwards';
  public static readonly PORT_FORWARDS_REFRESH: string = 'refresh';
  public static readonly PORT_FORWARDS_STOP: string = 'stop';

  public static readonly STATE_IMAGES: string = 'images';

  public static readonly CREATE_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_CREATE}` as const;

  public static readonly ATTACH_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CLUSTER_ATTACH}` as const;

  public static readonly DELETE_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_DELETE}` as const;

  public static readonly CONNECTIONS_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.DIAGNOSTICS_CONNECTIONS}` as const;

  // Deprecated alias, superseded by REFRESH_PORT_FORWARDS_COMMAND.
  public static readonly REFRESH_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.REFRESH_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.REFRESH_PORT_FORWARDS}` as const;

  public static readonly REFRESH_PORT_FORWARDS_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.PORT_FORWARDS_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.PORT_FORWARDS_REFRESH}` as const;

  public static readonly STOP_PORT_FORWARDS_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.PORT_FORWARDS_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.PORT_FORWARDS_STOP}` as const;

  public static readonly INFO_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_INFO}` as const;

  public static readonly LIST_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_LIST}` as const;

  public static readonly PORTS_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_PORTS}` as const;

  public static readonly IMAGES_COMMAND: string =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.STATE_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.STATE_IMAGES}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            DeploymentCommandDefinition.CLUSTER_ATTACH,
            'Attaches a cluster reference to a deployment.',
            this.deploymentCommand,
            this.deploymentCommand.addCluster,
            DeploymentCommand.ADD_CLUSTER_FLAGS_LIST,
            [...constants.BASE_DEPENDENCIES],
          ),
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.CONFIG_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_LIST,
              'Lists all local deployment configurations or deployments in a specific cluster.',
              this.deploymentCommand,
              this.deploymentCommand.list,
              DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_CREATE,
              'Creates a new local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.create,
              DeploymentCommand.CREATE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_DELETE,
              'Removes a local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.delete,
              DeploymentCommand.DESTROY_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_INFO,
              'Displays the full status of a deployment including components, versions, and port-forward status.',
              this.deploymentCommand,
              this.deploymentCommand.showDeploymentStatus,
              DeploymentCommand.SHOW_STATUS_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_PORTS,
              'List all port-forwards for a deployment. JSON and YAMl output formats, create files containing the data',
              this.deploymentCommand,
              this.deploymentCommand.ports,
              DeploymentCommand.PORTS_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_IMPORT,
              "Imports a deployment into the local configuration from an existing cluster's remote config.",
              this.deploymentCommand,
              this.deploymentCommand.importConfig,
              DeploymentCommand.IMPORT_FLAGS_LIST,
              [],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.STATE_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            DeploymentCommandDefinition.STATE_IMAGES,
            'Lists every pod in the deployment namespace and shows its running container image. ' +
              'Useful to verify that a locally-built image was loaded correctly.',
            this.deploymentCommand,
            this.deploymentCommand.images,
            DeploymentCommand.IMAGES_FLAGS_LIST,
            [constants.KUBECTL],
          ),
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.REFRESH_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.REFRESH_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            DeploymentCommandDefinition.REFRESH_PORT_FORWARDS,
            "[DEPRECATED] Use 'solo deployment port-forwards refresh' instead. " +
              'Refresh and restore killed port-forward processes.',
            this.deploymentCommand,
            this.deploymentCommand.refreshDeprecated,
            DeploymentCommand.REFRESH_FLAGS_LIST,
            [constants.KUBECTL],
          ),
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.PORT_FORWARDS_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.PORT_FORWARDS_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.PORT_FORWARDS_REFRESH,
              'Refresh and restore killed port-forward processes.',
              this.deploymentCommand,
              this.deploymentCommand.refresh,
              DeploymentCommand.REFRESH_FLAGS_LIST,
              [constants.KUBECTL],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.PORT_FORWARDS_STOP,
              'Stop (close down) all port-forwards for a deployment and remove them from the remote config.',
              this.deploymentCommand,
              this.deploymentCommand.stopPortForwards,
              DeploymentCommand.STOP_PORT_FORWARDS_FLAGS_LIST,
              [constants.KUBECTL],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.DIAGNOSTIC_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_ALL,
              'Captures logs, configs, and diagnostics artifacts for all deployments by default, or only the selected deployment when --deployment is provided.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.all,
              NodeFlags.DIAGNOSTICS_CONNECTIONS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_DEBUG,
              'Same scope as diagnostics all, but creates a zip archive for easy sharing.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.debug,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_CONNECTIONS,
              'Tests connections to Consensus, Relay, Explorer, Mirror and Block nodes for all deployments by default, or only the selected deployment when --deployment is provided.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.connections,
              NodeFlags.DIAGNOSTICS_CONNECTIONS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_LOGS,
              'Gets logs and configuration files for all deployments by default, or only the selected deployment when --deployment is provided.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.logs,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_ANALYZE,
              'Analyze a previously collected diagnostics logs directory for common failure signatures.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.analyze,
              NodeFlags.ANALYZE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTICS_REPORT,
              'Collects diagnostics (scoped by --deployment when provided) and creates a GitHub issue using the gh CLI.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.report,
              NodeFlags.REPORT_FLAGS,
            ),
          ),
      )
      .build();
  }
}
