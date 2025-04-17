// SPDX-License-Identifier: Apache-2.0

import * as constants from '../core/constants.js';
import * as version from '../../version.js';
import {type CommandFlag} from '../types/flag-types.js';
import fs from 'node:fs';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {
  select as selectPrompt,
  input as inputPrompt,
  number as numberPrompt,
  confirm as confirmPrompt,
} from '@inquirer/prompts';
import validator from 'validator';
import {type AnyListrContext, type AnyObject, type AnyYargs} from '../types/aliases.js';
import {type ClusterReference} from '../core/config/remote/types.js';
import {type Optional, type SoloListrTaskWrapper} from '../types/index.js';
import chalk from 'chalk';
import {PathEx} from '../business/utils/path-ex.js';

export class Flags {
  public static KEY_COMMON = '_COMMON_';

  private static async prompt(
    type: 'toggle' | 'input' | 'number',
    task: SoloListrTaskWrapper<AnyListrContext>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultValue: Optional<any>,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    try {
      let needsPrompt = type === 'toggle' ? input === undefined || typeof input !== 'boolean' : !input;
      needsPrompt = type === 'number' ? typeof input !== 'number' : needsPrompt;

      if (needsPrompt) {
        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          // this is to help find issues with prompts running in non-interactive mode, user should supply quite mode,
          // or provide all flags required for command
          throw new SoloError('Cannot prompt for input in non-interactive mode');
        }

        const promptOptions = {default: defaultValue, message: promptMessage};

        switch (type) {
          case 'input': {
            input = await task.prompt(ListrInquirerPromptAdapter).run(inputPrompt, promptOptions);
            break;
          }
          case 'toggle': {
            input = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, promptOptions);
            break;
          }
          case 'number': {
            input = await task.prompt(ListrInquirerPromptAdapter).run(numberPrompt, promptOptions);
            break;
          }
        }
      }

      if (emptyCheckMessage && !input) {
        throw new SoloError(emptyCheckMessage);
      }

