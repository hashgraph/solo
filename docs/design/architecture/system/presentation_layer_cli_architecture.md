# Presentation Layer - CLI Application Architecture

The Solo X command line interface (CLI) application is the primary user interface for the Solo X
platform.

## Standards

The CLI application is designed to be a user-friendly, interactive, and intuitive interface for
interacting with the Solo X platform. The CLI application should be designed to be as user-friendly
as possible, providing clear and concise feedback to the user at all times.

The CLI should be built using the following tools and libraries:

- [Inquirer.js](https://www.npmjs.com/package/@inquirer/prompts) for interactive prompts
- [Yargs](https://www.npmjs.com/package/yargs) for command line argument parsing
- [Listr2](https://www.npmjs.com/package/listr2) for user-friendly task lists
- [Chalk](https://www.npmjs.com/package/chalk) for colorized output

## Architecture

The CLI application is designed to be a thin wrapper around the underlying workflow layer. It is
responsible for collecting user input, parsing command line arguments, and displaying output to the
user.

Every command or subcommand should be implemented as a separate module within the CLI application.
Each module should be responsible for collecting the necessary input from the user, validating the
input, and passing it to the appropriate workflow layer function.

The CLI application should be designed to be extensible and modular. New commands and subcommands
should be easy to add, and the application should be able to handle a wide range of use cases.

Each command should provide detailed, user-friendly help text that explains the purpose of the
command,
the required input, default values, expected input formats, and any other relevant information.

Ideally, each command should also provide an option for disabling interactive prompts and accepting
all input via command line arguments. Additionally, each command should provide an option to switch
between different output formats (eg: JSON, YAML, Listr2, etc). This allows the CLI to be used in
automated scripts or other non-interactive environments.

## Command Structure Overview

The commands are organized into a nested hierarchy of groups, resources, and operations.

**General Structure:**

```text
solo [global_flags] <group> <resource> <operation> [flags]
```

Where `group` is the optional general category of the command, `resource` is the specific entity to
which an action is to be applied, `operation` is the action to be performed, `flags` are any
resource or action specific options, and `global_flags` are options that apply to all groups. Global
flags may be specified at any level of the command hierarchy.

### Final Vision

| Group       | Resource                   | Operation(s)                                                                                |
|-------------|----------------------------|---------------------------------------------------------------------------------------------|
| block       | node                       | < list \| info \| logs \| add \| upgrade \| destroy >                                       |
| cluster-ref | config                     | < list \| info \| connect \| disconnect >                                                   |
| consensus   | network                    | < info \| deploy \| freeze \| upgrade \| destroy >                                          |
| consensus   | node                       | < list \| info \| logs \| add \| update \| destroy \| start \| stop \| restart \| refresh > |
| consensus   | state                      | < list \| download \| upload >                                                              |
| consensus   | diagnostic                 | < logs \| configs \| all >                                                                  |
| deployment  | config                     | < list \| info \| create \| delete \| import >                                              |
| deployment  | cluster                    | < list \| info \| attach \| detach >                                                        |
| deployment  | state                      | < info \| destroy >                                                                         |
| explorer    | node                       | < list \| info \| logs \| add \| upgrade \| destroy >                                       |
| keys        | consensus                  | < generate >                                                                                |
| ledger      | system                     | < init \| account-rekey \| staking-setup >                                                  |
| ledger      | account                    | < list \| info \| create \| update \| delete \| import >                                    |
| ledger      | crypto                     | < transfer \| balance >                                                                     |
| mirror      | node                       | < list \| info \| logs \| add \| upgrade \| destroy >                                       |
| relay       | node                       | < list \| info \| logs \| add \| upgrade \| destroy >                                       |
| quick-start | < evm \| single \| multi > | < info \| deploy \| destroy >                                                               |

#### Example Commands

```bash
solo cluster-ref config connect --cluster-ref <name> --context <context>
solo deployment config create --deployment <name> --namespace <name> 
solo deployment cluster attach --deployment <name> --cluster-ref <name> --num-consensus-nodes 3 
solo keys consensus generate
solo network deploy --deployment <name> --no-start # Optionally do not start the network nodes, but do everything else including software install and configuration
solo mirror node add --deployment <name> --cluster-ref <name> 
solo relay node add --deployment <name> --cluster-ref <name>
solo explorer node add --deployment <name> --cluster-ref <name> 
solo block node add --deployment <name> --cluster-ref <name> 
# Tear down the deployment when done
solo deployment state destroy --deployment <name> 
```

### Global Flags

Global flags are options that apply to all commands and can be specified at any level of the command
hierarchy. These flags are used to configure the behavior of the CLI application as a whole.

The following global flags are supported:

| Flag                   | Type    | Required | Valid Values                         | Default Value | Description                                                                                                                          |
|------------------------|---------|----------|--------------------------------------|---------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `--force-port-forward` | boolean | No       | `true` (present) or `false` (absent) | `true`        | Force port forwarding for all Solo interactions with the remote or local kubernetes cluster.                                         |
| `--debug`              | boolean | No       | `true` (present) or `false` (absent) | `false`       | Enable verbose diagnostic output and logging.                                                                                        |
| `--format`             | enum    | No       | `list`, `text`, `json`, or `yaml`    | `list`        | Sets the format for printing command output. The default is a command-specific human-friendly output format.                         |
| `-q, --quiet`          | boolean | No       | `true` (present) or `false` (absent) | `false`       | Disable all interactive prompts when running solo commands. If input is required, defaults will be used, or an error will be raised. |
| `-v, --version`        | boolean | No       | `true` (present) or `false` (absent) | `false`       | Display the version number and exits.                                                                                                |
| `-h, --help`           | boolean | No       | `true` (present) or `false` (absent) | `false`       | Display the help information for the supplied command.                                                                               |

### Groups & Top-Level Resources

The CLI application is designed around the following high-level entities (aka commands):

| Name              | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current)                | Description <br/>(Desired) |
|-------------------|-------------------------------|-------------------------------|-------------------------------------------|----------------------------|
| **Block Node**    |                               | `block`                       |                                           |                            |
| **Cluster Ref**   | `cluster-ref`                 | `cluster-ref`                 | Manage solo testing cluster               |                            |
| **Consensus**     |                               | `consensus`                   |                                           |                            |
| **Deployment**    | `deployment`                  | `deployment`                  | Manage solo network deployment            |                            |
| **Explorer Node** | `explorer`                    | `explorer`                    | Manage Explorer in solo network           |                            |
| **Ledger**        |                               | `ledger`                      |                                           |                            |
| **Relay Node**    | `relay`                       | `relay`                       | Manage JSON RPC relays in solo network    |                            |
| **Mirror Node**   | `mirror-node`                 | `mirror`                      | Manage Hedera Mirror Node in solo network |                            |
| **Quick Start**   |                               | `quick-start`                 |                                           |                            |

#### Group Changes (Rename, Remove, Replace)

The following groups have been removed, renamed, or replaced:

| Command Syntax <br/>(Current) | Description <br/>(Current)                  | Disposition                                                                                                         |
|-------------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `init`                        | Initialize local environment                | **Removed** as it is no longer needed. Initialization should be handled on the first command execution if required. |
| `account`                     | Manage Hedera accounts in solo network      | **Replaced** by the `ledger account` group and resource combination                                                 |
| `network`                     | Manage solo network deployment              | **Replaced** by the `consensus network` group and resource combination                                              |
| `node`                        | Manage Hedera platform node in solo network | **Replaced** by the `consensus node` group and resource combination                                                 |
| `mirror-node`                 | Manage Hedera Mirror Node in solo network   | **Replaced** by the `mirror node` group and resource combination                                                    |

### Resources by Group

Each group contains a set of resources that can be managed. The sections below lists the resources
associated with each group.

#### Block

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Node**      | `node`                        | `node`                        |                            |                            |

#### Cluster Ref

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Config**    | `config`                      | `config`                      |                            |                            |

#### Consensus

| Resource Name  | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Network**    | `network`                     | `network`                     |                            |                            |
| **Node**       | `node`                        | `node`                        |                            |                            |
| **State**      | `state`                       | `state`                       |                            |                            |
| **Diagnostic** | `diagnostic`                  | `diagnostic`                  |                            |                            |

#### Deployment

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Cluster**   |                               | `cluster`                     |                            |                            |
| **Config**    | `config`                      | `config`                      |                            |                            |
| **State**     | `state`                       | `state`                       |                            |                            |

#### Explorer

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Node**      | `node`                        | `node`                        |                            |                            |

#### Keys

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Consensus** | `consensus`                   | `consensus`                   |                            |                            |

#### Ledger

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **System**    |                               | `system`                      |                            |                            |
| **Account**   | `account`                     | `account`                     |                            |                            |
| **Crypto**    | `crypto`                      | `crypto`                      |                            |                            |

#### Mirror

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Node**      | `node`                        | `node`                        |                            |                            |

#### Relay

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Node**      | `node`                        | `node`                        |                            |                            |

#### Quick Start

| Resource Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|---------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **EVM**       |                               | `evm`                         |                            |                            |
| **Single**    |                               | `single`                      |                            |                            |
| **Multi**     |                               | `multi`                       |                            |                            |

### Operations by Resource

Each resource contains a set of operations that can be performed. The sections below lists the
operations associated with each resource.

#### Block

##### Node

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Logs**       | `logs`                        | `logs`                        |                            |                            |
| **Add**        | `add`                         | `add`                         |                            |                            |
| **Upgrade**    | `upgrade`                     | `upgrade`                     |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |

#### Cluster Ref

##### Config

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Connect**    | `connect`                     | `connect`                     |                            |                            |
| **Disconnect** | `disconnect`                  | `disconnect`                  |                            |                            |

#### Consensus

##### Network

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Deploy**     | `deploy`                      | `deploy`                      |                            |                            |
| **Freeze**     | `freeze`                      | `freeze`                      |                            |                            |
| **Upgrade**    | `upgrade`                     | `upgrade`                     |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |

##### Node

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Logs**       | `logs`                        | `logs`                        |                            |                            |
| **Add**        | `add`                         | `add`                         |                            |                            |
| **Update**     | `update`                      | `update`                      |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |
| **Start**      | `start`                       | `start`                       |                            |                            |
| **Stop**       | `stop`                        | `stop`                        |                            |                            |
| **Restart**    | `restart`                     | `restart`                     |                            |                            |
| **Refresh**    | `refresh`                     | `refresh`                     |                            |                            |

##### State

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Download**   | `download`                    | `download`                    |                            |                            |
| **Upload**     | `upload`                      | `upload`                      |                            |                            |

##### Diagnostic

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Logs**       | `logs`                        | `logs`                        |                            |                            |
| **Configs**    | `configs`                     | `configs`                     |                            |                            |
| **All**        | `all`                         | `all`                         |                            |                            |

#### Deployment

##### Cluster

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Attach**     | `attach`                      | `attach`                      |                            |                            |
| **Detach**     | `detach`                      | `detach`                      |                            |                            |

##### Config

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Create**     | `create`                      | `create`                      |                            |                            |
| **Delete**     | `delete`                      | `delete`                      |                            |                            |
| **Import**     | `import`                      | `import`                      |                            |                            |

##### State

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |

#### Explorer

##### Node

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Logs**       | `logs`                        | `logs`                        |                            |                            |
| **Add**        | `add`                         | `add`                         |                            |                            |
| **Upgrade**    | `upgrade`                     | `upgrade`                     |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |

#### Keys

##### Consensus

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Generate**   | `generate`                    | `generate`                    |                            |                            |

#### Ledger

##### System

| Operation Name    | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|-------------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Init**          | `init`                        | `init`                        |                            |                            |
| **Account-Rekey** | `account-rekey`               | `account-rekey`               |                            |                            |
| **Staking-Setup** | `staking-setup`               | `staking-setup`               |                            |                            |

##### Account

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Create**     | `create`                      | `create`                      |                            |                            |
| **Update**     | `update`                      | `update`                      |                            |                            |
| **Delete**     | `delete`                      | `delete`                      |                            |                            |
| **Import**     | `import`                      | `import`                      |                            |                            |

##### Crypto

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Transfer**   | `transfer`                    | `transfer`                    |                            |                            |
| **Balance**    | `balance`                     | `balance`                     |                            |                            |

#### Mirror

##### Node

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Logs**       | `logs`                        | `logs`                        |                            |                            |
| **Add**        | `add`                         | `add`                         |                            |                            |
| **Upgrade**    | `upgrade`                     | `upgrade`                     |                            |                            |
| **Destroy**    | `destroy`                     | `destroy`                     |                            |                            |

#### Relay

##### Node

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **List**       | `list`                        | `list`                        |                            |                            |
| **Info**       | `info`                        | `info`                        |                            |                            |
| **Logs**       | `logs`                        | `logs`                        |                            |                            |

#### Quick Start

##### EVM

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Info**       |                               | `info`                        |                            |                            |
| **Deploy**     |                               | `deploy`                      |                            |                            |
| **Destroy**    |                               | `destroy`                     |                            |                            |

##### Single

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Info**       |                               | `info`                        |                            |                            |
| **Deploy**     |                               | `deploy`                      |                            |                            |
| **Destroy**    |                               | `destroy`                     |                            |                            |

##### Multi

| Operation Name | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current) | Description <br/>(Desired) |
|----------------|-------------------------------|-------------------------------|----------------------------|----------------------------|
| **Info**       |                               | `info`                        |                            |                            |
| **Deploy**     |                               | `deploy`                      |                            |                            |
| **Destroy**    |                               | `destroy`                     |                            |                            |

### Flags by Operation

Each operation contains a set of flags that can be used to configure the behavior of the operation.
The sections below lists the flags associated with each operation.

#### Block Node List

**Syntax**

```bash
solo block node list --deployment <name>
```

**Flags**

| Flag Name  | Command Syntax        | Description |
|------------|-----------------------|-------------|
| Deployment | `--deployment <name>` |             |

