# Presentation Layer - CLI Application Architecture

<!--suppress HtmlDeprecatedAttribute -->

The Solo X command line interface (CLI) application is the primary user interface for the Solo X
platform.

## Table of Contents

<div id="table-of-contents"></div>

* [Standards](#standards)
* [Architecture](#architecture)
* [Command Structure Overview](#command-structure-overview)
  * [Final Vision](#final-vision)
  * [Example Commands](#example-commands)
* [Global Flags](#global-flags)
* [Groups](#groups)
  * [Group Changes (Rename, Remove, Replace)](#group-changes-rename-remove-replace)
* [Resources by Group](#resources-by-group)
  * [Block](#block)
  * [Cluster Ref](#cluster-ref)
  * [Consensus](#consensus)
  * [Deployment](#deployment)
  * [Explorer](#explorer)
  * [Keys](#keys)
  * [Ledger](#ledger)
  * [Mirror](#mirror)
  * [Relay](#relay)
  * [Quick Start](#quick-start)
* [Operations by Resource](#operations-by-resource)
  * [Block](#block-1)
    * [Node](#node)
  * [Cluster Ref](#cluster-ref-1)
    * [Config](#config)
  * [Consensus](#consensus-1)
    * [Network](#network)
    * [Node](#node-1)
    * [State](#state)
    * [Diagnostic](#diagnostic)
  * [Deployment](#deployment-1)
    * [Cluster](#cluster)
    * [Config](#config-1)
    * [State](#state-1)
  * [Explorer](#explorer-1)
    * [Node](#node-2)
  * [Keys](#keys-1)
    * [Consensus](#consensus-1)
  * [Ledger](#ledger-1)
    * [System](#system)
    * [Account](#account)
    * [Crypto](#crypto)
  * [Mirror](#mirror-1)
    * [Node](#node-3)
  * [Relay](#relay-1)
    * [Node](#node-4)
  * [Quick Start](#quick-start-1)
    * [EVM](#evm)
    * [Single](#single)
    * [Multi](#multi)
* [Flags by Operation](#flags-by-operation)
  * [Block Node](#block-node)
    * [List](#list)
    * [Info](#info)
    * [Logs](#logs)
    * [Add](#add)
    * [Upgrade](#upgrade)
    * [Destroy](#destroy)

## Standards

The CLI application is designed to be a user-friendly, interactive, and intuitive interface for
interacting with the Solo X platform. The CLI application should be designed to be as user-friendly
as possible, providing clear and concise feedback to the user at all times.

The CLI should be built using the following tools and libraries:

* [Inquirer.js](https://www.npmjs.com/package/@inquirer/prompts) for interactive prompts
* [Yargs](https://www.npmjs.com/package/yargs) for command line argument parsing
* [Listr2](https://www.npmjs.com/package/listr2) for user-friendly task lists
* [Chalk](https://www.npmjs.com/package/chalk) for colorized output

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

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

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

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

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Final Vision

| Group       | Resource                | Operation(s)                                                                                                                    |
|-------------|-------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| block       | node                    | < list &#124; info &#124; logs &#124; add &#124; upgrade &#124; destroy >                                                       |
| cluster-ref | config                  | < list &#124; info &#124; connect &#124; disconnect >                                                                           |
| consensus   | network                 | < info &#124; deploy &#124; freeze &#124; upgrade &#124; destroy >                                                              |
| consensus   | node                    | < list &#124; info &#124; logs &#124; add &#124; update &#124; destroy &#124; start &#124; stop &#124; restart &#124; refresh > |
| consensus   | state                   | < list &#124; download &#124; upload >                                                                                          |
| consensus   | diagnostic              | < logs &#124; configs &#124; all >                                                                                              |
| deployment  | config                  | < list &#124; info &#124; create &#124; delete &#124; import >                                                                  |
| deployment  | cluster                 | < list &#124; info &#124; attach &#124; detach >                                                                                |
| deployment  | state                   | < info &#124; destroy >                                                                                                         |
| explorer    | node                    | < list &#124; info &#124; logs &#124; add &#124; upgrade &#124; destroy >                                                       |
| keys        | consensus               | < generate >                                                                                                                    |
| ledger      | system                  | < init &#124; accounts-rekey &#124; staking-setup >                                                                             |
| ledger      | account                 | < list &#124; info &#124; create &#124; update &#124; delete &#124; import >                                                    |
| ledger      | crypto                  | < transfer &#124; balance >                                                                                                     |
| mirror      | node                    | < list &#124; info &#124; logs &#124; add &#124; upgrade &#124; destroy >                                                       |
| relay       | node                    | < list &#124; info &#124; logs &#124; add &#124; upgrade &#124; destroy >                                                       |
| quick-start | < single &#124; multi > | < info &#124; deploy &#124; destroy >                                                                                           |

#### Example Commands

```bash
solo cluster-ref config connect --cluster-ref <name> --context <context>
solo deployment config create --deployment <name> --namespace <name> 
solo deployment cluster attach --deployment <name> --cluster-ref <name> --num-consensus-nodes 3 
solo keys consensus generate --deployment <name> --gossip-tls-keys --grpc-tls-keys
solo block node add --deployment <name> --cluster-ref <name> 
solo consensus network deploy --deployment <name> --no-start # Optionally do not start the network nodes, but do everything else including software install and configuration
solo mirror node add --deployment <name> --cluster-ref <name> 
solo relay node add --deployment <name> --cluster-ref <name>
solo explorer node add --deployment <name> --cluster-ref <name> 
# Tear down the deployment when done
solo deployment state destroy --deployment <name> 
```

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

## Global Flags

Global flags are options that apply to all commands and can be specified at any level of the command
hierarchy. These flags are used to configure the behavior of the CLI application as a whole.

The following global flags are supported:

| Flag            | Type    | Required | Valid Values                                  | Default Value | Description                                                                                                                          |
|-----------------|---------|----------|-----------------------------------------------|---------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `--deployment`  | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command.                                       |
| `--debug`       | boolean | No       | `true` (present) or `false` (absent)          | `false`       | Enable verbose diagnostic output and logging.                                                                                        |
| `--format`      | enum    | No       | `list`, `text`, `json`, or `yaml`             | `list`        | Sets the format for printing command output. The default is a command-specific human-friendly output format.                         |
| `-q, --quiet`   | boolean | No       | `true` (present) or `false` (absent)          | `false`       | Disable all interactive prompts when running solo commands. If input is required, defaults will be used, or an error will be raised. |
| `-v, --version` | boolean | No       | `true` (present) or `false` (absent)          | `false`       | Display the version number and exits.                                                                                                |
| `-h, --help`    | boolean | No       | `true` (present) or `false` (absent)          | `false`       | Display the help information for the supplied command.                                                                               |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

## Groups

The CLI application is designed around the following high-level entities (aka commands):

| Name              | Command Syntax <br/>(Current) | Command Syntax <br/>(Desired) | Description <br/>(Current)                | Description <br/>(Desired)                                                                                                                                                     |
|-------------------|-------------------------------|-------------------------------|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Block Node**    |                               | `block`                       |                                           | Block Node operations for creating, modifying, and destroying resources. These commands require the presence of an existing deployment.                                        |
| **Cluster Ref**   | `cluster-ref`                 | `cluster-ref`                 | Manage solo testing cluster               | Manages the relationship between Kubernetes context names and Solo cluster references which are an alias for a kubernetes context.                                             |
| **Consensus**     |                               | `consensus`                   |                                           | Consensus Node operations for creating, modifying, and destroying resources. These commands require the presence of an existing deployment.                                    |
| **Deployment**    | `deployment`                  | `deployment`                  | Manage solo network deployment            | Create, modify, and delete deployment configurations. Deployments are required for most of the other commands.                                                                 |
| **Explorer Node** | `explorer`                    | `explorer`                    | Manage Explorer in solo network           | Explorer Node operations for creating, modifying, and destroying resources. These commands require the presence of an existing deployment.                                     |
| **Ledger**        |                               | `ledger`                      |                                           | System, Account, and Crypto ledger-based management operations. These commands require an operational set of consensus nodes and may require an operational mirror node.       |
| **Relay Node**    | `relay`                       | `relay`                       | Manage JSON RPC relays in solo network    | RPC Relay Node operations for creating, modifying, and destroying resources. These commands require the presence of an existing deployment.                                    |
| **Mirror Node**   | `mirror-node`                 | `mirror`                      | Manage Hedera Mirror Node in solo network | Mirror Node operations for creating, modifying, and destroying resources. These commands require the presence of an existing deployment.                                       |
| **Quick Start**   |                               | `quick-start`                 |                                           | Quick start commands for new and returning users who need a preset environment type. These commands use reasonable defaults to provide a single command out of box experience. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Group Changes (Rename, Remove, Replace)

The following groups have been removed, renamed, or replaced:

| Command Syntax <br/>(Current) | Description <br/>(Current)                  | Disposition                                                                                                         |
|-------------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `init`                        | Initialize local environment                | **Removed** as it is no longer needed. Initialization should be handled on the first command execution if required. |
| `account`                     | Manage Hedera accounts in solo network      | **Replaced** by the `ledger account` group and resource combination                                                 |
| `network`                     | Manage solo network deployment              | **Replaced** by the `consensus network` group and resource combination                                              |
| `node`                        | Manage Hedera platform node in solo network | **Replaced** by the `consensus node` group and resource combination                                                 |
| `mirror-node`                 | Manage Hedera Mirror Node in solo network   | **Replaced** by the `mirror node` group and resource combination                                                    |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

## Resources by Group

Each group contains a set of resources that can be managed. The sections below lists the resources
associated with each group.

### Block

| Resource Name | Command Syntax | Description                                                                                          |
|---------------|----------------|------------------------------------------------------------------------------------------------------|
| **Node**      | `node`         | Create, manage, or destroy block node instances. Operates on a single block node instance at a time. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Cluster Ref

| Resource Name | Command Syntax | Description                                                                                            |
|---------------|----------------|--------------------------------------------------------------------------------------------------------|
| **Config**    | `config`       | List, create, manage, and remove associations between Kubernetes contexts and Solo cluster references. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Consensus

| Resource Name  | Command Syntax | Description                                                                                                                                   |
|----------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **Network**    | `network`      | Ledger/network wide consensus operations such as freeze, upgrade, and deploy. Operates on the entire ledger and all consensus node instances. |
| **Node**       | `node`         | List, create, manage, or destroy consensus node instances. Operates on a single consensus node instance at a time.                            |
| **State**      | `state`        | List, download, and upload consensus node state backups to/from individual consensus node instances.                                          |
| **Diagnostic** | `diagnostic`   | Capture diagnostic information such as logs, signed states, and ledger/network/node configurations.                                           |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Deployment

| Resource Name | Command Syntax | Description                                                                                                                                       |
|---------------|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Cluster**   | `cluster`      | View and manage Solo cluster references used by a deployment.                                                                                     |
| **Config**    | `config`       | List, view, create, delete, and import deployments. These commands affect the local configuration only.                                           |
| **State**     | `state`        | View the actual state of the deployment on the Kubernetes clusters or teardown/destroy all remote and local configuration for a given deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Explorer

| Resource Name | Command Syntax | Description                                                                                                      |
|---------------|----------------|------------------------------------------------------------------------------------------------------------------|
| **Node**      | `node`         | List, create, manage, or destroy explorer node instances. Operates on a single explorer node instance at a time. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Keys

| Resource Name | Command Syntax | Description                                                                                    |
|---------------|----------------|------------------------------------------------------------------------------------------------|
| **Consensus** | `consensus`    | Generate unique cryptographic keys (gossip or grpc TLS keys) for the Consensus Node instances. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Ledger

| Resource Name | Command Syntax | Description                                                                                                                      |
|---------------|----------------|----------------------------------------------------------------------------------------------------------------------------------|
| **System**    | `system`       | Perform a full ledger initialization on a new deployment, rekey privileged/system accounts, or setup network staking parameters. |
| **Account**   | `account`      | View, list, create, update, delete, and import ledger accounts.                                                                  |
| **Crypto**    | `crypto`       | Transfer native crypto tokens or query native token account balances.                                                            |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Mirror

| Resource Name | Command Syntax | Description                                                                                                  |
|---------------|----------------|--------------------------------------------------------------------------------------------------------------|
| **Node**      | `node`         | List, create, manage, or destroy mirror node instances. Operates on a single mirror node instance at a time. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Relay

| Resource Name | Command Syntax | Description                                                                                                |
|---------------|----------------|------------------------------------------------------------------------------------------------------------|
| **Node**      | `node`         | List, create, manage, or destroy relay node instances. Operates on a single relay node instance at a time. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Quick Start

| Resource Name | Command Syntax | Description                                                                                                                                                  |
|---------------|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Single**    | `single`       | Creates a uniquely named deployment with a single consensus node, mirror node, block node, relay node, and explorer node.                                    |
| **Multi**     | `multi`        | Creates a uniquely named deployment with a four consensus nodes, a single mirror node, a single block node, a single relay node, and a single explorer node. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

## Operations by Resource

Each resource contains a set of operations that can be performed. The sections below lists the
operations associated with each resource.

### Block

#### Node

| Operation Name | Command Syntax | Description                                                                                                                                                                                    |
|----------------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **List**       | `list`         | Lists the block nodes configured for the specified deployment. Requires access to all Kubernetes clusters attached to the deployment.                                                          |
| **Info**       | `info`         | Displays detailed status information for a single block node configured in the specified deployment. Requires access to all Kubernetes clusters attached to the deployment.                    |
| **Logs**       | `logs`         | Displays the system logs for a single block node configured in the specified deployment. Requires access to all Kubernetes clusters attached to the deployment.                                |
| **Add**        | `add`          | Creates and configures a new block node instance for the specified deployment using the specified Kubernetes cluster. The cluster must be accessible and attached to the specified deployment. |
| **Upgrade**    | `upgrade`      | Upgrades a single block node instance in the specified deployment. Requires access to all Kubernetes clusters attached to the deployment.                                                      |
| **Destroy**    | `destroy`      | Destroys a single block node instance in the specified deployment. Requires access to all Kubernetes clusters attached to the deployment.                                                      |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Cluster Ref

#### Config

| Operation Name | Command Syntax | Description                                                                                                                                   |
|----------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **List**       | `list`         | Lists the configured Kubernetes context to Solo cluster reference mappings.                                                                   |
| **Info**       | `info`         | Displays the status information and attached deployments for a given Solo cluster reference mapping.                                          |
| **Connect**    | `connect`      | Creates a new internal Solo cluster name to a Kubernetes context or maps a Kubernetes context to an existing internal Solo cluster reference. |
| **Disconnect** | `disconnect`   | Removes the Kubernetes context associated with an internal Solo cluster reference.                                                            |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Consensus

#### Network

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Info**       | `info`         | Displays overall status and health information for the consensus network. |
| **Deploy**     | `deploy`       | Installs and configures all consensus nodes for the deployment. |
| **Freeze**     | `freeze`       | Initiates a network freeze for scheduled maintenance or upgrades. |
| **Upgrade**    | `upgrade`      | Upgrades the software version running on all consensus nodes. |
| **Destroy**    | `destroy`      | Removes all consensus network components from the deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>    

#### Node

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all configured consensus nodes in the deployment. |
| **Info**       | `info`         | Displays detailed information about a specific consensus node. |
| **Logs**       | `logs`         | Shows logs for the specified consensus node. |
| **Add**        | `add`          | Adds and configures a new consensus node to the deployment. |
| **Update**     | `update`       | Updates the configuration of an existing consensus node. |
| **Destroy**    | `destroy`      | Removes the specified consensus node from the deployment. |
| **Start**      | `start`        | Starts the consensus node service. |
| **Stop**       | `stop`         | Stops the consensus node service. |
| **Restart**    | `restart`      | Restarts the consensus node service. |
| **Refresh**    | `refresh`      | Refreshes the node configuration and restarts services. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### State

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists available state backups from consensus nodes. |
| **Download**   | `download`     | Downloads a signed state from a consensus node. |
| **Upload**     | `upload`       | Uploads a signed state to a consensus node. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Diagnostic

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Logs**       | `logs`         | Collects logs from consensus nodes in the deployment. |
| **Configs**    | `configs`      | Collects configuration files from consensus nodes. |
| **All**        | `all`          | Captures logs, configs, and diagnostic artifacts from all consensus nodes. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Deployment

#### Cluster

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists clusters associated with a deployment. |
| **Info**       | `info`         | Shows detailed information about a cluster. |
| **Attach**     | `attach`       | Attaches a cluster reference to a deployment. |
| **Detach**     | `detach`       | Detaches a cluster reference from a deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Config

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all local deployment configurations. |
| **Info**       | `info`         | Displays metadata and state information about a deployment. |
| **Create**     | `create`       | Creates a new local deployment configuration. |
| **Delete**     | `delete`       | Removes a local deployment configuration. |
| **Import**     | `import`       | Imports deployment config from a file. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### State

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Info**       | `info`         | Shows the live state of a deployment across all clusters. |
| **Destroy**    | `destroy`      | Removes all components of a deployment including remote resources. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Explorer

#### Node

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all nodes of the given type in the deployment. |
| **Info**       | `info`         | Shows detailed information for a specific node instance. |
| **Logs**       | `logs`         | Displays logs from the specified node instance. |
| **Add**        | `add`          | Adds and configures a new node instance. |
| **Upgrade**    | `upgrade`      | Upgrades the node software to a new version. |
| **Destroy**    | `destroy`      | Deletes the specified node from the deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Keys

#### Consensus

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Generate**   | `generate`     | Generates TLS keys required for consensus node communication. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Ledger

#### System

| Operation Name     | Command Syntax   | Description |
|--------------------|------------------|-------------|
| **Init**           | `init`           | Rekeys system accounts and stake consensus nodes. |
| **Accounts Rekey** | `accounts-rekey` | Rekeys system accounts using newly generated keys. |
| **Staking Setup**  | `staking-setup`  | Stake consensus nodes. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Account

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all ledger accounts. |
| **Info**       | `info`         | Displays information for a specific account. |
| **Create**     | `create`       | Creates a new ledger account. |
| **Update**     | `update`       | Updates an existing ledger account. |
| **Delete**     | `delete`       | Deletes a ledger account. |
| **Import**     | `import`       | Imports account configuration from a file. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Crypto

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Transfer**   | `transfer`     | Transfers HBAR between accounts. |
| **Balance**    | `balance`      | Displays the HBAR balance of an account. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Mirror

#### Node

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all nodes of the given type in the deployment. |
| **Info**       | `info`         | Shows detailed information for a specific node instance. |
| **Logs**       | `logs`         | Displays logs from the specified node instance. |
| **Add**        | `add`          | Adds and configures a new node instance. |
| **Upgrade**    | `upgrade`      | Upgrades the node software to a new version. |
| **Destroy**    | `destroy`      |  Deletes the specified node from the deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Relay

#### Node

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **List**       | `list`         | Lists all nodes of the given type in the deployment. |
| **Info**       | `info`         | Shows detailed information for a specific node instance. |
| **Logs**       | `logs`         | Displays logs from the specified node instance. |
| **Add**        | `add`          | Adds and configures a new node instance. |
| **Upgrade**    | `upgrade`      | Upgrades the node software to a new version. |
| **Destroy**    | `destroy`      | Deletes the specified node from the deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Quick Start

#### EVM

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Info**       | `info`         | Displays details of the quick start configuration.            |
| **Deploy**     | `deploy`       | Deploys all required components for the selected quick start configuration.            |
| **Destroy**    | `destroy`      | Removes the deployed resources for the selected quick start configuration.            |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Single

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Info**       | `info`         | Displays details of the quick start configuration. |
| **Deploy**     | `deploy`       | Deploys all required components for the selected quick start configuration. |
| **Destroy**    | `destroy`      | Removes the deployed resources for the selected quick start configuration. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Multi

| Operation Name | Command Syntax | Description |
|----------------|----------------|-------------|
| **Info**       | `info`         | Displays details of the quick start configuration. |
| **Deploy**     | `deploy`       | Deploys all required components for the selected quick start configuration. |
| **Destroy**    | `destroy`      | Removes the deployed resources for the selected quick start configuration. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

## Flags by Operation

Each operation contains a set of flags that can be used to configure the behavior of the operation.
The sections below lists the flags associated with each operation.

### Block Node

#### List

###### Syntax

```bash
solo block node list --deployment <name>
```

###### Flags

| Flag           | Type   | Required | Valid Values                                  | Default Value | Description                                                                                    |
|----------------|--------|----------|-----------------------------------------------|---------------|------------------------------------------------------------------------------------------------|
| `--deployment` | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Info

###### Syntax

```bash
solo block node info --deployment <name> --id <id>
```

###### Flags

| Flag           | Type    | Required | Valid Values                                  | Default Value | Description                                                                                    |
|----------------|---------|----------|-----------------------------------------------|---------------|------------------------------------------------------------------------------------------------|
| `--deployment` | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command. |
| `--id`         | integer | Yes      | Any integer value `>= 0`                      |               | The unique identifier of the block node instance to view.                                      |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Logs

###### Syntax

```bash
solo block node logs --deployment <name> --id <id>
```

###### Flags

| Flag           | Type    | Required | Valid Values                                  | Default Value | Description                                                                                    |
|----------------|---------|----------|-----------------------------------------------|---------------|------------------------------------------------------------------------------------------------|
| `--deployment` | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command. |
| `--id`         | integer | Yes      | Any integer value `>= 0`                      |               | The unique identifier of the block node instance to view.                                      |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Add

###### Syntax

```bash
solo block node add --deployment <name> --cluster-ref <name> [--chart-version <semver>] [--enable-ingress] [--domain-name <name>] [--values-file <path>]
```

###### Flags

| Flag               | Type    | Required | Valid Values                                  | Default Value    | Description                                                                                               |
|--------------------|---------|----------|-----------------------------------------------|------------------|-----------------------------------------------------------------------------------------------------------|
| `--deployment`     | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |                  | The name of an existing deployment which was created via the deployment config create command.            |
| `--cluster-ref`    | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |                  | The name of an existing cluster reference which was created via the "cluster-ref config connect" command. |
| `--chart-version`  | semver  | No       | Any SemVer compatible string                  |                  | The version of the Block Node helm chart to be used.                                                      |
| `--enable-ingress` | boolean | No       | `true` (present) or `false` (absent)          | `false` (absent) | Enable ingress support for the block node instance.                                                       |
| `--domain-name`    | string  | No       | Any RFC-1034 compliant string                 |                  | The domain name to be used for ingress support.                                                           |
| `--values-file`    | path    | No       | Any valid existing file path                  |                  | A Helm values file used to override the computed defaults.                                                |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Upgrade

###### Syntax

```bash
solo block node upgrade --deployment <name> --id <id> --chart-version <semver>
```

###### Flags

| Flag              | Type    | Required | Valid Values                                  | Default Value | Description                                                                                                                                   |
|-------------------|---------|----------|-----------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `--deployment`    | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command.                                                |
| `--id`            | integer | Yes      | Any integer value `>= 0`                      |               | The unique identifier of the block node instance to upgrade.                                                                                  |
| `--chart-version` | semver  | No       | Any SemVer compatible string                  |               | The Block Node helm chart version to which the instance should be upgraded. This version must be greater than the currently deployed version. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

#### Destroy

###### Syntax

```bash
solo block node logs --deployment <name> --id <id> [--force]
```

###### Flags

| Flag           | Type    | Required | Valid Values                                  | Default Value | Description                                                                                    |
|----------------|---------|----------|-----------------------------------------------|---------------|------------------------------------------------------------------------------------------------|
| `--deployment` | string  | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command. |
| `--id`         | integer | Yes      | Any integer value `>= 0`                      |               | The unique identifier of the block node instance to destroy.                                   |
| `-f, --force`  | boolean | No       | `true` (present) or `false` (absent)          | `false`       | Force the deletion of all provisioned block node resources.                                    |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Cluster Ref

#### Config

##### List

###### Syntax

```bash
solo cluster-ref config list [--deployment <name>]
```

###### Flags

| Flag           | Type   | Required | Valid Values                                  | Default Value | Description                                                                                     |
|----------------|--------|----------|-----------------------------------------------|---------------|-------------------------------------------------------------------------------------------------|
| `--deployment` | string | No       | Any string matching the regex: `[a-z0-9\-_]+` |               | Filters the list of cluster references to those which are attached to the specified deployment. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

##### Info

###### Syntax

```bash
solo cluster-ref config info --cluster-ref <name>
```

###### Flags

| Flag            | Type   | Required | Valid Values                                  | Default Value | Description                                                                                               |\
|-----------------|--------|----------|-----------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------|
| `--cluster-ref` | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing cluster reference which was created via the "cluster-ref config connect" command. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

##### Connect

###### Syntax

```bash
solo cluster-ref config connect --cluster-ref <name> --context <context>
```

###### Flags

| Flag            | Type   | Required | Valid Values                                  | Default Value | Description                                                                             |
|-----------------|--------|----------|-----------------------------------------------|---------------|-----------------------------------------------------------------------------------------|
| `--cluster-ref` | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of a new or existing cluster reference to be linked or created.                |
| `--context`     | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing Kubernetes context to be associated with the cluster reference. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

##### Disconnect

###### Syntax

```bash
solo cluster-ref config disconnect --cluster-ref <name>
```

###### Flags

| Flag            | Type   | Required | Valid Values                                  | Default Value | Description                                                                                               |
|-----------------|--------|----------|-----------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------|
| `--cluster-ref` | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing cluster reference which was created via the "cluster-ref config connect" command. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>

### Consensus

#### Network

##### Info

###### Syntax

```bash
solo consensus network info --deployment <name>
```

###### Flags

| Flag           | Type   | Required | Valid Values                                  | Default Value | Description                                                                                    |
|----------------|--------|----------|-----------------------------------------------|---------------|------------------------------------------------------------------------------------------------|
| `--deployment` | string | Yes      | Any string matching the regex: `[a-z0-9\-_]+` |               | The name of an existing deployment which was created via the deployment config create command. |

<p align="right">
:arrow_up_small: <a href="#table-of-contents">Back to top</a>
</p>