      return input;
    } catch (error) {
      throw new SoloError(`input failed: ${flagName}: ${error.message}`, error);
    }
  }

  private static async promptText(
    task: SoloListrTaskWrapper<AnyListrContext>,
    input: string,
    defaultValue: Optional<string>,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ): Promise<string> {
    return await Flags.prompt('input', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  private static async promptToggle(
    task: SoloListrTaskWrapper<AnyListrContext>,
    input: boolean,
    defaultValue: Optional<boolean>,
    promptMessage: string,
    emptyCheckMessage: string | null,
    flagName: string,
  ): Promise<boolean> {
    return await Flags.prompt('toggle', task, input, defaultValue, promptMessage, emptyCheckMessage, flagName);
  }

  /**
   * Disable prompts for the given set of flags
   * @param flags list of flags to disable prompts for
   */
  public static disablePrompts(flags: CommandFlag[]): void {
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
  public static setRequiredCommandFlags(y: AnyYargs, ...commandFlags: CommandFlag[]) {
    for (const flag of commandFlags) {
      y.option(flag.name, {...flag.definition, demandOption: true});
    }
  }

  /**
   * Set flag from the flag option
   * @param y instance of yargs
   * @param commandFlags a set of command flags
   *
   */
  public static setOptionalCommandFlags(y: AnyYargs, ...commandFlags: CommandFlag[]) {
    for (const flag of commandFlags) {
      let defaultValue = flag.definition.defaultValue === '' ? undefined : flag.definition.defaultValue;
      defaultValue = defaultValue && flag.definition.dataMask ? flag.definition.dataMask : defaultValue;
      y.option(flag.name, {
        ...flag.definition,
        default: defaultValue,
      });
    }
  }

  public static readonly devMode: CommandFlag = {
    constName: 'devMode',
    name: 'dev',
    definition: {
      describe: 'Enable developer mode',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly forcePortForward: CommandFlag = {
    constName: 'forcePortForward',
    name: 'force-port-forward',
    definition: {
      describe: 'Force port forward to access the network services',
      defaultValue: true, // always use local port-forwarding by default
      type: 'boolean',
    },
    prompt: undefined,
  };

  // list of common flags across commands. command specific flags are defined in the command's module.
  public static readonly clusterRef: CommandFlag = {
    constName: 'clusterRef',
    name: 'cluster-ref',
    definition: {
      describe:
        'The cluster reference that will be used for referencing the Kubernetes cluster and stored in the local and ' +
        'remote configuration for the deployment.  For commands that take multiple clusters they can be separated by commas.',
      alias: 'c',
      type: 'string',
    },
    prompt: async function promptClusterReference(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.clusterRef.definition.defaultValue as string,
        'Enter cluster reference: ',
        'cluster reference cannot be empty',
        Flags.clusterRef.name,
      );
    },
  };

  public static readonly clusterSetupNamespace: CommandFlag = {
    constName: 'clusterSetupNamespace',
    name: 'cluster-setup-namespace',
    definition: {
      describe: 'Cluster Setup Namespace',
      defaultValue: constants.SOLO_SETUP_NAMESPACE.name,
      alias: 's',
      type: 'string',
    },
    prompt: async function promptClusterSetupNamespace(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
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

  public static readonly namespace: CommandFlag = {
    constName: 'namespace',
    name: 'namespace',
    definition: {
      describe: 'Namespace',
      alias: 'n',
      type: 'string',
    },
    prompt: async function promptNamespace(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
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

  public static readonly mirrorNamespace: CommandFlag = {
    constName: 'mirrorNamespace',
    name: 'mirror-namespace',
    definition: {
      describe: 'Namespace to use for the Mirror Node deployment, a new one will be created if it does not exist',
      type: 'string',
    },
    prompt: async function promptNamespace(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        'solo',
        'Enter mirror node namespace name: ',
        'namespace cannot be empty',
        Flags.mirrorNamespace.name,
      );
    },
  };

  /**
   * Parse the values files input string that includes the cluster reference and the values file path
   * <p>It supports input as below:
   * <p>--values-file aws-cluster=aws/solo-values.yaml,aws-cluster=aws/solo-values2.yaml,gcp-cluster=gcp/solo-values.yaml,gcp-cluster=gcp/solo-values2.yaml
   * @param input
   */
  public static parseValuesFilesInput(input: string): Record<ClusterReference, Array<string>> {
    const valuesFiles: Record<ClusterReference, Array<string>> = {};
    if (input) {
      const inputItems = input.split(',');
      for (const v of inputItems) {
        const parts = v.split('=');

        let clusterReference: string;
        let valuesFile: string;

        if (parts.length === 2) {
          clusterReference = parts[0];
          valuesFile = PathEx.resolve(parts[1]);
        } else {
          valuesFile = PathEx.resolve(v);
          clusterReference = Flags.KEY_COMMON;
        }

        if (!valuesFiles[clusterReference]) {
          valuesFiles[clusterReference] = [];
        }
        valuesFiles[clusterReference].push(valuesFile);
      }
    }

    return valuesFiles;
  }

  public static readonly valuesFile: CommandFlag = {
    constName: 'valuesFile',
    name: 'values-file',
    definition: {
      describe: 'Comma separated chart values file',
      defaultValue: '',
      alias: 'f',
      type: 'string',
    },
    prompt: async function promptValuesFile(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return input; // no prompt is needed for values file
    },
  };

  public static readonly networkDeploymentValuesFile: CommandFlag = {
    constName: 'valuesFile',
    name: 'values-file',
    definition: {
      describe:
        'Comma separated chart values file paths for each cluster (e.g. values.yaml,cluster-1=./a/b/values1.yaml,cluster-2=./a/b/values2.yaml)',
      defaultValue: '',
      alias: 'f',
      type: 'string',
    },
    prompt: async function promptValuesFile(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      if (input) {
        Flags.parseValuesFilesInput(input); // validate input as early as possible by parsing it
      }

      return input; // no prompt is needed for values file
    },
  };

  public static readonly profileFile: CommandFlag = {
    constName: 'profileFile',
    name: 'profile-file',
    definition: {
      describe: 'Resource profile definition (e.g. custom-spec.yaml)',
      defaultValue: constants.DEFAULT_PROFILE_FILE,
      type: 'string',
    },
    prompt: async function promptProfileFile(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      if (input && !fs.existsSync(input)) {
        input = await task.prompt(ListrInquirerPromptAdapter).run(inputPrompt, {
          default: Flags.valuesFile.definition.defaultValue as string,
          message: 'Enter path to custom resource profile definition file: ',
        });
      }

      if (input && !fs.existsSync(input)) {
        throw new IllegalArgumentError(`Invalid profile definition file: ${input}}`, input);
      }

      return input;
    },
  };

  public static readonly profileName: CommandFlag = {
    constName: 'profileName',
    name: 'profile',
    definition: {
      describe: `Resource profile (${constants.ALL_PROFILES.join(' | ')})`,
      defaultValue: constants.PROFILE_LOCAL,
      type: 'string',
    },
    prompt: async function promptProfile(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
      choices: string[] = constants.ALL_PROFILES,
    ): Promise<string> {
      try {
        const initial = choices.indexOf(input);
        if (initial === -1) {
          const input = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
            message: 'Select profile for solo network deployment',
            choices: structuredClone(choices).map(profile => ({name: profile, value: profile})),
          })) as string;

          if (!input) {
            throw new SoloError('key-format cannot be empty');
          }

          return input;
        }

        return input;
      } catch (error) {
        throw new SoloError(`input failed: ${Flags.profileName.name}`, error);
      }
    },
  };

  public static readonly deployPrometheusStack: CommandFlag = {
    constName: 'deployPrometheusStack',
    name: 'prometheus-stack',
    definition: {
      describe: 'Deploy prometheus stack',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployPrometheusStack(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployPrometheusStack.definition.defaultValue as boolean,
        'Would you like to deploy prometheus stack? ',
        null,
        Flags.deployPrometheusStack.name,
      );
    },
  };

  public static readonly enablePrometheusSvcMonitor: CommandFlag = {
    constName: 'enablePrometheusSvcMonitor',
    name: 'prometheus-svc-monitor',
    definition: {
      describe: 'Enable prometheus service monitor for the network nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptEnablePrometheusSvcMonitor(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.enablePrometheusSvcMonitor.definition.defaultValue as boolean,
        'Would you like to enable the Prometheus service monitor for the network nodes? ',
        null,
        Flags.enablePrometheusSvcMonitor.name,
      );
    },
  };

  public static readonly deployMinio: CommandFlag = {
    constName: 'deployMinio',
    name: 'minio',
    definition: {
      describe: 'Deploy minio operator',
      defaultValue: true,
      type: 'boolean',
    },
    prompt: async function promptDeployMinio(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployMinio.definition.defaultValue as boolean,
        'Would you like to deploy MinIO? ',
        null,
        Flags.deployMinio.name,
      );
    },
  };

  public static readonly deployCertManager: CommandFlag = {
    constName: 'deployCertManager',
    name: 'cert-manager',
    definition: {
      describe: 'Deploy cert manager, also deploys acme-cluster-issuer',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployCertManager(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployCertManager.definition.defaultValue as boolean,
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
  public static readonly deployCertManagerCrds: CommandFlag = {
    constName: 'deployCertManagerCrds',
    name: 'cert-manager-crds',
    definition: {
      describe: 'Deploy cert manager CRDs',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeployCertManagerCrds(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deployCertManagerCrds.definition.defaultValue as boolean,
        'Would you like to deploy Cert Manager CRDs? ',
        null,
        Flags.deployCertManagerCrds.name,
      );
    },
  };

  public static readonly deployJsonRpcRelay: CommandFlag = {
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

  public static readonly stateFile: CommandFlag = {
    constName: 'stateFile',
    name: 'state-file',
    definition: {
      describe: 'A zipped state file to be used for the network',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly upgradeZipFile: CommandFlag = {
    constName: 'upgradeZipFile',
    name: 'upgrade-zip-file',
    definition: {
      describe: 'A zipped file used for network upgrade',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly releaseTag: CommandFlag = {
    constName: 'releaseTag',
    name: 'release-tag',
    definition: {
      describe: `Release tag to be used (e.g. ${version.HEDERA_PLATFORM_VERSION})`,
      alias: 't',
      defaultValue: version.HEDERA_PLATFORM_VERSION,
      type: 'string',
    },
    prompt: async function promptReleaseTag(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        version.HEDERA_PLATFORM_VERSION,
        'Enter release version: ',
        undefined,
        Flags.releaseTag.name,
      );
    },
  };

  public static readonly relayReleaseTag: CommandFlag = {
    constName: 'relayReleaseTag',
    name: 'relay-release',
    definition: {
      describe: 'Relay release tag to be used (e.g. v0.48.0)',
      defaultValue: version.HEDERA_JSON_RPC_RELAY_VERSION,
      type: 'string',
    },
    prompt: async function promptRelayReleaseTag(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.relayReleaseTag.definition.defaultValue as string,
        'Enter relay release version: ',
        'relay-release-tag cannot be empty',
        Flags.relayReleaseTag.name,
      );
    },
  };

  public static readonly cacheDir: CommandFlag = {
    constName: 'cacheDir',
    name: 'cache-dir',
    definition: {
      describe: 'Local cache directory',
      defaultValue: constants.SOLO_CACHE_DIR,
      type: 'string',
    },
    prompt: async function promptCacheDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
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

  public static readonly nodeAliasesUnparsed: CommandFlag = {
    constName: 'nodeAliasesUnparsed',
    name: 'node-aliases',
    definition: {
      describe: 'Comma separated node aliases (empty means all nodes)',
      alias: 'i',
      type: 'string',
    },
    prompt: async function promptNodeAliases(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
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

  public static readonly force: CommandFlag = {
    constName: 'force',
    name: 'force',
    definition: {
      describe: 'Force actions even if those can be skipped',
      defaultValue: false,
      alias: 'f',
      type: 'boolean',
    },
    prompt: async function promptForce(task: SoloListrTaskWrapper<AnyListrContext>, input: boolean): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.force.definition.defaultValue as boolean,
        'Would you like to force changes? ',
        null,
        Flags.force.name,
      );
    },
  };

  public static readonly chartDirectory: CommandFlag = {
    constName: 'chartDirectory',
    name: 'chart-dir',
    definition: {
      describe: 'Local chart directory path (e.g. ~/solo-charts/charts',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptChartDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      if (input === 'false') {
        return '';
      }
      try {
        if (input && !fs.existsSync(input)) {
          input = await task.prompt(ListrInquirerPromptAdapter).run(inputPrompt, {
            default: Flags.chartDirectory.definition.defaultValue as string,
            message: 'Enter local charts directory path: ',
          });

          if (!fs.existsSync(input)) {
            throw new IllegalArgumentError('Invalid chart directory', input);
          }
        }

        return input;
      } catch (error) {
        throw new SoloError(`input failed: ${Flags.chartDirectory.name}`, error);
      }
    },
  };

  public static readonly replicaCount: CommandFlag = {
    constName: 'replicaCount',
    name: 'replica-count',
    definition: {
      describe: 'Replica count',
      defaultValue: 1,
      alias: '',
      type: 'number',
    },
    prompt: async function promptReplicaCount(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: number,
    ): Promise<number> {
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

  public static readonly chainId: CommandFlag = {
    constName: 'chainId',
    name: 'ledger-id',
    definition: {
      describe: 'Ledger ID (a.k.a. Chain ID)',
      defaultValue: constants.HEDERA_CHAIN_ID, // Ref: https://github.com/hashgraph/hedera-json-rpc-relay#configuration
      alias: 'l',
      type: 'string',
    },
    prompt: async function promptChainId(task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.chainId.definition.defaultValue as string,
        'Enter chain ID: ',
        null,
        Flags.chainId.name,
      );
    },
  };

  // Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
  public static readonly operatorId: CommandFlag = {
    constName: 'operatorId',
    name: 'operator-id',
    definition: {
      describe: 'Operator ID',
      defaultValue: undefined,
      type: 'string',
    },
    prompt: async function promptOperatorId(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.operatorId.definition.defaultValue as string,
        'Enter operator ID: ',
        null,
        Flags.operatorId.name,
      );
    },
  };

  // Ref: https://github.com/hashgraph/hedera-json-rpc-relay/blob/main/docs/configuration.md
  public static readonly operatorKey: CommandFlag = {
    constName: 'operatorKey',
    name: 'operator-key',
    definition: {
      describe: 'Operator Key',
      defaultValue: undefined,
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptOperatorKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.operatorKey.definition.defaultValue as string,
        'Enter operator private key: ',
        null,
        Flags.operatorKey.name,
      );
    },
  };

  public static readonly privateKey: CommandFlag = {
    constName: 'privateKey',
    name: 'private-key',
    definition: {
      describe: 'Show private key information',
      defaultValue: false,
      type: 'boolean',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue as string,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  public static readonly generateGossipKeys: CommandFlag = {
    constName: 'generateGossipKeys',
    name: 'gossip-keys',
    definition: {
      describe: 'Generate gossip keys for nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptGenerateGossipKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.generateGossipKeys.definition.defaultValue as boolean,
        `Would you like to generate Gossip keys? ${typeof input} ${input} `,
        null,
        Flags.generateGossipKeys.name,
      );
    },
  };

  public static readonly generateTlsKeys: CommandFlag = {
    constName: 'generateTlsKeys',
    name: 'tls-keys',
    definition: {
      describe: 'Generate gRPC TLS keys for nodes',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptGenerateTLSKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.generateTlsKeys.definition.defaultValue as boolean,
        'Would you like to generate TLS keys? ',
        null,
        Flags.generateTlsKeys.name,
      );
    },
  };

  public static readonly enableTimeout: CommandFlag = {
    constName: 'enableTimeout',
    name: 'enable-timeout',
    definition: {
      describe: 'enable time out for running a command',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly tlsClusterIssuerType: CommandFlag = {
    constName: 'tlsClusterIssuerType',
    name: 'tls-cluster-issuer-type',
    definition: {
      describe:
        'The TLS cluster issuer type to use for hedera explorer, defaults to "self-signed", the available options are: "acme-staging", "acme-prod", or "self-signed"',
      defaultValue: 'self-signed',
      type: 'string',
    },
    prompt: async function promptTlsClusterIssuerType(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string | void> {
      if (input) {
        return;
      }
      try {
        input = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
          default: Flags.tlsClusterIssuerType.definition.defaultValue as string,
          message:
            'Enter TLS cluster issuer type, available options are: "acme-staging", "acme-prod", or "self-signed":',
          choices: ['acme-staging', 'acme-prod', 'self-signed'],
        })) as string;

        return input;
      } catch (error) {
        throw new SoloError(`input failed: ${Flags.tlsClusterIssuerType.name}`, error);
      }
    },
  };

  public static readonly enableHederaExplorerTls: CommandFlag = {
    constName: 'enableHederaExplorerTls',
    name: 'enable-hedera-explorer-tls',
    definition: {
      describe:
        'Enable the Hedera Explorer TLS, defaults to false, requires certManager and certManagerCrds, which can be deployed through solo-cluster-setup chart or standalone',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptEnableHederaExplorerTls(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.enableHederaExplorerTls.definition.defaultValue as boolean,
        'Would you like to enable the Hedera Explorer TLS? ',
        null,
        Flags.enableHederaExplorerTls.name,
      );
    },
  };

  public static readonly ingressControllerValueFile: CommandFlag = {
    constName: 'ingressControllerValueFile',
    name: 'ingress-controller-value-file',
    definition: {
      describe: 'The value file to use for ingress controller, defaults to ""',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly hederaExplorerStaticIp: CommandFlag = {
    constName: 'hederaExplorerStaticIp',
    name: 'hedera-explorer-static-ip',
    definition: {
      describe: 'The static IP address to use for the Hedera Explorer load balancer, defaults to ""',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly hederaExplorerTlsHostName: CommandFlag = {
    constName: 'hederaExplorerTlsHostName',
    name: 'hedera-explorer-tls-host-name',
    definition: {
      describe: 'The host name to use for the Hedera Explorer TLS, defaults to "explorer.solo.local"',
      defaultValue: 'explorer.solo.local',
      type: 'string',
    },
    prompt: async function promptHederaExplorerTlsHostName(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.hederaExplorerTlsHostName.definition.defaultValue as string,
        'Enter the host name to use for the Hedera Explorer TLS: ',
        null,
        Flags.hederaExplorerTlsHostName.name,
      );
    },
  };

  public static readonly deletePvcs: CommandFlag = {
    constName: 'deletePvcs',
    name: 'delete-pvcs',
    definition: {
      describe:
        'Delete the persistent volume claims. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeletePvcs(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deletePvcs.definition.defaultValue as boolean,
        'Would you like to delete persistent volume claims upon uninstall? ',
        null,
        Flags.deletePvcs.name,
      );
    },
  };

  public static readonly deleteSecrets: CommandFlag = {
    constName: 'deleteSecrets',
    name: 'delete-secrets',
    definition: {
      describe:
        'Delete the network secrets. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptDeleteSecrets(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.deleteSecrets.definition.defaultValue as boolean,
        'Would you like to delete secrets upon uninstall? ',
        null,
        Flags.deleteSecrets.name,
      );
    },
  };

  public static readonly soloChartVersion: CommandFlag = {
    constName: 'soloChartVersion',
    name: 'solo-chart-version',
    definition: {
      describe: 'Solo testing chart version',
      defaultValue: version.SOLO_CHART_VERSION,
      type: 'string',
    },
    prompt: async function promptSoloChartVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.soloChartVersion.definition.defaultValue as string,
        'Enter solo testing chart version: ',
        null,
        Flags.soloChartVersion.name,
      );
    },
  };

  public static readonly applicationProperties: CommandFlag = {
    constName: 'applicationProperties',
    name: 'application-properties',
    definition: {
      describe: 'application.properties file for node',
      defaultValue: PathEx.join('templates', 'application.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly applicationEnv: CommandFlag = {
    constName: 'applicationEnv',
    name: 'application-env',
    definition: {
      describe:
        'the application.env file for the node provides environment variables to the solo-container' +
        ' to be used when the hedera platform is started',
      defaultValue: PathEx.join('templates', 'application.env'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly apiPermissionProperties: CommandFlag = {
    constName: 'apiPermissionProperties',
    name: 'api-permission-properties',
    definition: {
      describe: 'api-permission.properties file for node',
      defaultValue: PathEx.join('templates', 'api-permission.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly bootstrapProperties: CommandFlag = {
    constName: 'bootstrapProperties',
    name: 'bootstrap-properties',
    definition: {
      describe: 'bootstrap.properties file for node',
      defaultValue: PathEx.join('templates', 'bootstrap.properties'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly genesisThrottlesFile: CommandFlag = {
    constName: 'genesisThrottlesFile',
    name: 'genesis-throttles-file',
    definition: {
      describe: 'throttles.json file used during network genesis',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly settingTxt: CommandFlag = {
    constName: 'settingTxt',
    name: 'settings-txt',
    definition: {
      describe: 'settings.txt file for node',
      defaultValue: PathEx.join('templates', 'settings.txt'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly app: CommandFlag = {
    constName: 'app',
    name: 'app',
    definition: {
      describe: 'Testing app name',
      defaultValue: constants.HEDERA_APP_NAME,
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly appConfig: CommandFlag = {
    constName: 'appConfig',
    name: 'app-config',
    definition: {
      describe: 'json config file of testing app',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly localBuildPath: CommandFlag = {
    constName: 'localBuildPath',
    name: 'local-build-path',
    definition: {
      describe: 'path of hedera local repo',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly newAccountNumber: CommandFlag = {
    constName: 'newAccountNumber',
    name: 'new-account-number',
    definition: {
      describe: 'new account number for node update transaction',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly newAdminKey: CommandFlag = {
    constName: 'newAdminKey',
    name: 'new-admin-key',
    definition: {
      describe: 'new admin key for the Hedera account',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly gossipPublicKey: CommandFlag = {
    constName: 'gossipPublicKey',
    name: 'gossip-public-key',
    definition: {
      describe: 'path and file name of the public key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly gossipPrivateKey: CommandFlag = {
    constName: 'gossipPrivateKey',
    name: 'gossip-private-key',
    definition: {
      describe: 'path and file name of the private key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly tlsPublicKey: CommandFlag = {
    constName: 'tlsPublicKey',
    name: 'tls-public-key',
    definition: {
      describe: 'path and file name of the public TLS key to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly tlsPrivateKey: CommandFlag = {
    constName: 'tlsPrivateKey',
    name: 'tls-private-key',
    definition: {
      describe: 'path and file name of the private TLS key to be used',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly log4j2Xml: CommandFlag = {
    constName: 'log4j2Xml',
    name: 'log4j2-xml',
    definition: {
      describe: 'log4j2.xml file for node',
      defaultValue: PathEx.join('templates', 'log4j2.xml'),
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly updateAccountKeys: CommandFlag = {
    constName: 'updateAccountKeys',
    name: 'update-account-keys',
    definition: {
      describe:
        'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
      defaultValue: true,
      type: 'boolean',
    },
    prompt: async function promptUpdateAccountKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.updateAccountKeys.definition.defaultValue as boolean,
        'Would you like to updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret? ',
        null,
        Flags.updateAccountKeys.name,
      );
    },
  };

  public static readonly ed25519PrivateKey: CommandFlag = {
    constName: 'ed25519PrivateKey',
    name: 'ed25519-private-key',
    definition: {
      describe: 'ED25519 private key for the Hedera account',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue as string,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  public static readonly generateEcdsaKey: CommandFlag = {
    constName: 'generateEcdsaKey',
    name: 'generate-ecdsa-key',
    definition: {
      describe: 'Generate ECDSA private key for the Hedera account',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly ecdsaPrivateKey: CommandFlag = {
    constName: 'ecdsaPrivateKey',
    name: 'ecdsa-private-key',
    definition: {
      describe: 'ECDSA private key for the Hedera account',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.ed25519PrivateKey.definition.defaultValue as string,
        'Enter the private key: ',
        null,
        Flags.ed25519PrivateKey.name,
      );
    },
  };

  public static readonly setAlias: CommandFlag = {
    constName: 'setAlias',
    name: 'set-alias',
    definition: {
      describe: 'Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly accountId: CommandFlag = {
    constName: 'accountId',
    name: 'account-id',
    definition: {
      describe: 'The Hedera account id, e.g.: 0.0.1001',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptAccountId(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.accountId.definition.defaultValue as string,
        'Enter the account id: ',
        null,
        Flags.accountId.name,
      );
    },
  };

  public static readonly amount: CommandFlag = {
    constName: 'amount',
    name: 'hbar-amount',
    definition: {
      describe: 'Amount of HBAR to add',
      defaultValue: 100,
      type: 'number',
    },
    prompt: async function promptAmount(task: SoloListrTaskWrapper<AnyListrContext>, input: number): Promise<number> {
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

  public static readonly createAmount: CommandFlag = {
    constName: 'createAmount',
    name: 'create-amount',
    definition: {
      describe: 'Amount of new account to create',
      defaultValue: 1,
      type: 'number',
    },
    prompt: async function promptCreateAmount(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: number,
    ): Promise<number> {
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

  public static readonly nodeAlias: CommandFlag = {
    constName: 'nodeAlias',
    name: 'node-alias',
    definition: {
      describe: 'Node alias (e.g. node99)',
      type: 'string',
    },
    prompt: async function promptNewNodeAlias(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.nodeAlias.definition.defaultValue as string,
        'Enter the new node id: ',
        null,
        Flags.nodeAlias.name,
      );
    },
  };

  public static readonly gossipEndpoints: CommandFlag = {
    constName: 'gossipEndpoints',
    name: 'gossip-endpoints',
    definition: {
      describe: 'Comma separated gossip endpoints of the node(e.g. first one is internal, second one is external)',
      type: 'string',
    },
    prompt: async function promptGossipEndpoints(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.gossipEndpoints.definition.defaultValue as string,
        'Enter the gossip endpoints(comma separated): ',
        null,
        Flags.gossipEndpoints.name,
      );
    },
  };

  public static readonly grpcEndpoints: CommandFlag = {
    constName: 'grpcEndpoints',
    name: 'grpc-endpoints',
    definition: {
      describe: 'Comma separated gRPC endpoints of the node (at most 8)',
      type: 'string',
    },
    prompt: async function promptGrpcEndpoints(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcEndpoints.definition.defaultValue as string,
        'Enter the gRPC endpoints(comma separated): ',
        null,
        Flags.grpcEndpoints.name,
      );
    },
  };

  public static readonly endpointType: CommandFlag = {
    constName: 'endpointType',
    name: 'endpoint-type',
    definition: {
      describe: 'Endpoint type (IP or FQDN)',
      defaultValue: constants.ENDPOINT_TYPE_FQDN,
      type: 'string',
    },
    prompt: async function promptEndpointType(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.endpointType.definition.defaultValue as string,
        'Enter the endpoint type(IP or FQDN): ',
        null,
        Flags.endpointType.name,
      );
    },
  };

  public static readonly persistentVolumeClaims: CommandFlag = {
    constName: 'persistentVolumeClaims',
    name: 'pvcs',
    definition: {
      describe: 'Enable persistent volume claims to store data outside the pod, required for node add',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: async function promptPersistentVolumeClaims(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.persistentVolumeClaims.definition.defaultValue as boolean,
        'Would you like to enable persistent volume claims to store data outside the pod? ',
        null,
        Flags.persistentVolumeClaims.name,
      );
    },
  };

  public static readonly debugNodeAlias: CommandFlag = {
    constName: 'debugNodeAlias',
    name: 'debug-node-alias',
    definition: {
      describe: 'Enable default jvm debug port (5005) for the given node id',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly outputDir: CommandFlag = {
    constName: 'outputDir',
    name: 'output-dir',
    definition: {
      describe: 'Path to the directory where the command context will be saved to',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptOutputDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.outputDir.definition.defaultValue as boolean,
        'Enter path to directory to store the temporary context file',
        null,
        Flags.outputDir.name,
      );
    },
  };

  public static readonly inputDir: CommandFlag = {
    constName: 'inputDir',
    name: 'input-dir',
    definition: {
      describe: 'Path to the directory where the command context will be loaded from',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptInputDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.inputDir.definition.defaultValue as boolean,
        'Enter path to directory containing the temporary context file',
        null,
        Flags.inputDir.name,
      );
    },
  };

  public static readonly adminKey: CommandFlag = {
    constName: 'adminKey',
    name: 'admin-key',
    definition: {
      describe: 'Admin key',
      defaultValue: constants.GENESIS_KEY,
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly adminPublicKeys: CommandFlag = {
    constName: 'adminPublicKeys',
    name: 'admin-public-keys',
    definition: {
      describe: 'Comma separated list of DER encoded ED25519 public keys and must match the order of the node aliases',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly quiet: CommandFlag = {
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

  public static readonly mirrorNodeVersion: CommandFlag = {
    constName: 'mirrorNodeVersion',
    name: 'mirror-node-version',
    definition: {
      describe: 'Mirror node chart version',
      defaultValue: version.MIRROR_NODE_VERSION,
      type: 'string',
    },
    prompt: async function promptMirrorNodeVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.mirrorNodeVersion.definition.defaultValue as boolean,
        'Would you like to choose mirror node version? ',
        null,
        Flags.mirrorNodeVersion.name,
      );
    },
  };

  public static readonly enableIngress: CommandFlag = {
    constName: 'enableIngress',
    name: 'enable-ingress',
    definition: {
      describe: 'enable ingress on the component/pod',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly mirrorStaticIp: CommandFlag = {
    constName: 'mirrorStaticIp',
    name: 'mirror-static-ip',
    definition: {
      describe: 'static IP address for the mirror node',
      defaultValue: '',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly hederaExplorerVersion: CommandFlag = {
    constName: 'hederaExplorerVersion',
    name: 'hedera-explorer-version',
    definition: {
      describe: 'Hedera explorer chart version',
      defaultValue: version.HEDERA_EXPLORER_VERSION,
      type: 'string',
    },
    prompt: async function promptHederaExplorerVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.promptToggle(
        task,
        input,
        Flags.hederaExplorerVersion.definition.defaultValue as boolean,
        'Would you like to choose hedera explorer version? ',
        null,
        Flags.hederaExplorerVersion.name,
      );
    },
  };

  public static readonly userEmailAddress: CommandFlag = {
    constName: 'userEmailAddress',
    name: 'email',
    definition: {
      defaultValue: 'john@doe.com',
      describe: 'User email address used for local configuration',
      type: 'string',
    },
    prompt: async function promptUserEmailAddress(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      if (input?.length) {
        return input;
      }

      const promptForInput = async () => {
        return await task.prompt(ListrInquirerPromptAdapter).run(inputPrompt, {
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

  public static readonly context: CommandFlag = {
    constName: 'context',
    name: 'context',
    definition: {
      describe: 'The Kubernetes context name to be used',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptContext(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string[],
      cluster?: string,
    ): Promise<string> {
      return (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
        message: 'Select kubectl context' + (cluster ? ` to be associated with cluster: ${cluster}` : ''),
        choices: input,
      })) as string;
    },
  };

  public static readonly deployment: CommandFlag = {
    constName: 'deployment',
    name: 'deployment',
    definition: {
      describe: 'The name the user will reference locally to link to a deployment',
      alias: 'd',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptDeployment(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.deployment.definition.defaultValue as string,
        'Enter the name of the deployment:',
        null,
        Flags.deployment.name,
      );
    },
  };

  public static readonly deploymentClusters: CommandFlag = {
    constName: 'deploymentClusters',
    name: 'deployment-clusters',
    definition: {
      describe: 'Solo deployment cluster list (comma separated)',
      type: 'string',
    },
    prompt: async function promptDeploymentClusters(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.deploymentClusters.definition.defaultValue as string,
        'Enter the Solo deployment cluster names (comma separated): ',
        null,
        Flags.deploymentClusters.name,
      );
    },
  };

  public static readonly pinger: CommandFlag = {
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

  public static readonly grpcTlsCertificatePath: CommandFlag = {
    constName: 'grpcTlsCertificatePath',
    name: 'grpc-tls-cert',
    definition: {
      describe:
        'TLS Certificate path for the gRPC ' +
        '(e.g. "node1=/Users/username/node1-grpc.cert" ' +
        'with multiple nodes comma separated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcTlsCertificatePath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcTlsCertificatePath.definition.defaultValue as string,
        'Enter node alias and path to TLS certificate for gRPC (ex. nodeAlias=path )',
        null,
        Flags.grpcTlsCertificatePath.name,
      );
    },
  };

  public static readonly grpcWebTlsCertificatePath: CommandFlag = {
    constName: 'grpcWebTlsCertificatePath',
    name: 'grpc-web-tls-cert',
    definition: {
      describe:
        'TLS Certificate path for gRPC Web ' +
        '(e.g. "node1=/Users/username/node1-grpc-web.cert" ' +
        'with multiple nodes comma separated)',
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsCertificatePath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcWebTlsCertificatePath.definition.defaultValue as string,
        'Enter node alias and path to TLS certificate for gGRPC web (ex. nodeAlias=path )',
        null,
        Flags.grpcWebTlsCertificatePath.name,
      );
    },
  };

  public static readonly useExternalDatabase: CommandFlag = {
    constName: 'useExternalDatabase',
    name: 'use-external-database',
    definition: {
      describe:
        'Set to true if you have an external database to use instead of the database that the Mirror Node Helm chart supplies',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  //* ----------------- External Mirror Node PostgreSQL Database Related Flags ------------------ *//

  public static readonly externalDatabaseHost: CommandFlag = {
    constName: 'externalDatabaseHost',
    name: 'external-database-host',
    definition: {
      describe: `Use to provide the external database host if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.externalDatabaseHost.definition.defaultValue as string,
        'Enter host of the external database',
        null,
        Flags.externalDatabaseHost.name,
      );
    },
  };

  public static readonly externalDatabaseOwnerUsername: CommandFlag = {
    constName: 'externalDatabaseOwnerUsername',
    name: 'external-database-owner-username',
    definition: {
      describe: `Use to provide the external database owner's username if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.externalDatabaseOwnerUsername.definition.defaultValue as string,
        'Enter username of the external database owner',
        null,
        Flags.externalDatabaseOwnerUsername.name,
      );
    },
  };

  public static readonly externalDatabaseOwnerPassword: CommandFlag = {
    constName: 'externalDatabaseOwnerPassword',
    name: 'external-database-owner-password',
    definition: {
      describe: `Use to provide the external database owner's password if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.externalDatabaseOwnerPassword.definition.defaultValue as string,
        'Enter password of the external database owner',
        null,
        Flags.externalDatabaseOwnerPassword.name,
      );
    },
  };

  public static readonly externalDatabaseReadonlyUsername: CommandFlag = {
    constName: 'externalDatabaseReadonlyUsername',
    name: 'external-database-read-username',
    definition: {
      describe: `Use to provide the external database readonly user's username if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.externalDatabaseReadonlyUsername.definition.defaultValue as string,
        'Enter username of the external database readonly user',
        null,
        Flags.externalDatabaseReadonlyUsername.name,
      );
    },
  };

  public static readonly externalDatabaseReadonlyPassword: CommandFlag = {
    constName: 'externalDatabaseReadonlyPassword',
    name: 'external-database-read-password',
    definition: {
      describe: `Use to provide the external database readonly user's password if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.externalDatabaseReadonlyPassword.definition.defaultValue as string,
        'Enter password of the external database readonly user',
        null,
        Flags.externalDatabaseReadonlyPassword.name,
      );
    },
  };

  //* ------------------------------------------------------------------------------------------- *//

  public static readonly grpcTlsKeyPath: CommandFlag = {
    constName: 'grpcTlsKeyPath',
    name: 'grpc-tls-key',
    definition: {
      describe:
        'TLS Certificate key path for the gRPC ' +
        '(e.g. "node1=/Users/username/node1-grpc.key" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptGrpcTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcTlsKeyPath.definition.defaultValue as string,
        'Enter node alias and path to TLS certificate key for gRPC (ex. nodeAlias=path )',
        null,
        Flags.grpcTlsKeyPath.name,
      );
    },
  };

  public static readonly grpcWebTlsKeyPath: CommandFlag = {
    constName: 'grpcWebTlsKeyPath',
    name: 'grpc-web-tls-key',
    definition: {
      describe:
        'TLC Certificate key path for gRPC Web ' +
        '(e.g. "node1=/Users/username/node1-grpc-web.key" ' +
        'with multiple nodes comma seperated)',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.promptText(
        task,
        input,
        Flags.grpcWebTlsKeyPath.definition.defaultValue as string,
        'Enter node alias and path to TLS certificate key for gGRPC Web (ex. nodeAlias=path )',
        null,
        Flags.grpcWebTlsKeyPath.name,
      );
    },
  };

  public static readonly stakeAmounts: CommandFlag = {
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

  public static readonly haproxyIps: CommandFlag = {
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

  public static readonly envoyIps: CommandFlag = {
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

  public static readonly storageType: CommandFlag = {
    constName: 'storageType',
    name: 'storage-type',
    definition: {
      defaultValue: constants.StorageType.MINIO_ONLY,
      describe:
        'storage type for saving stream files, available options are minio_only, aws_only, gcs_only, aws_and_gcs',
      type: 'StorageType',
    },
    prompt: undefined,
  };

  public static readonly gcsWriteAccessKey: CommandFlag = {
    constName: 'gcsWriteAccessKey',
    name: 'gcs-write-access-key',
    definition: {
      defaultValue: '',
      describe: 'gcs storage access key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly gcsWriteSecrets: CommandFlag = {
    constName: 'gcsWriteSecrets',
    name: 'gcs-write-secrets',
    definition: {
      defaultValue: '',
      describe: 'gcs storage secret key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly gcsEndpoint: CommandFlag = {
    constName: 'gcsEndpoint',
    name: 'gcs-endpoint',
    definition: {
      defaultValue: '',
      describe: 'gcs storage endpoint URL',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly gcsBucket: CommandFlag = {
    constName: 'gcsBucket',
    name: 'gcs-bucket',
    definition: {
      defaultValue: '',
      describe: 'name of gcs storage bucket',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly gcsBucketPrefix: CommandFlag = {
    constName: 'gcsBucketPrefix',
    name: 'gcs-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of google storage bucket',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly awsWriteAccessKey: CommandFlag = {
    constName: 'awsWriteAccessKey',
    name: 'aws-write-access-key',
    definition: {
      defaultValue: '',
      describe: 'aws storage access key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly awsWriteSecrets: CommandFlag = {
    constName: 'awsWriteSecrets',
    name: 'aws-write-secrets',
    definition: {
      defaultValue: '',
      describe: 'aws storage secret key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly awsEndpoint: CommandFlag = {
    constName: 'awsEndpoint',
    name: 'aws-endpoint',
    definition: {
      defaultValue: '',
      describe: 'aws storage endpoint URL',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly awsBucket: CommandFlag = {
    constName: 'awsBucket',
    name: 'aws-bucket',
    definition: {
      defaultValue: '',
      describe: 'name of aws storage bucket',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly awsBucketPrefix: CommandFlag = {
    constName: 'awsBucketPrefix',
    name: 'aws-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of aws storage bucket',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly backupBucket: CommandFlag = {
    constName: 'backupBucket',
    name: 'backup-bucket',
    definition: {
      defaultValue: '',
      describe: 'name of bucket for backing up state files',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly backupWriteAccessKey: CommandFlag = {
    constName: 'backupWriteAccessKey',
    name: 'backup-write-access-key',
    definition: {
      defaultValue: '',
      describe: 'backup storage access key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly backupWriteSecrets: CommandFlag = {
    constName: 'backupWriteSecrets',
    name: 'backup-write-secrets',
    definition: {
      defaultValue: '',
      describe: 'backup storage secret key for write access',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly backupEndpoint: CommandFlag = {
    constName: 'backupEndpoint',
    name: 'backup-endpoint',
    definition: {
      defaultValue: '',
      describe: 'backup storage endpoint URL',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly backupRegion: CommandFlag = {
    constName: 'backupRegion',
    name: 'backup-region',
    definition: {
      defaultValue: 'us-central1',
      describe: 'backup storage region',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly backupProvider: CommandFlag = {
    constName: 'backupProvider',
    name: 'backup-provider',
    definition: {
      defaultValue: 'GCS',
      describe: 'backup storage service provider, GCS or AWS',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly storageReadAccessKey: CommandFlag = {
    constName: 'storageReadAccessKey',
    name: 'storage-read-access-key',
    definition: {
      defaultValue: '',
      describe: 'storage read access key for mirror node importer',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly storageReadSecrets: CommandFlag = {
    constName: 'storageReadSecrets',
    name: 'storage-read-secrets',
    definition: {
      defaultValue: '',
      describe: 'storage read-secret key for mirror node importer',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly storageEndpoint: CommandFlag = {
    constName: 'storageEndpoint',
    name: 'storage-endpoint',
    definition: {
      defaultValue: '',
      describe: 'storage endpoint URL for mirror node importer',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly storageBucket: CommandFlag = {
    constName: 'storageBucket',
    name: 'storage-bucket',
    definition: {
      defaultValue: '',
      describe: 'name of storage bucket for mirror node importer',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
    prompt: undefined,
  };

  public static readonly storageBucketPrefix: CommandFlag = {
    constName: 'storageBucketPrefix',
    name: 'storage-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of storage bucket mirror node importer',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly storageBucketRegion: CommandFlag = {
    constName: 'storageBucketRegion',
    name: 'storage-bucket-region',
    definition: {
      defaultValue: '',
      describe: 'region of storage bucket mirror node importer',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly loadBalancerEnabled: CommandFlag = {
    constName: 'loadBalancerEnabled',
    name: 'load-balancer',
    definition: {
      describe: 'Enable load balancer for network node proxies',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  // --------------- Add Cluster --------------- //

  public static readonly enableCertManager: CommandFlag = {
    constName: 'enableCertManager',
    name: 'enable-cert-manager',
    definition: {
      describe: 'Pass the flag to enable cert manager',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly numberOfConsensusNodes: CommandFlag = {
    constName: 'numberOfConsensusNodes',
    name: 'num-consensus-nodes',
    definition: {
      describe: 'Used to specify desired number of consensus nodes for pre-genesis deployments',
      type: 'number',
    },
    prompt: async function (task: SoloListrTaskWrapper<AnyListrContext>, input: number): Promise<number> {
      const promptForInput = (): Promise<number> =>
        Flags.prompt(
          'number',
          task,
          input,
          Flags.numberOfConsensusNodes.definition.defaultValue,
          `Enter number of consensus nodes to add to the provided cluster ${chalk.grey('(must be a positive number)')}:`,
          null,
          Flags.numberOfConsensusNodes.name,
        );

      input = await promptForInput();
      while (!input) {
        input = await promptForInput();
      }

      return input;
    },
  };

  public static readonly dnsBaseDomain: CommandFlag = {
    constName: 'dnsBaseDomain',
    name: 'dns-base-domain',
    definition: {
      describe: 'Base domain for the DNS is the suffix used to construct the fully qualified domain name (FQDN)',
      defaultValue: 'cluster.local',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly dnsConsensusNodePattern: CommandFlag = {
    constName: 'dnsConsensusNodePattern',
    name: 'dns-consensus-node-pattern',
    definition: {
      describe:
        'Pattern to construct the prefix for the fully qualified domain name (FQDN) for the consensus node, ' +
        'the suffix is provided by the --dns-base-domain option (ex. network-{nodeAlias}-svc.{namespace}.svc)',
      defaultValue: 'network-{nodeAlias}-svc.{namespace}.svc',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly domainName: CommandFlag = {
    constName: 'domainName',
    name: 'domain-name',
    definition: {
      describe: 'Custom domain name',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly domainNames: CommandFlag = {
    constName: 'domainNames',
    name: 'domain-names',
    definition: {
      describe:
        'Custom domain names for consensus nodes mapping for the' +
        `${chalk.gray('(e.g. node0=domain.name where key is node alias and value is domain name)')}` +
        'with multiple nodes comma seperated',
      type: 'string',
    },
    prompt: undefined,
  };

  public static readonly allFlags: CommandFlag[] = [
    Flags.accountId,
    Flags.adminKey,
    Flags.adminPublicKeys,
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
    Flags.clusterRef,
    Flags.clusterSetupNamespace,
    Flags.context,
    Flags.createAmount,
    Flags.debugNodeAlias,
    Flags.deletePvcs,
    Flags.deleteSecrets,
    Flags.deployCertManager,
    Flags.deployCertManagerCrds,
    Flags.deployJsonRpcRelay,
    Flags.deployMinio,
    Flags.deployPrometheusStack,
    Flags.deployment,
    Flags.deploymentClusters,
    Flags.devMode,
    Flags.ecdsaPrivateKey,
    Flags.ed25519PrivateKey,
    Flags.enableIngress,
    Flags.enableHederaExplorerTls,
    Flags.enablePrometheusSvcMonitor,
    Flags.enableTimeout,
    Flags.endpointType,
    Flags.envoyIps,
    Flags.forcePortForward,
    Flags.generateEcdsaKey,
    Flags.generateGossipKeys,
    Flags.generateTlsKeys,
    Flags.genesisThrottlesFile,
    Flags.gossipEndpoints,
    Flags.gossipPrivateKey,
    Flags.gossipPublicKey,
    Flags.grpcEndpoints,
    Flags.grpcTlsCertificatePath,
    Flags.grpcTlsKeyPath,
    Flags.grpcWebTlsCertificatePath,
    Flags.grpcWebTlsKeyPath,
    Flags.haproxyIps,
    Flags.ingressControllerValueFile,
    Flags.hederaExplorerTlsHostName,
    Flags.hederaExplorerStaticIp,
    Flags.hederaExplorerVersion,
    Flags.inputDir,
    Flags.loadBalancerEnabled,
    Flags.localBuildPath,
    Flags.log4j2Xml,
    Flags.mirrorNodeVersion,
    Flags.mirrorStaticIp,
    Flags.mirrorNamespace,
    Flags.namespace,
    Flags.networkDeploymentValuesFile,
    Flags.newAccountNumber,
    Flags.newAdminKey,
    Flags.nodeAlias,
    Flags.nodeAliasesUnparsed,
    Flags.operatorId,
    Flags.operatorKey,
    Flags.outputDir,
    Flags.persistentVolumeClaims,
    Flags.pinger,
    Flags.privateKey,
    Flags.profileFile,
    Flags.profileName,
    Flags.quiet,
    Flags.relayReleaseTag,
    Flags.releaseTag,
    Flags.replicaCount,
    Flags.setAlias,
    Flags.settingTxt,
    Flags.soloChartVersion,
    Flags.stakeAmounts,
    Flags.stateFile,
    Flags.storageType,
    Flags.gcsWriteAccessKey,
    Flags.gcsWriteSecrets,
    Flags.gcsEndpoint,
    Flags.gcsBucket,
    Flags.gcsBucketPrefix,
    Flags.awsWriteAccessKey,
    Flags.awsWriteSecrets,
    Flags.awsEndpoint,
    Flags.awsBucket,
    Flags.awsBucketPrefix,
    Flags.storageReadAccessKey,
    Flags.storageReadSecrets,
    Flags.storageEndpoint,
    Flags.storageBucket,
    Flags.storageBucketPrefix,
    Flags.storageBucketRegion,
    Flags.backupBucket,
    Flags.backupWriteAccessKey,
    Flags.backupWriteSecrets,
    Flags.backupEndpoint,
    Flags.backupRegion,
    Flags.backupProvider,
    Flags.tlsClusterIssuerType,
    Flags.tlsPrivateKey,
    Flags.tlsPublicKey,
    Flags.updateAccountKeys,
    Flags.upgradeZipFile,
    Flags.userEmailAddress,
    Flags.valuesFile,
    Flags.useExternalDatabase,
    Flags.externalDatabaseHost,
    Flags.externalDatabaseOwnerUsername,
    Flags.externalDatabaseOwnerPassword,
    Flags.externalDatabaseReadonlyUsername,
    Flags.externalDatabaseReadonlyPassword,
    Flags.enableCertManager,
    Flags.numberOfConsensusNodes,
    Flags.dnsBaseDomain,
    Flags.dnsConsensusNodePattern,
    Flags.domainName,
    Flags.domainNames,
  ];

  /** Resets the definition.disablePrompt for all flags */
  private static resetDisabledPrompts() {
    for (const f of Flags.allFlags) {
      if (f.definition.disablePrompt) {
        delete f.definition.disablePrompt;
      }
    }
  }

  public static readonly allFlagsMap = new Map(Flags.allFlags.map(f => [f.name, f]));

  public static readonly nodeConfigFileFlags = new Map(
    [
      Flags.apiPermissionProperties,
      Flags.applicationEnv,
      Flags.applicationProperties,
      Flags.bootstrapProperties,
      Flags.log4j2Xml,
      Flags.settingTxt,
    ].map(f => [f.name, f]),
  );

  public static readonly integerFlags = new Map([Flags.replicaCount].map(f => [f.name, f]));

  public static readonly DEFAULT_FLAGS = {
    required: [],
    optional: [Flags.namespace, Flags.cacheDir, Flags.releaseTag, Flags.devMode, Flags.quiet],
  };

  /**
   * Processes the Argv arguments and returns them as string, all with full flag names.
   * - removes flags that match the default value.
   * - removes flags with undefined and null values.
   * - removes boolean flags that are false.
   * - masks all sensitive flags with their dataMask property.
   */
  public static stringifyArgv(argv: AnyObject): string {
    const processedFlags: string[] = [];

    for (const [name, value] of Object.entries(argv)) {
      // Remove non-flag data and boolean presence based flags that are false
      if (name === '_' || name === '$0' || value === '' || value === false || value === undefined || value === null) {
        continue;
      }

      // remove flags that use the default value
      const flag = Flags.allFlags.find(flag => flag.name === name);
      if (!flag || (flag.definition.defaultValue && flag.definition.defaultValue === value)) {
        continue;
      }

      const flagName = flag.name;

      // if the flag is boolean based, render it without value
      if (value === true) {
        processedFlags.push(`--${flagName}`);
      }

      // if the flag's data is masked, display it without the value
      else if (flag.definition.dataMask) {
        processedFlags.push(`--${flagName} ${flag.definition.dataMask}`);
      }

      // else display the full flag data
      else {
        processedFlags.push(`--${flagName} ${value}`);
      }
    }

    return processedFlags.join(' ');
  }
}
