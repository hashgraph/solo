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
import * as constants from '../core/constants.js';
import * as version from '../../version.js';
import path from 'path';
import {type CommandFlag} from '../types/flag_types.js';
import {type ListrTaskWrapper} from 'listr2';
import fs from 'fs';
import {IllegalArgumentError, SoloError} from '../core/errors.js';
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import * as helpers from '../core/helpers.js';
import validator from 'validator';

export class Flags {
  private static async prompt(
    type: string,
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    try {
      let needsPrompt = type === 'toggle' ? input === undefined || typeof input !== 'boolean' : !input;
      needsPrompt = type === 'number' ? typeof input !== 'number' : needsPrompt;

      if (needsPrompt) {
        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          // this is to help find issues with prompts running in non-interactive mode, user should supply quite mode,
          // or provide all flags required for command
          throw new SoloError('Cannot prompt for input in non-interactive mode');
        }

        input = await task.prompt(ListrEnquirerPromptAdapter).run({
          type,
          default: defaultValue,
          message: promptMessage,
        });
      }

      if (emptyCheckMessage && !input) {
        throw new SoloError(emptyCheckMessage);
      }

      return input;
    } catch (e: Error | any) {
      throw new SoloError(`input failed: ${flagName}: ${e.message}`, e);
    }
  }

  private static async promptText(
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    return await Flags.prompt('text', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  private static async promptToggle(
    task: ListrTaskWrapper<any, any, any>,
    input: any,
    defaultValue: any,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ) {
    return await Flags.prompt('toggle', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  /**
   * Disable prompts for the given set of flags
   * @param flags list of flags to disable prompts for
   */
  static disablePrompts(flags: CommandFlag[]) {
    Flags.resetDisabledPrompts();
    for (const flag of flags) {
      if (flag.definition) {
        flag.definition.disablePrompt = true;
      }
    }
  }

  /**
   * Set flag from the flag option
   * @param y instance of yargs
   * @param commandFlags a set of command flags
   *
   */
  static setCommandFlags(y: any, ...commandFlags: CommandFlag[]) {
    commandFlags.forEach(flag => {
      y.option(flag.name, flag.definition);
    });
  }

  static readonly devMode: CommandFlag = {
    constName: 'devMode',
    name: 'dev',
    definition: {
      describe: 'Enable developer mode',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  // list of common flags across commands. command specific flags are defined in the command's module.
  static readonly clusterName: CommandFlag = {
    constName: 'clusterName',
    name: 'cluster-name',
    definition: {
      describe: 'Cluster name',
      defaultValue: 'solo-cluster-setup',
      alias: 'c',
      type: 'string',
    },
    prompt: async function promptClusterName(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.clusterName.definition.defaultValue,
        'Enter cluster name: ',
        'cluster name cannot be empty',
        Flags.clusterName.name,
      );
    },
  };

  static readonly clusterSetupNamespace: CommandFlag = {
    constName: 'clusterSetupNamespace',
    name: 'cluster-setup-namespace',
    definition: {
      describe: 'Cluster Setup Namespace',
      defaultValue: constants.SOLO_SETUP_NAMESPACE,
      alias: 's',
      type: 'string',
    },
    prompt: async function promptClusterSetupNamespace(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        'solo-cluster',
        'Enter cluster setup namespace name: ',
        'cluster setup namespace cannot be empty',
        Flags.clusterSetupNamespace.name,
      );
    },
  };

  static readonly namespace: CommandFlag = {
    constName: 'namespace',
    name: 'namespace',
    definition: {
      describe: 'Namespace',
      alias: 'n',
      type: 'string',
    },
    prompt: async function promptNamespace(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        'solo',
        'Enter namespace name: ',
        'namespace cannot be empty',
        Flags.namespace.name,
      );
    },
  };

  static readonly deployHederaExplorer: CommandFlag = {
    constName: 'deployHederaExplorer',
    name: 'hedera-explorer',
    definition: {
      describe: 'Deploy hedera explorer',
      defaultValue: true,
      alias: 'x',
      type: 'boolean',
    },
    prompt: async function promptDeployHederaExplorer(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployHederaExplorer.definition.defaultValue,
        'Would you like to deploy Hedera Explorer? ',
        null,
        Flags.deployHederaExplorer.name,
      );
    },
  };

  static readonly valuesFile: CommandFlag = {
    constName: 'valuesFile',
    name: 'values-file',
    definition: {
      describe: 'Comma separated chart values files',
      defaultValue: '',
      alias: 'f',
      type: 'string',
    },
    prompt: async function promptValuesFile(task: ListrTaskWrapper<any, any, any>, input: any) {
      try {
        if (input && !fs.existsSync(input)) {
          input = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'text',
            default: Flags.valuesFile.definition.defaultValue,
            message: 'Enter path to values.yaml: ',
          });

          if (!fs.existsSync(input)) {
            throw new IllegalArgumentError('Invalid values.yaml file', input);
          }
        }

        return input;
      } catch (e: Error | any) {
        throw new SoloError(`input failed: ${Flags.valuesFile.name}`, e);
      }
    },
  };

  static readonly profileFile: CommandFlag = {
    constName: 'profileFile',
    name: 'profile-file',
    definition: {
      describe: 'Resource profile definition (e.g. custom-spec.yaml)',
      defaultValue: constants.DEFAULT_PROFILE_FILE,
      type: 'string',
    },
    prompt: async function promptProfileFile(task: ListrTaskWrapper<any, any, any>, input: any) {
      if (input && !fs.existsSync(input)) {
        input = await task.prompt(ListrEnquirerPromptAdapter).run({
          type: 'text',
          default: Flags.valuesFile.definition.defaultValue,
          message: 'Enter path to custom resource profile definition file: ',
        });
      }

      if (input && !fs.existsSync(input)) {
        throw new IllegalArgumentError(`Invalid profile definition file: ${input}}`, input);
      }

      return input;
    },
  };

  static readonly profileName: CommandFlag = {
    constName: 'profileName',
    name: 'profile',
    definition: {
      describe: `Resource profile (${constants.ALL_PROFILES.join(' | ')})`,
      defaultValue: constants.PROFILE_LOCAL,
      type: 'string',
    },
    prompt: async function promptProfile(
      task: ListrTaskWrapper<any, any, any>,
      input: any,
      choices = constants.ALL_PROFILES,
    ) {
      try {
        const initial = choices.indexOf(input);
        if (initial < 0) {
          const input = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'select',
            message: 'Select profile for solo network deployment',
            choices: helpers.cloneArray(choices),
          });

          if (!input) {
            throw new SoloError('key-format cannot be empty');
          }

          return input;
        }

        return input;
      } catch (e: Error | any) {
        throw new SoloError(`input failed: ${Flags.profileName.name}`, e);
      }
    },
  };

  static readonly deployPrometheusStack: CommandFlag = {
    constName: 'deployPrometheusStack',
    name: 'prometheus-stack',
    definition: {
      describe: 'Deploy prometheus stack',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployPrometheusStack(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployPrometheusStack.definition.defaultValue,
        'Would you like to deploy prometheus stack? ',
        null,
        Flags.deployPrometheusStack.name,
      );
    },
  };

  static readonly enablePrometheusSvcMonitor: CommandFlag = {
    constName: 'enablePrometheusSvcMonitor',
    name: 'prometheus-svc-monitor',
    definition: {
      describe: 'Enable prometheus service monitor for the network nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptEnablePrometheusSvcMonitor(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.enablePrometheusSvcMonitor.definition.defaultValue,
        'Would you like to enable the Prometheus service monitor for the network nodes? ',
        null,
        Flags.enablePrometheusSvcMonitor.name,
      );
    },
  };

  static readonly deployMinio: CommandFlag = {
    constName: 'deployMinio',
    name: 'minio',
    definition: {
      describe: 'Deploy minio operator',
      defaultValue: true,
      type: 'boolean',
    },
    prompt: async function promptDeployMinio(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployMinio.definition.defaultValue,
        'Would you like to deploy MinIO? ',
        null,
        Flags.deployMinio.name,
      );
    },
  };

  static readonly deployCertManager: CommandFlag = {
    constName: 'deployCertManager',
    name: 'cert-manager',
    definition: {
      describe: 'Deploy cert manager, also deploys acme-cluster-issuer',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployCertManager(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployCertManager.definition.defaultValue,
        'Would you like to deploy Cert Manager? ',
        null,
        Flags.deployCertManager.name,
      );
    },
  };

  /*
    Deploy cert manager CRDs separately from cert manager itself.  Cert manager
    CRDs are required for cert manager to deploy successfully.
 */
  static readonly deployCertManagerCrds: CommandFlag = {
    constName: 'deployCertManagerCrds',
    name: 'cert-manager-crds',
    definition: {
      describe: 'Deploy cert manager CRDs',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployCertManagerCrds(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployCertManagerCrds.definition.defaultValue,
        'Would you like to deploy Cert Manager CRDs? ',
        null,
        Flags.deployCertManagerCrds.name,
      );
    },
  };

  static readonly deployJsonRpcRelay: CommandFlag = {
    constName: 'deployJsonRpcRelay',
    name: 'json-rpc-relay',
    definition: {
      describe: 'Deploy JSON RPC Relay',
      defaultValue: false,
      alias: 'j',
      type: 'boolean',
    },
    prompt: undefined,
  };

  static readonly stateFile: CommandFlag = {
    constName: 'stateFile',
    name: 'state-file',
    definition: {
      describe: 'A zipped state file to be used for the network',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly releaseTag: CommandFlag = {
    constName: 'releaseTag',
    name: 'release-tag',
    definition: {
      describe: `Release tag to be used (e.g. ${version.HEDERA_PLATFORM_VERSION})`,
      alias: 't',
      defaultValue: version.HEDERA_PLATFORM_VERSION,
      type: 'string',
    },
    prompt: async function promptReleaseTag(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        'v0.42.5',
        'Enter release version: ',
        'release tag cannot be empty',
        Flags.releaseTag.name,
      );
    },
  };

  static readonly relayReleaseTag: CommandFlag = {
    constName: 'relayReleaseTag',
    name: 'relay-release',
    definition: {
      describe: 'Relay release tag to be used (e.g. v0.48.0)',
      defaultValue: version.HEDERA_JSON_RPC_RELAY_VERSION,
      type: 'string',
    },
    prompt: async function promptRelayReleaseTag(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.relayReleaseTag.definition.defaultValue,
        'Enter relay release version: ',
        'relay-release-tag cannot be empty',
        Flags.relayReleaseTag.name,
      );
    },
  };

  static readonly cacheDir: CommandFlag = {
    constName: 'cacheDir',
    name: 'cache-dir',
    definition: {
      describe: 'Local cache directory',
      defaultValue: constants.SOLO_CACHE_DIR,
      type: 'string',
    },
    prompt: async function promptCacheDir(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        constants.SOLO_CACHE_DIR,
        'Enter local cache directory path: ',
        null,
        Flags.cacheDir.name,
      );
    },
  };

  static readonly nodeAliasesUnparsed: CommandFlag = {
    constName: 'nodeAliasesUnparsed',
    name: 'node-aliases-unparsed',
    definition: {
      describe: 'Comma separated node aliases (empty means all nodes)',
      alias: 'i',
      type: 'string',
    },
    prompt: async function promptNodeAliases(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.prompt(
        'input',
        task,
        input,
        'node1,node2,node3',
        'Enter list of node IDs (comma separated list): ',
        null,
        Flags.nodeAliasesUnparsed.name,
      );
    },
  };

  static readonly force: CommandFlag = {
    constName: 'force',
    name: 'force',
    definition: {
      describe: 'Force actions even if those can be skipped',
      defaultValue: false,
      alias: 'f',
      type: 'boolean',
    },
    prompt: async function promptForce(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.force.definition.defaultValue,
        'Would you like to force changes? ',
        null,
        Flags.force.name,
      );
    },
  };

  static readonly chartDirectory: CommandFlag = {
    constName: 'chartDirectory',
    name: 'chart-dir',
    definition: {
      describe: 'Local chart directory path (e.g. ~/solo-charts/charts',
      defaultValue: '',
      alias: 'd',
      type: 'string',
    },
    prompt: async function promptChartDir(task: ListrTaskWrapper<any, any, any>, input: any) {
      try {
        if (input === 'false') {
          return '';
        }

        if (input && !fs.existsSync(input)) {
          input = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'text',
            default: Flags.chartDirectory.definition.defaultValue,
            message: 'Enter local charts directory path: ',
          });

          if (!fs.existsSync(input)) {
            throw new IllegalArgumentError('Invalid chart directory', input);
          }
        }

        return input;
      } catch (e: Error | any) {
        throw new SoloError(`input failed: ${Flags.chartDirectory.name}`, e);
      }
    },
  };

  static readonly replicaCount: CommandFlag = {
    constName: 'replicaCount',
    name: 'replica-count',
    definition: {
      describe: 'Replica count',
      defaultValue: 1,
      alias: '',
      type: 'number',
    },
    prompt: async function promptReplicaCount(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.prompt(
        'number',
        task,
        input,
        Flags.replicaCount.definition.defaultValue,
        'How many replica do you want? ',
        null,
        Flags.replicaCount.name,
      );
    },
  };

  static readonly chainId: CommandFlag = {
    constName: 'chainId',
    name: 'ledger-id',
    definition: {
      describe: 'Ledger ID (a.k.a. Chain ID)',
      defaultValue: constants.HEDERA_CHAIN_ID, // Ref: https://github.com/hashgraph/hedera-json-rpc-relay#configuration
      alias: 'l',
      type: 'string',
    },
    prompt: async function promptChainId(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.chainId.definition.defaultValue,
        'Enter chain ID: ',
        null,
        Flags.chainId.name,
      );
    },
  };

  // Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
  static readonly operatorId: CommandFlag = {
    constName: 'operatorId',
    name: 'operator-id',
    definition: {
      describe: 'Operator ID',
      defaultValue: constants.OPERATOR_ID,
      type: 'string',
    },
    prompt: async function promptOperatorId(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.operatorId.definition.defaultValue,
        'Enter operator ID: ',
        null,
        Flags.operatorId.name,
      );
    },
  };

  // Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
  static readonly operatorKey: CommandFlag = {
    constName: 'operatorKey',
    name: 'operator-key',
    definition: {
      describe: 'Operator Key',
      defaultValue: constants.OPERATOR_KEY,
      type: 'string',
    },
    prompt: async function promptOperatorKey(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.operatorKey.definition.defaultValue,
        'Enter operator private key: ',
        null,
        Flags.operatorKey.name,
      );
    },
  };

  static readonly privateKey: CommandFlag = {
    constName: 'privateKey',
    name: 'private-key',
    definition: {
      describe: 'Show private key information',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptPrivateKey(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  static readonly generateGossipKeys: CommandFlag = {
    constName: 'generateGossipKeys',
    name: 'gossip-keys',
    definition: {
      describe: 'Generate gossip keys for nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptGenerateGossipKeys(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.generateGossipKeys.definition.defaultValue,
        `Would you like to generate Gossip keys? ${typeof input} ${input} `,
        null,
        Flags.generateGossipKeys.name,
      );
    },
  };

  static readonly generateTlsKeys: CommandFlag = {
    constName: 'generateTlsKeys',
    name: 'tls-keys',
    definition: {
      describe: 'Generate gRPC TLS keys for nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptGenerateTLSKeys(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.generateTlsKeys.definition.defaultValue,
        'Would you like to generate TLS keys? ',
        null,
        Flags.generateTlsKeys.name,
      );
    },
  };

  static readonly enableTimeout: CommandFlag = {
    constName: 'enableTimeout',
    name: 'enable-timeout',
    definition: {
      describe: 'enable time out for running a command',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  static readonly tlsClusterIssuerType: CommandFlag = {
    constName: 'tlsClusterIssuerType',
    name: 'tls-cluster-issuer-type',
    definition: {
      describe:
        'The TLS cluster issuer type to use for hedera explorer, defaults to "self-signed", the available options are: "acme-staging", "acme-prod", or "self-signed"',
      defaultValue: 'self-signed',
      type: 'string',
    },
    prompt: async function promptTlsClusterIssuerType(task: ListrTaskWrapper<any, any, any>, input: any) {
      try {
        if (!input) {
          input = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'text',
            default: Flags.tlsClusterIssuerType.definition.defaultValue,
            message:
              'Enter TLS cluster issuer type, available options are: "acme-staging", "acme-prod", or "self-signed":',
          });
        }

        if (!input || !['acme-staging', 'acme-prod', 'self-signed'].includes(input)) {
          throw new SoloError('must be one of: "acme-staging", "acme-prod", or "self-signed"');
        }

        return input;
      } catch (e: Error | any) {
        throw new SoloError(`input failed: ${Flags.tlsClusterIssuerType.name}`, e);
      }
    },
  };

  static readonly enableHederaExplorerTls: CommandFlag = {
    constName: 'enableHederaExplorerTls',
    name: 'enable-hedera-explorer-tls',
    definition: {
      describe:
        'Enable the Hedera Explorer TLS, defaults to false, requires certManager and certManagerCrds, which can be deployed through solo-cluster-setup chart or standalone',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptEnableHederaExplorerTls(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.enableHederaExplorerTls.definition.defaultValue,
        'Would you like to enable the Hedera Explorer TLS? ',
        null,
        Flags.enableHederaExplorerTls.name,
      );
    },
  };

  static readonly hederaExplorerTlsLoadBalancerIp: CommandFlag = {
    constName: 'hederaExplorerTlsLoadBalancerIp',
    name: 'hedera-explorer-tls-load-balancer-ip',
    definition: {
      describe: 'The static IP address to use for the Hedera Explorer TLS load balancer, defaults to ""',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly hederaExplorerTlsHostName: CommandFlag = {
    constName: 'hederaExplorerTlsHostName',
    name: 'hedera-explorer-tls-host-name',
    definition: {
      describe: 'The host name to use for the Hedera Explorer TLS, defaults to "explorer.solo.local"',
      defaultValue: 'explorer.solo.local',
      type: 'string',
    },
    prompt: async function promptHederaExplorerTlsHostName(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.hederaExplorerTlsHostName.definition.defaultValue,
        'Enter the host name to use for the Hedera Explorer TLS: ',
        null,
        Flags.hederaExplorerTlsHostName.name,
      );
    },
  };

  static readonly deletePvcs: CommandFlag = {
    constName: 'deletePvcs',
    name: 'delete-pvcs',
    definition: {
      describe: 'Delete the persistent volume claims',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeletePvcs(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deletePvcs.definition.defaultValue,
        'Would you like to delete persistent volume claims upon uninstall? ',
        null,
        Flags.deletePvcs.name,
      );
    },
  };

  static readonly deleteSecrets: CommandFlag = {
    constName: 'deleteSecrets',
    name: 'delete-secrets',
    definition: {
      describe: 'Delete the network secrets',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeleteSecrets(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deleteSecrets.definition.defaultValue,
        'Would you like to delete secrets upon uninstall? ',
        null,
        Flags.deleteSecrets.name,
      );
    },
  };

  static readonly soloChartVersion: CommandFlag = {
    constName: 'soloChartVersion',
    name: 'solo-chart-version',
    definition: {
      describe: 'Solo testing chart version',
      defaultValue: version.SOLO_CHART_VERSION,
      type: 'string',
    },
    prompt: async function promptSoloChartVersion(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.soloChartVersion.definition.defaultValue,
        'Enter solo testing chart version: ',
        null,
        Flags.soloChartVersion.name,
      );
    },
  };

  static readonly applicationProperties: CommandFlag = {
    constName: 'applicationProperties',
    name: 'application-properties',
    definition: {
      describe: 'application.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'application.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly applicationEnv: CommandFlag = {
    constName: 'applicationEnv',
    name: 'application-env',
    definition: {
      describe: 'application.env file for node',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly apiPermissionProperties: CommandFlag = {
    constName: 'apiPermissionProperties',
    name: 'api-permission-properties',
    definition: {
      describe: 'api-permission.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'api-permission.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly bootstrapProperties: CommandFlag = {
    constName: 'bootstrapProperties',
    name: 'bootstrap-properties',
    definition: {
      describe: 'bootstrap.properties file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'bootstrap.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly settingTxt: CommandFlag = {
    constName: 'settingTxt',
    name: 'settings-txt',
    definition: {
      describe: 'settings.txt file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'settings.txt'),
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly app: CommandFlag = {
    constName: 'app',
    name: 'app',
    definition: {
      describe: 'Testing app name',
      defaultValue: constants.HEDERA_APP_NAME,
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly appConfig: CommandFlag = {
    constName: 'appConfig',
    name: 'app-config',
    definition: {
      describe: 'json config file of testing app',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly localBuildPath: CommandFlag = {
    constName: 'localBuildPath',
    name: 'local-build-path',
    definition: {
      describe: 'path of hedera local repo',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly newAccountNumber: CommandFlag = {
    constName: 'newAccountNumber',
    name: 'new-account-number',
    definition: {
      describe: 'new account number for node update transaction',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly newAdminKey: CommandFlag = {
    constName: 'newAdminKey',
    name: 'new-admin-key',
    definition: {
      describe: 'new admin key for the Hedera account',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly gossipPublicKey: CommandFlag = {
    constName: 'gossipPublicKey',
    name: 'gossip-public-key',
    definition: {
      describe: 'path and file name of the public key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly gossipPrivateKey: CommandFlag = {
    constName: 'gossipPrivateKey',
    name: 'gossip-private-key',
    definition: {
      describe: 'path and file name of the private key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly tlsPublicKey: CommandFlag = {
    constName: 'tlsPublicKey',
    name: 'tls-public-key',
    definition: {
      describe: 'path and file name of the public TLS key to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly tlsPrivateKey: CommandFlag = {
    constName: 'tlsPrivateKey',
    name: 'tls-private-key',
    definition: {
      describe: 'path and file name of the private TLS key to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly log4j2Xml: CommandFlag = {
    constName: 'log4j2Xml',
    name: 'log4j2-xml',
    definition: {
      describe: 'log4j2.xml file for node',
      defaultValue: path.join(constants.SOLO_CACHE_DIR, 'templates', 'log4j2.xml'),
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly updateAccountKeys: CommandFlag = {
    constName: 'updateAccountKeys',
    name: 'update-account-keys',
    definition: {
      describe:
        'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
      defaultValue: true,
      type: 'boolean',
    },
    prompt: async function promptUpdateAccountKeys(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.updateAccountKeys.definition.defaultValue,
        'Would you like to updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret? ',
        null,
        Flags.updateAccountKeys.name,
      );
    },
  };

  static readonly ed25519PrivateKey: CommandFlag = {
    constName: 'ed25519PrivateKey',
    name: 'ed25519-private-key',
    definition: {
      describe: 'ED25519 private key for the Hedera account',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptPrivateKey(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  static readonly generateEcdsaKey: CommandFlag = {
    constName: 'generateEcdsaKey',
    name: 'generate-ecdsa-key',
    definition: {
      describe: 'Generate ECDSA private key for the Hedera account',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  static readonly ecdsaPrivateKey: CommandFlag = {
    constName: 'ecdsaPrivateKey',
    name: 'ecdsa-private-key',
    definition: {
      describe: 'ECDSA private key for the Hedera account',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptPrivateKey(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  static readonly setAlias: CommandFlag = {
    constName: 'setAlias',
    name: 'set-alias',
    definition: {
      describe: 'Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  static readonly accountId: CommandFlag = {
    constName: 'accountId',
    name: 'account-id',
    definition: {
      describe: 'The Hedera account id, e.g.: 0.0.1001',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptAccountId(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.accountId.definition.defaultValue,
        'Enter the account id: ',
        null,
        Flags.accountId.name,
      );
    },
  };

  static readonly amount: CommandFlag = {
    constName: 'amount',
    name: 'hbar-amount',
    definition: {
      describe: 'Amount of HBAR to add',
      defaultValue: 100,
      type: 'number',
    },
    prompt: async function promptAmount(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.prompt(
        'number',
        task,
        input,
        Flags.amount.definition.defaultValue,
        'How much HBAR do you want to add? ',
        null,
        Flags.amount.name,
      );
    },
  };

  static readonly createAmount: CommandFlag = {
    constName: 'createAmount',
    name: 'create-amount',
    definition: {
      describe: 'Amount of new account to create',
      defaultValue: 1,
      type: 'number',
    },
    prompt: async function promptCreateAmount(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.prompt(
        'number',
        task,
        input,
        Flags.createAmount.definition.defaultValue,
        'How many account to create? ',
        null,
        Flags.createAmount.name,
      );
    },
  };

  static readonly nodeAlias: CommandFlag = {
    constName: 'nodeAlias',
    name: 'node-alias',
    definition: {
      describe: 'Node alias (e.g. node99)',
      type: 'string',
    },
    prompt: async function promptNewNodeAlias(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.nodeAlias.definition.defaultValue,
        'Enter the new node id: ',
        null,
        Flags.nodeAlias.name,
      );
    },
  };

  static readonly gossipEndpoints: CommandFlag = {
    constName: 'gossipEndpoints',
    name: 'gossip-endpoints',
    definition: {
      describe: 'Comma separated gossip endpoints of the node(e.g. first one is internal, second one is external)',
      type: 'string',
    },
    prompt: async function promptGossipEndpoints(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.gossipEndpoints.definition.defaultValue,
        'Enter the gossip endpoints(comma separated): ',
        null,
        Flags.gossipEndpoints.name,
      );
    },
  };

  static readonly grpcEndpoints: CommandFlag = {
    constName: 'grpcEndpoints',
    name: 'grpc-endpoints',
    definition: {
      describe: 'Comma separated gRPC endpoints of the node (at most 8)',
      type: 'string',
    },
    prompt: async function promptGrpcEndpoints(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcEndpoints.definition.defaultValue,
        'Enter the gRPC endpoints(comma separated): ',
        null,
        Flags.grpcEndpoints.name,
      );
    },
  };

  static readonly endpointType: CommandFlag = {
    constName: 'endpointType',
    name: 'endpoint-type',
    definition: {
      describe: 'Endpoint type (IP or FQDN)',
      defaultValue: constants.ENDPOINT_TYPE_FQDN,
      type: 'string',
    },
    prompt: async function promptEndpointType(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.endpointType.definition.defaultValue,
        'Enter the endpoint type(IP or FQDN): ',
        null,
        Flags.endpointType.name,
      );
    },
  };

  static readonly persistentVolumeClaims: CommandFlag = {
    constName: 'persistentVolumeClaims',
    name: 'pvcs',
    definition: {
      describe: 'Enable persistent volume claims to store data outside the pod, required for node add',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptPersistentVolumeClaims(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.persistentVolumeClaims.definition.defaultValue,
        'Would you like to enable persistent volume claims to store data outside the pod? ',
        null,
        Flags.persistentVolumeClaims.name,
      );
    },
  };

  static readonly debugNodeAlias: CommandFlag = {
    constName: 'debugNodeAlias',
    name: 'debug-node-alias',
    definition: {
      describe: 'Enable default jvm debug port (5005) for the given node id',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly outputDir: CommandFlag = {
    constName: 'outputDir',
    name: 'output-dir',
    definition: {
      describe: 'Path to the directory where the command context will be saved to',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptOutputDir(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.outputDir.definition.defaultValue,
        'Enter path to directory to store the temporary context file',
        null,
        Flags.outputDir.name,
      );
    },
  };

  static readonly inputDir: CommandFlag = {
    constName: 'inputDir',
    name: 'input-dir',
    definition: {
      describe: 'Path to the directory where the command context will be loaded from',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptInputDir(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.inputDir.definition.defaultValue,
        'Enter path to directory containing the temporary context file',
        null,
        Flags.inputDir.name,
      );
    },
  };

  static readonly adminKey: CommandFlag = {
    constName: 'adminKey',
    name: 'admin-key',
    definition: {
      describe: 'Admin key',
      defaultValue: constants.GENESIS_KEY,
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly quiet: CommandFlag = {
    constName: 'quiet',
    name: 'quiet-mode',
    definition: {
      describe: 'Quiet mode, do not prompt for confirmation',
      defaultValue: false,
      alias: 'q',
      type: 'boolean',
      disablePrompt: true,
    },
    prompt: undefined,
  };

  static readonly mirrorNodeVersion: CommandFlag = {
    constName: 'mirrorNodeVersion',
    name: 'mirror-node-version',
    definition: {
      describe: 'Mirror node chart version',
      defaultValue: version.MIRROR_NODE_VERSION,
      type: 'string',
    },
    prompt: async function promptMirrorNodeVersion(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.mirrorNodeVersion.definition.defaultValue,
        'Would you like to choose mirror node version? ',
        null,
        Flags.mirrorNodeVersion.name,
      );
    },
  };

  static readonly hederaExplorerVersion: CommandFlag = {
    constName: 'hederaExplorerVersion',
    name: 'hedera-explorer-version',
    definition: {
      describe: 'Hedera explorer chart version',
      defaultValue: version.HEDERA_EXPLORER_VERSION,
      type: 'string',
    },
    prompt: async function promptHederaExplorerVersion(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptToggle(
        task,
        input,
        Flags.hederaExplorerVersion.definition.defaultValue,
        'Would you like to choose hedera explorer version? ',
        null,
        Flags.hederaExplorerVersion.name,
      );
    },
  };

  static readonly userEmailAddress: CommandFlag = {
    constName: 'userEmailAddress',
    name: 'email',
    definition: {
      describe: 'User email address used for local configuration',
      type: 'string',
    },
    prompt: async function promptUserEmailAddress(task: ListrTaskWrapper<any, any, any>, input: any) {
      if (input?.length) {
        return input;
      }

      const promptForInput = async () => {
        return await task.prompt(ListrEnquirerPromptAdapter).run({
          type: 'text',
          message: 'Please enter your email address:',
        });
      };

      input = await promptForInput();
      while (!validator.isEmail(input)) {
        input = await promptForInput();
      }

      return input;
    },
  };

  static readonly context: CommandFlag = {
    constName: 'contextName',
    name: 'context',
    definition: {
      describe: 'The Kubernetes context name to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptContext(task: ListrTaskWrapper<any, any, any>, input: string[]) {
      return await task.prompt(ListrEnquirerPromptAdapter).run({
        type: 'select',
        name: 'context',
        message: 'Select kubectl context',
        choices: input,
      });
    },
  };

  static readonly deploymentClusters: CommandFlag = {
    constName: 'deploymentClusters',
    name: 'deployment-clusters',
    definition: {
      describe: 'Solo deployment cluster list (comma separated)',
      type: 'string',
    },
    prompt: async function promptDeploymentClusters(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.deploymentClusters.definition.defaultValue,
        'Enter the Solo deployment cluster names (comma separated): ',
        null,
        Flags.deploymentClusters.name,
      );
    },
  };

  static readonly pinger: CommandFlag = {
    constName: 'pinger',
    name: 'pinger',
    definition: {
      describe: 'Enable Pinger service in the Mirror node monitor',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  //* ------------- Node Proxy Certificates ------------- !//

  static readonly grpcTlsCertificatePath: CommandFlag = {
    constName: 'grpcTlsCertificatePath',
    name: 'grpc-tls-cert',
    definition: {
      describe:
        'TLS Certificate path for the gRPC ' +
        '(e.g. "node1=/Users/username/node1-grpc.cert" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcTlsCertificatePath(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcTlsCertificatePath.definition.defaultValue,
        'Enter node alias and path to TLS certificate for gRPC (ex. nodeAlias=path )',
        null,
        Flags.grpcTlsCertificatePath.name,
      );
    },
  };

  static readonly grpcWebTlsCertificatePath: CommandFlag = {
    constName: 'grpcWebTlsCertificatePath',
    name: 'grpc-web-tls-cert',
    definition: {
      describe:
        'TLS Certificate path for gRPC Web ' +
        '(e.g. "node1=/Users/username/node1-grpc-web.cert" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsCertificatePath(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcWebTlsCertificatePath.definition.defaultValue,
        'Enter node alias and path to TLS certificate for gGRPC web (ex. nodeAlias=path )',
        null,
        Flags.grpcWebTlsCertificatePath.name,
      );
    },
  };

  static readonly grpcTlsKeyPath: CommandFlag = {
    constName: 'grpcTlsKeyPath',
    name: 'grpc-tls-key',
    definition: {
      describe:
        'TLS Certificate key path for the gRPC ' +
        '(e.g. "node1=/Users/username/node1-grpc.key" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcTlsKeyPath(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcTlsKeyPath.definition.defaultValue,
        'Enter node alias and path to TLS certificate key for gRPC (ex. nodeAlias=path )',
        null,
        Flags.grpcTlsKeyPath.name,
      );
    },
  };

  static readonly grpcWebTlsKeyPath: CommandFlag = {
    constName: 'grpcWebTlsKeyPath',
    name: 'grpc-web-tls-key',
    definition: {
      describe:
        'TLC Certificate key path for gRPC Web ' +
        '(e.g. "node1=/Users/username/node1-grpc-web.key" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsKeyPath(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcWebTlsKeyPath.definition.defaultValue,
        'Enter node alias and path to TLS certificate key for gGRPC Web (ex. nodeAlias=path )',
        null,
        Flags.grpcWebTlsKeyPath.name,
      );
    },
  };

  static readonly stakeAmounts: CommandFlag = {
    constName: 'stakeAmounts',
    name: 'stake-amounts',
    definition: {
      describe:
        'The amount to be staked in the same order you list the node aliases with multiple node staked values comma seperated',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly contextClusterUnparsed: CommandFlag = {
    constName: 'contextClusterUnparsed',
    name: 'context-cluster',
    definition: {
      describe:
        'Context cluster mapping where context is key = value is cluster and comma delimited if more than one, ' +
        '(e.g.: --context-cluster kind-solo=kind-solo,kind-solo-2=kind-solo-2)',
      type: 'string',
    },
    prompt: async function promptContextCluster(task: ListrTaskWrapper<any, any, any>, input: any) {
      return await Flags.promptText(
        task,
        input,
        null,
        'Enter context cluster mapping: ',
        'context-cluster cannot be empty',
        Flags.contextClusterUnparsed.name,
      );
    },
  };

  static readonly haproxyIps: CommandFlag = {
    constName: 'haproxyIps',
    name: 'haproxy-ips',
    definition: {
      describe:
        'IP mapping where key = value is node alias and static ip for haproxy, ' +
        '(e.g.: --haproxy-ips node1=127.0.0.1,node2=127.0.0.1)',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly envoyIps: CommandFlag = {
    constName: 'envoyIps',
    name: 'envoy-ips',
    definition: {
      describe:
        'IP mapping where key = value is node alias and static ip for envoy proxy, ' +
        '(e.g.: --envoy-ips node1=127.0.0.1,node2=127.0.0.1)',
      type: 'string',
    },
    prompt: undefined,
  };

  static readonly allFlags: CommandFlag[] = [
    Flags.accountId,
    Flags.amount,
    Flags.apiPermissionProperties,
    Flags.app,
    Flags.appConfig,
    Flags.applicationEnv,
    Flags.applicationProperties,
    Flags.bootstrapProperties,
    Flags.cacheDir,
    Flags.chainId,
    Flags.chartDirectory,
    Flags.clusterName,
    Flags.clusterSetupNamespace,
    Flags.context,
    Flags.deletePvcs,
    Flags.deleteSecrets,
    Flags.deployCertManager,
    Flags.deployCertManagerCrds,
    Flags.deployHederaExplorer,
    Flags.deployJsonRpcRelay,
    Flags.deploymentClusters,
    Flags.deployMinio,
    Flags.deployPrometheusStack,
    Flags.devMode,
    Flags.ecdsaPrivateKey,
    Flags.ed25519PrivateKey,
    Flags.enableHederaExplorerTls,
    Flags.enablePrometheusSvcMonitor,
    Flags.enableTimeout,
    Flags.endpointType,
    Flags.soloChartVersion,
    Flags.generateGossipKeys,
    Flags.generateEcdsaKey,
    Flags.generateTlsKeys,
    Flags.gossipEndpoints,
    Flags.gossipPrivateKey,
    Flags.gossipPublicKey,
    Flags.grpcEndpoints,
    Flags.hederaExplorerTlsHostName,
    Flags.hederaExplorerTlsLoadBalancerIp,
    Flags.inputDir,
    Flags.debugNodeAlias,
    Flags.localBuildPath,
    Flags.log4j2Xml,
    Flags.namespace,
    Flags.newAccountNumber,
    Flags.newAdminKey,
    Flags.createAmount,
    Flags.nodeAlias,
    Flags.nodeAliasesUnparsed,
    Flags.operatorId,
    Flags.operatorKey,
    Flags.outputDir,
    Flags.persistentVolumeClaims,
    Flags.privateKey,
    Flags.profileFile,
    Flags.profileName,
    Flags.pinger,
    Flags.relayReleaseTag,
    Flags.releaseTag,
    Flags.replicaCount,
    Flags.stateFile,
    Flags.setAlias,
    Flags.settingTxt,
    Flags.stakeAmounts,
    Flags.tlsClusterIssuerType,
    Flags.tlsPrivateKey,
    Flags.tlsPublicKey,
    Flags.updateAccountKeys,
    Flags.userEmailAddress,
    Flags.valuesFile,
    Flags.mirrorNodeVersion,
    Flags.hederaExplorerVersion,
    Flags.grpcTlsCertificatePath,
    Flags.grpcWebTlsCertificatePath,
    Flags.grpcTlsKeyPath,
    Flags.grpcWebTlsKeyPath,
    Flags.contextClusterUnparsed,
    Flags.haproxyIps,
    Flags.envoyIps,
  ];

  /** Resets the definition.disablePrompt for all flags */
  static resetDisabledPrompts() {
    Flags.allFlags.forEach(f => {
      if (f.definition.disablePrompt) {
        delete f.definition.disablePrompt;
      }
    });
  }

  static readonly allFlagsMap = new Map(Flags.allFlags.map(f => [f.name, f]));

  static readonly nodeConfigFileFlags = new Map(
    [
      Flags.apiPermissionProperties,
      Flags.applicationProperties,
      Flags.bootstrapProperties,
      Flags.log4j2Xml,
      Flags.settingTxt,
    ].map(f => [f.name, f]),
  );

  static readonly integerFlags = new Map([Flags.replicaCount].map(f => [f.name, f]));

  static readonly DEFAULT_FLAGS = {
    requiredFlags: [],
    requiredFlagsWithDisabledPrompt: [Flags.namespace, Flags.cacheDir, Flags.releaseTag],
    optionalFlags: [Flags.devMode],
  };
}
