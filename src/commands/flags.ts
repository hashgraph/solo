// SPDX-License-Identifier: Apache-2.0

import {IllegalArgumentError} from '../core/errors/classes/validation/illegal-argument-error.js';
import * as constants from '../core/constants.js';
import * as version from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Definition} from '../types/definition.js';
import {Deprecations} from '../core/deprecations.js';
import fs from 'node:fs';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {
  select as selectPrompt,
  input as inputPrompt,
  number as numberPrompt,
  confirm as confirmPrompt,
} from '@inquirer/prompts';
import {type AnyListrContext, type AnyObject, type AnyYargs} from '../types/aliases.js';
import {type ClusterReferenceName} from '../types/index.js';
import {type Optional, type SoloListrTaskWrapper} from '../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FlagRules} from './validation/flag-rules.js';
import {FlagValidation} from './validation/flag-validation.js';

const TLS_CLUSTER_ISSUER_TYPES: string[] = ['acme-staging', 'acme-prod', 'self-signed'];

export class Flags {
  public static KEY_COMMON: string = '_COMMON_';

  private static async prompt(
    type: 'toggle' | 'input' | 'number',
    task: SoloListrTaskWrapper<AnyListrContext>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    flag: CommandFlag,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    try {
      let isMissing: boolean = type === 'toggle' ? typeof input !== 'boolean' : !input;
      isMissing = type === 'number' ? typeof input !== 'number' : isMissing;

      if (isMissing) {
        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          // this is to help find issues with prompts running in non-interactive mode, user should supply quite mode,
          // or provide all flags required for command
          throw new SoloErrors.validation.nonInteractivePrompt(Flags.getFormattedFlagKey(flag));
        }

        const promptOptions: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          default: Optional<any>;
          message: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validate?: (candidate: any) => boolean | string;
        } = {
          default: flag.definition.promptDefaultValue ?? flag.definition.defaultValue,
          message: flag.definition.promptText,
          validate: (candidate: unknown): boolean | string => FlagValidation.violationOf(flag, candidate) ?? true,
        };

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

      if (flag.definition.emptyCheckMessage && !input) {
        throw new SoloErrors.validation.missingArgument(flag.definition.emptyCheckMessage);
      }

      return input;
    } catch (error) {
      throw new SoloErrors.validation.flagInputFailed(flag.name, error);
    }
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
   * Translates a flag {@link Definition} into the options object yargs understands. The structured
   * {@link Definition.deprecated} metadata is reduced to yargs' native boolean `deprecated` marker, so the
   * rich object never reaches yargs and `--help` renders a bare `[deprecated]` instead of an annotation wide
   * enough to distort the option table. The version window, replacement, and tracking issue remain available
   * in the warning printed when the flag is used and in the generated "Deprecated Features" table.
   *
   * A deprecation scoped to specific commands is marked only on those commands; the flag renders without the
   * annotation everywhere else, including where the caller does not know its command path.
   */
  private static toYargsOptions(definition: Definition, commandPath: string = ''): AnyObject {
    const {deprecated, ...yargsOptions}: Definition = definition;
    return deprecated && Deprecations.appliesToCommand(deprecated, commandPath)
      ? {...yargsOptions, deprecated: true}
      : {...yargsOptions};
  }

  /**
   * Set flag from the flag option
   * @param y instance of yargs
   * @param commandFlags a set of command flags
   * @param commandPath the command the flags are being registered for, e.g. `relay node add`; supplied so
   *   that a flag deprecated only for certain commands is marked deprecated only there
   */
  public static setRequiredCommandFlags(y: AnyYargs, commandFlags: CommandFlag[], commandPath?: string): void {
    for (const flag of commandFlags) {
      y.option(flag.name, {...Flags.toYargsOptions(flag.definition, commandPath), demandOption: true});
    }
  }

  /**
   * Set flag from the flag option
   * @param y instance of yargs
   * @param commandFlags a set of command flags
   * @param commandPath the command the flags are being registered for, e.g. `relay node add`; supplied so
   *   that a flag deprecated only for certain commands is marked deprecated only there
   */
  public static setOptionalCommandFlags(y: AnyYargs, commandFlags: CommandFlag[], commandPath?: string): void {
    for (const flag of commandFlags) {
      const defaultValue: string | number | boolean =
        flag.definition.defaultValue === '' ? undefined : flag.definition.defaultValue;
      y.option(flag.name, {
        ...Flags.toYargsOptions(flag.definition, commandPath),
        default: defaultValue,
      });
    }
  }

  // TODO(#1560): `--dev` was renamed to `--debug` and deprecated on 2026-06-30. The `dev` alias is
  //  retained only for backwards compatibility and should be removed once the first LTS release that
  //  ships this deprecation reaches end-of-life (see README "Current Releases" / legacy-versions.md).
  public static readonly debugMode: CommandFlag = {
    constName: 'debugMode',
    name: 'debug',
    definition: {
      describe: 'Enable debug mode',
      alias: 'dev',
      defaultValue: constants.SOLO_DEV_OUTPUT,
      type: 'boolean',
    },
  };

  public static readonly check: CommandFlag = {
    constName: 'check',
    name: 'check',
    definition: {
      describe: 'Fail if any configured remote port-forward is not reachable locally',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly predefinedAccounts: CommandFlag = {
    constName: 'predefinedAccounts',
    name: 'predefined-accounts',
    definition: {
      describe: 'Create predefined accounts on network creation',
      defaultValue: true,
      type: 'boolean',
    },
  };

  public static readonly forcePortForward: CommandFlag = {
    constName: 'forcePortForward',
    name: 'force-port-forward',
    definition: {
      describe: 'Force port forward to access the network services',
      defaultValue: true, // always use local port-forwarding by default
      type: 'boolean',
      promptText: 'Force port forwarding? ',
    },
    prompt: async function promptForcePortForward(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.forcePortForward);
    },
  };

  public static readonly externalAddress: CommandFlag = {
    constName: 'externalAddress',
    name: 'external-address',
    definition: {
      describe: 'Bind address for kubectl port-forward (for example 127.0.0.1 or 0.0.0.0)',
      type: 'string',
    },
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
      promptText: 'Enter cluster reference: ',
      emptyCheckMessage: 'cluster reference cannot be empty',
    },
    prompt: async function promptClusterReference(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.clusterRef);
    },
    rules: [FlagRules.each(FlagRules.clusterReference)],
  };

  public static readonly clusterSetupNamespace: CommandFlag = {
    constName: 'clusterSetupNamespace',
    name: 'cluster-setup-namespace',
    definition: {
      describe: 'Cluster Setup Namespace',
      defaultValue: constants.SOLO_SETUP_NAMESPACE.name,
      alias: 's',
      type: 'string',
      promptText: 'Enter cluster setup namespace name: ',
      promptDefaultValue: 'solo-cluster',
      emptyCheckMessage: 'cluster setup namespace cannot be empty',
    },
    prompt: async function promptClusterSetupNamespace(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.clusterSetupNamespace);
    },
    rules: [FlagRules.dnsLabel],
  };

  public static readonly namespace: CommandFlag = {
    constName: 'namespace',
    name: 'namespace',
    definition: {
      describe: 'Namespace',
      alias: 'n',
      type: 'string',
      promptText: 'Enter namespace name: ',
      promptDefaultValue: 'solo',
      emptyCheckMessage: 'namespace cannot be empty',
    },
    prompt: async function promptNamespace(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.namespace);
    },
    rules: [FlagRules.dnsLabel],
  };

  public static readonly mirrorNamespace: CommandFlag = {
    constName: 'mirrorNamespace',
    name: 'mirror-namespace',
    definition: {
      describe: 'Namespace to use for the Mirror Node deployment, a new one will be created if it does not exist',
      type: 'string',
    },
    rules: [FlagRules.dnsLabel],
  };

  /**
   * Parse the values files input string that includes the cluster reference and the values file path
   * <p>It supports input as below:
   * <p>--values-file aws-cluster=aws/solo-values.yaml,aws-cluster=aws/solo-values2.yaml,gcp-cluster=gcp/solo-values.yaml,gcp-cluster=gcp/solo-values2.yaml
   * @param input
   */
  public static parseValuesFilesInput(input: string): Record<ClusterReferenceName, Array<string>> {
    const valuesFiles: Record<ClusterReferenceName, Array<string>> = {};
    if (input) {
      const inputItems: string[] = input.split(',');
      for (const v of inputItems) {
        const parts: string[] = v.split('=');

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
      describe: 'Comma separated chart values files, each in YAML or JSON format',
      defaultValue: '',
      alias: 'f',
      type: 'string',
    },
    prompt: async function promptValuesFile(_: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return input; // no prompt is needed for values file
    },
  };

  public static readonly outputValuesFile: CommandFlag = {
    constName: 'outputValuesFile',
    name: 'output-values-file',
    definition: {
      describe:
        'Output path for the generated falcon values YAML file. ' +
        'Defaults to ~/.solo/cache/falcon-values.yaml. Relative paths are resolved against the current working directory.',
      defaultValue: PathEx.join(constants.SOLO_CACHE_DIR, 'falcon-values.yaml'),
      type: 'string',
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
    prompt: async function promptValuesFile(_: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      if (input) {
        Flags.parseValuesFilesInput(input); // validate input as early as possible by parsing it
      }

      return input; // no prompt is needed for values file
    },
  };

  public static readonly deployPrometheusStack: CommandFlag = {
    constName: 'deployPrometheusStack',
    name: 'prometheus-stack',
    definition: {
      describe: 'Deploy prometheus stack',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to deploy prometheus stack? ',
    },
    prompt: async function promptDeployPrometheusStack(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deployPrometheusStack);
    },
  };

  public static readonly deployMinio: CommandFlag = {
    constName: 'deployMinio',
    name: 'minio',
    definition: {
      describe: 'Deploy minio operator',
      defaultValue: true,
      type: 'boolean',
      promptText: 'Would you like to deploy MinIO? ',
    },
    prompt: async function promptDeployMinio(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deployMinio);
    },
  };

  public static readonly deployMetricsServer: CommandFlag = {
    constName: 'deployMetricsServer',
    name: 'metrics-server',
    definition: {
      describe: 'Deploy metrics server to enable kubectl top for CPU and memory usage monitoring',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly deployCertManager: CommandFlag = {
    constName: 'deployCertManager',
    name: 'cert-manager',
    definition: {
      describe: 'Deploy cert manager, also deploys acme-cluster-issuer',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to deploy Cert Manager? ',
    },
    prompt: async function promptDeployCertManager(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deployCertManager);
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
      promptText: 'Would you like to deploy Cert Manager CRDs? ',
    },
    prompt: async function promptDeployCertManagerCrds(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deployCertManagerCrds);
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
  };

  public static readonly stateFile: CommandFlag = {
    constName: 'stateFile',
    name: 'state-file',
    definition: {
      describe: 'A zipped state file to be used for the network',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly upgradeZipFile: CommandFlag = {
    constName: 'upgradeZipFile',
    name: 'upgrade-zip-file',
    definition: {
      describe: 'A zipped file used for network upgrade',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly releaseTag: CommandFlag = {
    constName: 'releaseTag',
    name: 'release-tag',
    definition: {
      describe: `Consensus node release tag (e.g. ${version.HEDERA_PLATFORM_VERSION})`,
      alias: 't',
      defaultValue: version.HEDERA_PLATFORM_VERSION,
      type: 'string',
      deprecated: {since: '0.85.0', removalIssue: 5387, replacement: '--consensus-node-version'},
      promptText: 'Enter release version: ',
    },
    prompt: async function promptReleaseTag(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.releaseTag);
    },
  };

  public static readonly upgradeVersion: CommandFlag = {
    constName: 'upgradeVersion',
    name: 'upgrade-version',
    definition: {
      describe: 'Version to be used for the upgrade',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly freezeBlockDrainSeconds: CommandFlag = {
    constName: 'freezeBlockDrainSeconds',
    name: 'freeze-block-drain-seconds',
    definition: {
      describe:
        'Seconds to wait after consensus nodes reach FREEZE_COMPLETE before stopping them, allowing the block stream to drain to the block node',
      defaultValue: 20,
      type: 'number',
    },
    prompt: undefined,
  };

  public static readonly skipNodeStart: CommandFlag = {
    constName: 'skipNodeStart',
    name: 'skip-node-start',
    definition: {
      describe: 'Skip starting consensus nodes after staging a freeze upgrade',
      defaultValue: false,
      type: 'boolean',
    },
    prompt: undefined,
  };

  public static readonly imageTag: CommandFlag = {
    constName: 'imageTag',
    name: 'image-tag',
    definition: {
      describe: 'Overrides the Docker image tag (e.g. 0.36.0-SNAPSHOT).',
      defaultValue: '',
      type: 'string',
      deprecated: {since: '0.85.0', removalIssue: 5385, replacement: '--component-image'},
    },
  };

  public static readonly componentImage: CommandFlag = {
    constName: 'componentImage',
    name: 'component-image',
    definition: {
      describe:
        'Docker image override. Supports a published registry reference (e.g. ghcr.io/hiero-ledger/component:1.2.3), ' +
        'a locally built image (e.g. component:1.2.3), or a Kind-attached local registry ' +
        '(e.g. localhost:5001/component:1.2.3). Locally available images are loaded into every target Kind ' +
        'cluster and use pullPolicy: Never. For non-Kind targets, publish the image to a registry reachable by the cluster.',
      defaultValue: '',
      type: 'string',
      alias: 'relay-image',
    },
  };

  public static readonly cacheDir: CommandFlag = {
    constName: 'cacheDir',
    name: 'cache-dir',
    definition: {
      describe: 'Local cache directory',
      defaultValue: constants.SOLO_CACHE_DIR,
      type: 'string',
      promptText: 'Enter local cache directory path: ',
    },
    prompt: async function promptCacheDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.cacheDir);
    },
  };

  public static readonly nodeAliasesUnparsed: CommandFlag = {
    constName: 'nodeAliasesUnparsed',
    name: 'node-aliases',
    definition: {
      describe: 'Comma separated node aliases (empty means all nodes)',
      alias: 'i',
      type: 'string',
      promptText: 'Enter list of node IDs (comma separated list): ',
      promptDefaultValue: 'node1,node2,node3',
    },
    prompt: async function promptNodeAliases(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.nodeAliasesUnparsed);
    },
    rules: [FlagRules.each(FlagRules.nodeAlias)],
  };

  public static readonly force: CommandFlag = {
    constName: 'force',
    name: 'force',
    definition: {
      describe: 'Force actions even if those can be skipped',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to force changes? ',
    },
    prompt: async function promptForce(task: SoloListrTaskWrapper<AnyListrContext>, input: boolean): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.force);
    },
  };

  public static readonly forceBlockNodeIntegration: CommandFlag = {
    constName: 'forceBlockNodeIntegration',
    name: 'force',
    definition: {
      describe:
        'Force enable block node integration bypassing the version requirements CN >= v0.72.0, BN >= 0.29.0, CN >= 0.150.0',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly javaFlightRecorderConfiguration: CommandFlag = {
    constName: 'javaFlightRecorderConfiguration',
    name: 'jfr-config',
    definition: {
      describe: 'Java Flight Recorder configuration file path',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly chartDirectory: CommandFlag = {
    constName: 'chartDirectory',
    name: 'chart-dir',
    definition: {
      describe: 'Local chart directory path (e.g. ~/solo-charts/charts)',
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
        throw new SoloErrors.validation.flagInputFailed(Flags.chartDirectory.name, error);
      }
    },
  };

  public static readonly relayChartDirectory: CommandFlag = {
    constName: 'relayChartDirectory',
    name: 'relay-chart-dir',
    definition: {
      describe: 'Relay local chart directory path (e.g. ~/hiero-json-rpc-relay/charts)',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly explorerChartDirectory: CommandFlag = {
    constName: 'explorerChartDirectory',
    name: 'explorer-chart-dir',
    definition: {
      describe: 'Explorer local chart directory path (e.g. ~/hiero-mirror-node-explorer/charts)',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly blockNodeChartDirectory: CommandFlag = {
    constName: 'blockNodeChartDirectory',
    name: 'block-node-chart-dir',
    definition: {
      describe: 'Block node local chart directory path (e.g. ~/hiero-block-node/charts)',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly blockNodeTssOverlay: CommandFlag = {
    constName: 'blockNodeTssOverlay',
    name: 'block-node-tss-overlay',
    definition: {
      describe:
        'Force-apply block-node TSS values overlay when deploying block nodes before consensus deployment sets tssEnabled in remote config.',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly blockNodeMessageSizeSoftLimitBytes: CommandFlag = {
    constName: 'blockNodeMessageSizeSoftLimitBytes',
    name: 'block-node-message-size-soft-limit-bytes',
    definition: {
      describe: 'Soft limit, in bytes, for block node connection message size in block-nodes.json',
      defaultValue: undefined,
      type: 'number',
    },
  };

  public static readonly blockNodeMessageSizeHardLimitBytes: CommandFlag = {
    constName: 'blockNodeMessageSizeHardLimitBytes',
    name: 'block-node-message-size-hard-limit-bytes',
    definition: {
      describe: 'Hard limit, in bytes, for block node connection message size in block-nodes.json',
      defaultValue: undefined,
      type: 'number',
    },
  };

  public static readonly blockNodeMapping: CommandFlag = {
    constName: 'blockNodeIds',
    name: 'block-node-mapping',
    definition: {
      describe: Flags.renderBlockNodeMappingDescription('block-node'),
      type: 'string',
    },
  };

  public static readonly externalBlockNodeMapping: CommandFlag = {
    constName: 'externalBlockNodeIds',
    name: 'external-block-node-mapping',
    definition: {
      describe: Flags.renderBlockNodeMappingDescription('external-block-node'),
      type: 'string',
    },
  };

  public static renderBlockNodeMappingDescription(name: 'block-node' | 'external-block-node'): string {
    return (
      `Configure ${name} priority mapping.` +
      ` Default: all ${name} included, first's priority is 2.` +
      ` Unlisted ${name} will not routed to the consensus node node.` +
      ` Example: --${name}-mapping 1=2,2=1`
    );
  }

  public static readonly mirrorNodeChartDirectory: CommandFlag = {
    constName: 'mirrorNodeChartDirectory',
    name: 'mirror-node-chart-dir',
    definition: {
      describe:
        'Mirror node local chart directory path (e.g. ~/hiero-mirror-node/charts). ' +
        'NOTE: This only provides the Helm chart templates — it does NOT make the chart images available to the cluster. ' +
        'All container images referenced by the chart must already be pullable (e.g. published to a registry or loaded ' +
        'into the cluster with `kind load docker-image`). Using a local branch chart with SNAPSHOT image tags will ' +
        'cause pods to fail with ImagePullBackOff unless those images have been built and pushed to a registry or ' +
        'loaded into the cluster.',
      defaultValue: '',
      type: 'string',
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
      promptText: 'How many replica do you want? ',
    },
    prompt: async function promptReplicaCount(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: number,
    ): Promise<number> {
      return await Flags.prompt('number', task, input, Flags.replicaCount);
    },
    rules: [FlagRules.integer, FlagRules.atLeast(1)],
  };

  public static readonly id: CommandFlag = {
    constName: 'id',
    name: 'id',
    definition: {
      describe: 'The numeric identifier for the component',
      type: 'number',
      promptText: 'Enter component id: ',
    },
    prompt: async function (task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<number> {
      return await Flags.prompt('number', task, input, Flags.id);
    },
  };

  public static readonly grpcWebEndpoints: CommandFlag = {
    constName: 'grpcWebEndpoints',
    name: 'grpc-web-endpoints',
    definition: {
      describe:
        'Configure gRPC Web endpoints mapping, comma separated' +
        `\n(Default port: ${constants.GRPC_WEB_PORT ?? 8080})` +
        '\n(Aliases can be provided explicitly, or inferred by node id order)' +
        '\n[Format: <alias>=<address>[:<port>][,<alias>=<address>[:<port>]]]' +
        '\nExamples:' +
        '\n\tnode1=127.0.0.1:8080,node2=127.0.0.1:8081' +
        '\n\tnode1=localhost,node2=localhost:8081' +
        '\n\tlocalhost,127.0.0.2:8081',
      type: 'string',
    },
  };

  public static readonly grpcWebEndpoint: CommandFlag = {
    constName: 'grpcWebEndpoint',
    name: 'grpc-web-endpoint',
    definition: {
      describe:
        'Configure gRPC Web endpoint' +
        `\n(Default port: ${constants.GRPC_WEB_PORT ?? 8080})` +
        '\n[Format: <address>[:<port>]]',
      type: 'string',
    },
  };

  public static readonly skipGrpcWebEndpoint: CommandFlag = {
    constName: 'skipGrpcWebEndpoint',
    name: 'skip-grpc-web-endpoint',
    definition: {
      describe:
        'Skip submitting the NodeUpdateTransaction that sets the gRPC web proxy endpoint.' +
        '\nUse during restore when the endpoint is already correct in the restored state' +
        ' to avoid triggering TSS re-evaluation.',
      type: 'boolean',
      defaultValue: false,
    },
  };

  public static readonly mirrorNodeId: CommandFlag = {
    constName: 'mirrorNodeId',
    name: 'mirror-node-id',
    definition: {
      describe: 'The id of the mirror node which to connect',
      type: 'number',
      promptText: 'Enter mirror node id: ',
    },
    prompt: async function (task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<number> {
      return await Flags.prompt('number', task, input, Flags.mirrorNodeId);
    },
  };

  public static readonly chainId: CommandFlag = {
    constName: 'chainId',
    name: 'chain-id',
    definition: {
      describe: 'Chain ID',
      // Ref: https://github.com/hiero-ledger/hiero-json-rpc-relay#configuration
      get defaultValue(): string {
        return constants.getEnvironmentVariable('SOLO_CHAIN_ID') ?? '298';
      },
      alias: 'l',
      type: 'string',
      promptText: 'Enter chain ID: ',
    },
    prompt: async function promptChainId(task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.chainId);
    },
  };

  // Ref: https://github.com/hiero-ledger/hiero-json-rpc-relay/blob/main/docs/configuration.md
  public static readonly operatorId: CommandFlag = {
    constName: 'operatorId',
    name: 'operator-id',
    definition: {
      describe: 'Operator ID',
      defaultValue: undefined,
      type: 'string',
      promptText: 'Enter operator ID: ',
    },
    prompt: async function promptOperatorId(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.operatorId);
    },
  };

  // Ref: https://github.com/hiero-ledger/hiero-json-rpc-relay/blob/main/docs/configuration.md
  public static readonly operatorKey: CommandFlag = {
    constName: 'operatorKey',
    name: 'operator-key',
    definition: {
      describe: 'Operator Key',
      defaultValue: undefined,
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
      promptText: 'Enter operator private key: ',
    },
    prompt: async function promptOperatorKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.operatorKey);
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
      promptText: 'Enter the private key: ',
      promptDefaultValue: '',
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.privateKey);
    },
  };

  public static readonly generateGossipKeys: CommandFlag = {
    constName: 'generateGossipKeys',
    name: 'gossip-keys',
    definition: {
      describe: 'Generate gossip keys for nodes',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to generate Gossip keys? ',
    },
    prompt: async function promptGenerateGossipKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.generateGossipKeys);
    },
  };

  public static readonly generateTlsKeys: CommandFlag = {
    constName: 'generateTlsKeys',
    name: 'tls-keys',
    definition: {
      describe: 'Generate gRPC TLS keys for nodes',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to generate TLS keys? ',
    },
    prompt: async function promptGenerateTLSKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.generateTlsKeys);
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
          choices: TLS_CLUSTER_ISSUER_TYPES,
        })) as string;

        return input;
      } catch (error) {
        throw new SoloErrors.validation.flagInputFailed(Flags.tlsClusterIssuerType.name, error);
      }
    },
    rules: [FlagRules.oneOf(...TLS_CLUSTER_ISSUER_TYPES)],
  };

  public static readonly enableExplorerTls: CommandFlag = {
    constName: 'enableExplorerTls',
    name: 'enable-explorer-tls',
    definition: {
      describe:
        'Enable Explorer TLS, defaults to false, requires certManager and certManagerCrds, which can be deployed through solo-cluster-setup chart or standalone',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to enable the Explorer TLS? ',
    },
    prompt: async function promptEnableExplorerTls(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.enableExplorerTls);
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
  };

  public static readonly explorerStaticIp: CommandFlag = {
    constName: 'explorerStaticIp',
    name: 'explorer-static-ip',
    definition: {
      describe: 'The static IP address to use for the Explorer load balancer, defaults to ""',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly explorerTlsHostName: CommandFlag = {
    constName: 'explorerTlsHostName',
    name: 'explorer-tls-host-name',
    definition: {
      describe: 'The host name to use for the Explorer TLS, defaults to "explorer.solo.local"',
      defaultValue: 'explorer.solo.local',
      type: 'string',
      promptText: 'Enter the host name to use for the Explorer TLS: ',
    },
    prompt: async function promptExplorerTlsHostName(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.explorerTlsHostName);
    },
  };

  public static readonly enableMonitoringSupport: CommandFlag = {
    constName: 'enableMonitoringSupport',
    name: 'enable-monitoring-support',
    definition: {
      describe: 'Enables CRDs for Prometheus and Grafana.',
      defaultValue: true,
      type: 'boolean',
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
      promptText: 'Would you like to delete persistent volume claims upon uninstall? ',
    },
    prompt: async function promptDeletePvcs(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deletePvcs);
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
      promptText: 'Would you like to delete secrets upon uninstall? ',
    },
    prompt: async function promptDeleteSecrets(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.deleteSecrets);
    },
  };

  public static readonly soloChartVersion: CommandFlag = {
    constName: 'soloChartVersion',
    name: 'solo-chart-version',
    definition: {
      describe: 'Solo testing chart version',
      defaultValue: version.SOLO_CHART_VERSION,
      type: 'string',
      promptText: 'Enter solo testing chart version: ',
    },
    prompt: async function promptSoloChartVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.soloChartVersion);
    },
  };

  public static readonly blockNodeChartVersion: CommandFlag = {
    constName: 'chartVersion',
    name: 'chart-version',
    definition: {
      describe: 'Block node chart version',
      defaultValue: version.BLOCK_NODE_VERSION,
      type: 'string',
      deprecated: {since: '0.85.0', removalIssue: 5388, replacement: '--block-node-version'},
      promptText: 'Enter block node chart version: ',
    },
    prompt: async function promptBlockNodeChartVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.blockNodeChartVersion);
    },
  };

  public static readonly priorityMapping: CommandFlag = {
    constName: 'priorityMapping',
    name: 'priority-mapping',
    definition: {
      describe:
        'Configure block node priority mapping.' +
        ' Unlisted nodes will not be routed to a block node' +
        ' Default: all consensus nodes included, first node priority is 2.' +
        ' Example: "priority-mapping node1=2,node2=1"',
      type: 'string',
    },
  };

  public static readonly externalBlockNodeAddress: CommandFlag = {
    constName: 'externalBlockNodeAddress',
    name: 'address',
    definition: {
      describe:
        'Provide external block node address (IP or domain), with optional port' +
        ` (Default port: ${constants.BLOCK_NODE_PORT})` +
        ' Examples: "--address localhost:8080", "--address 192.0.0.1"',
      type: 'string',
    },
  };

  public static readonly wrapsEnabled: CommandFlag = {
    constName: 'wrapsEnabled',
    name: 'wraps',
    definition: {
      describe: 'Enable recursive WRAPs aggregation for hinTS/TSS (CN >= v0.72).',
      type: 'boolean',
      defaultValue: false,
    },
  };

  public static readonly wrapsKeyPath: CommandFlag = {
    constName: 'wrapsKeyPath',
    name: 'wraps-key-path',
    definition: {
      describe: 'Path to a local directory containing pre-existing WRAPs proving key files (.bin)',
      type: 'string',
    },
  };

  public static readonly tssEnabled: CommandFlag = {
    constName: 'tssEnabled',
    name: 'tss',
    definition: {
      describe: 'Enable hinTS/TSS (CN >= v0.74).',
      type: 'boolean',
      defaultValue: true,
    },
  };

  public static readonly applicationProperties: CommandFlag = {
    constName: 'applicationProperties',
    name: 'application-properties',
    definition: {
      describe:
        'application.properties file for node (default merges with Solo defaults; add comment ' +
        `'${constants.APPLICATION_PROPERTIES_ENABLE_OVERWRITE_MARKER}' in the file to use overwrite mode)`,
      defaultValue: PathEx.join('templates', constants.APPLICATION_PROPERTIES),
      type: 'string',
    },
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
  };

  public static readonly apiPermissionProperties: CommandFlag = {
    constName: 'apiPermissionProperties',
    name: 'api-permission-properties',
    definition: {
      describe: 'api-permission.properties file for node',
      defaultValue: PathEx.join('templates', 'api-permission.properties'),
      type: 'string',
    },
  };

  public static readonly bootstrapProperties: CommandFlag = {
    constName: 'bootstrapProperties',
    name: 'bootstrap-properties',
    definition: {
      describe: 'bootstrap.properties file for node',
      defaultValue: PathEx.join('templates', 'bootstrap.properties'),
      type: 'string',
    },
  };

  public static readonly genesisThrottlesFile: CommandFlag = {
    constName: 'genesisThrottlesFile',
    name: 'genesis-throttles-file',
    definition: {
      describe: 'throttles.json file used during network genesis',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly settingTxt: CommandFlag = {
    constName: 'settingTxt',
    name: 'settings-txt',
    definition: {
      describe: 'settings.txt file for node',
      defaultValue: PathEx.join('templates', 'settings.txt'),
      type: 'string',
    },
  };

  public static readonly app: CommandFlag = {
    constName: 'app',
    name: 'app',
    definition: {
      describe: 'Testing app name',
      defaultValue: constants.HEDERA_APP_NAME,
      type: 'string',
    },
  };

  public static readonly appConfig: CommandFlag = {
    constName: 'appConfig',
    name: 'app-config',
    definition: {
      describe: 'json config file of testing app',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly localBuildPath: CommandFlag = {
    constName: 'localBuildPath',
    name: 'local-build-path',
    definition: {
      describe: 'path of hedera local repo',
      defaultValue: constants.getEnvironmentVariable('SOLO_LOCAL_BUILD_PATH') || '',
      type: 'string',
      promptText: 'Enter local build path: ',
    },
    prompt: async function promptLocalBuildPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.localBuildPath);
    },
  };

  public static readonly newAccountNumber: CommandFlag = {
    constName: 'newAccountNumber',
    name: 'new-account-number',
    definition: {
      describe: 'new account number for node update transaction',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly newAdminKey: CommandFlag = {
    constName: 'newAdminKey',
    name: 'new-admin-key',
    definition: {
      describe: 'new admin key for the Hedera account',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly gossipPublicKey: CommandFlag = {
    constName: 'gossipPublicKey',
    name: 'gossip-public-key',
    definition: {
      describe: 'path and file name of the public key for signing gossip in PEM key format to be used',
      defaultValue: '',
      type: 'string',
    },
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
  };

  public static readonly tlsPublicKey: CommandFlag = {
    constName: 'tlsPublicKey',
    name: 'tls-public-key',
    definition: {
      describe: 'path and file name of the public TLS key to be used',
      defaultValue: '',
      type: 'string',
    },
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
  };

  public static readonly log4j2Xml: CommandFlag = {
    constName: 'log4j2Xml',
    name: 'log4j2-xml',
    definition: {
      describe: 'log4j2.xml file for node',
      defaultValue: PathEx.join('templates', 'log4j2.xml'),
      type: 'string',
    },
  };

  public static readonly updateAccountKeys: CommandFlag = {
    constName: 'updateAccountKeys',
    name: 'update-account-keys',
    definition: {
      describe:
        'Updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret',
      defaultValue: true,
      type: 'boolean',
      promptText:
        'Would you like to updates the special account keys to new keys and stores their keys in a corresponding Kubernetes secret? ',
    },
    prompt: async function promptUpdateAccountKeys(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.updateAccountKeys);
    },
  };

  public static readonly ed25519PrivateKey: CommandFlag = {
    constName: 'ed25519PrivateKey',
    name: 'ed25519-private-key',
    definition: {
      describe: 'Specify a hex-encoded ED25519 private key for the Hedera account',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
      promptText: 'Enter the private key: ',
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.ed25519PrivateKey);
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
  };

  public static readonly ecdsaPrivateKey: CommandFlag = {
    constName: 'ecdsaPrivateKey',
    name: 'ecdsa-private-key',
    definition: {
      describe: 'Specify a hex-encoded ECDSA private key for the Hedera account',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
      promptText: 'Enter the private key: ',
    },
    prompt: async function promptPrivateKey(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.ecdsaPrivateKey);
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
  };

  public static readonly accountId: CommandFlag = {
    constName: 'accountId',
    name: 'account-id',
    definition: {
      describe: 'The Hedera account id, e.g.: 0.0.1001',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter the account id: ',
    },
    prompt: async function promptAccountId(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.accountId);
    },
  };

  public static readonly fileId: CommandFlag = {
    constName: 'fileId',
    name: 'file-id',
    definition: {
      describe: 'The network file id, e.g.: 0.0.150',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter the file id: ',
      emptyCheckMessage: 'File ID cannot be empty',
    },
    prompt: async function promptFileId(task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.fileId);
    },
  };

  public static readonly filePath: CommandFlag = {
    constName: 'filePath',
    name: 'file-path',
    definition: {
      describe: 'Local path to the file to upload',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter the file path: ',
      emptyCheckMessage: 'File path cannot be empty',
    },
    prompt: async function promptFilePath(task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.filePath);
    },
  };

  public static readonly amount: CommandFlag = {
    constName: 'amount',
    name: 'hbar-amount',
    definition: {
      describe: 'Amount of HBAR to add',
      defaultValue: 100,
      type: 'number',
      promptText: 'How much HBAR do you want to add? ',
    },
    prompt: async function promptAmount(task: SoloListrTaskWrapper<AnyListrContext>, input: number): Promise<number> {
      return await Flags.prompt('number', task, input, Flags.amount);
    },
  };

  public static readonly createAmount: CommandFlag = {
    constName: 'createAmount',
    name: 'create-amount',
    definition: {
      describe: 'Amount of new account to create',
      defaultValue: 1,
      type: 'number',
      promptText: 'How many account to create? ',
    },
    prompt: async function promptCreateAmount(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: number,
    ): Promise<number> {
      return await Flags.prompt('number', task, input, Flags.createAmount);
    },
  };

  public static readonly nodeAlias: CommandFlag = {
    constName: 'nodeAlias',
    name: 'node-alias',
    definition: {
      describe: 'Node alias (e.g. node99)',
      type: 'string',
      promptText: 'Enter the new node id: ',
    },
    prompt: async function promptNewNodeAlias(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.nodeAlias);
    },
    rules: [FlagRules.nodeAlias],
  };

  public static readonly skipNodeAlias: CommandFlag = {
    constName: 'skipNodeAlias',
    name: 'skip-node-alias',
    definition: {
      describe: 'The node alias to skip, because of a NodeUpdateTransaction or it is down (e.g. node99)',
      type: 'string',
      promptText: 'Enter the node alias to skip: ',
    },
    prompt: async function promptNewNodeAlias(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.skipNodeAlias);
    },
    rules: [FlagRules.nodeAlias],
  };

  public static readonly gossipEndpoints: CommandFlag = {
    constName: 'gossipEndpoints',
    name: 'gossip-endpoints',
    definition: {
      describe: 'Comma separated gossip endpoints of the node(e.g. first one is internal, second one is external)',
      type: 'string',
      promptText: 'Enter the gossip endpoints(comma separated): ',
    },
    prompt: async function promptGossipEndpoints(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.gossipEndpoints);
    },
  };

  public static readonly grpcEndpoints: CommandFlag = {
    constName: 'grpcEndpoints',
    name: 'grpc-endpoints',
    definition: {
      describe: 'Comma separated gRPC endpoints of the node (at most 8)',
      type: 'string',
      promptText: 'Enter the gRPC endpoints(comma separated): ',
    },
    prompt: async function promptGrpcEndpoints(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.grpcEndpoints);
    },
  };

  public static readonly endpointType: CommandFlag = {
    constName: 'endpointType',
    name: 'endpoint-type',
    definition: {
      describe: 'Endpoint type (IP or FQDN)',
      defaultValue: constants.ENDPOINT_TYPE_FQDN,
      type: 'string',
      promptText: 'Enter the endpoint type(IP or FQDN): ',
    },
    prompt: async function promptEndpointType(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.endpointType);
    },
  };

  public static readonly persistentVolumeClaims: CommandFlag = {
    constName: 'persistentVolumeClaims',
    name: 'pvcs',
    definition: {
      describe: 'Enable persistent volume claims to store data outside the pod, required for consensus node add',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Would you like to enable persistent volume claims to store data outside the pod? ',
    },
    prompt: async function promptPersistentVolumeClaims(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.persistentVolumeClaims);
    },
  };

  public static readonly debugNodeAlias: CommandFlag = {
    constName: 'debugNodeAlias',
    name: 'debug-node-alias',
    definition: {
      describe: 'Enable default jvm debug port (5005) for the given node id',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter debug node alias: ',
    },
    prompt: async function promptDebugNodeAlias(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.debugNodeAlias);
    },
    rules: [FlagRules.nodeAlias],
  };

  public static readonly outputDir: CommandFlag = {
    constName: 'outputDir',
    name: 'output-dir',
    definition: {
      describe: 'Path to the directory where the command context will be saved to',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter path to directory to store the temporary context file',
    },
    prompt: async function promptOutputDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.outputDir);
    },
  };

  public static readonly zipPassword: CommandFlag = {
    constName: 'zipPassword',
    name: 'zip-password',
    definition: {
      describe: 'Password to encrypt generated backup ZIP archives',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly zipFile: CommandFlag = {
    constName: 'zipFile',
    name: 'zip-file',
    definition: {
      describe: 'Path to the encrypted backup ZIP archive used during restore',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly inputDir: CommandFlag = {
    constName: 'inputDir',
    name: 'input-dir',
    definition: {
      describe: 'Path to the directory where the command context will be loaded from',
      defaultValue: '',
      type: 'string',
      promptText: 'Enter path to directory containing the temporary context file',
    },
    prompt: async function promptInputDirectory(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.inputDir);
    },
  };

  public static readonly optionsFile: CommandFlag = {
    constName: 'optionsFile',
    name: 'options-file',
    definition: {
      describe:
        'Path to YAML file containing component-specific deployment options (consensus, block, mirror, relay, explorer)',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly metallbConfig: CommandFlag = {
    constName: 'metallbConfig',
    name: 'metallb-config',
    definition: {
      describe: 'Path pattern for MetalLB configuration YAML files (supports {index} placeholder for cluster number)',
      defaultValue: 'metallb-cluster-{index}.yaml',
      type: 'string',
    },
  };

  public static readonly backupExternalDatabase: CommandFlag = {
    constName: 'backupExternalDatabase',
    name: 'backup-external-database',
    definition: {
      describe:
        'Export external Mirror Node database dump during backup and save connection/credential parameters to JSON',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly externalDbParamsFile: CommandFlag = {
    constName: 'externalDbParamsFile',
    name: 'external-db-params-file',
    definition: {
      describe:
        'Path to external database parameters JSON. Backup writes it; restore reads it to avoid passing many DB flags',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly expectedLbIpsFile: CommandFlag = {
    constName: 'expectedLbIpsFile',
    name: 'expected-lb-ips-file',
    definition: {
      describe:
        'Path to KEY=VALUE file with expected LoadBalancer IP mappings, for example KIND_<CONTEXT>_NETWORK_NODE1_SVC=172.x.x.x',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly skipIpTracking: CommandFlag = {
    constName: 'skipIpTracking',
    name: 'skip-ip-tracking',
    definition: {
      describe: 'Skip LoadBalancer IP tracking and enforcement during restore-network',
      defaultValue: true,
      type: 'boolean',
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
  };

  public static readonly adminPublicKeys: CommandFlag = {
    constName: 'adminPublicKeys',
    name: 'admin-public-keys',
    definition: {
      describe: 'Comma separated list of DER encoded ED25519 public keys and must match the order of the node aliases',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
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
  };

  public static readonly rollback: CommandFlag = {
    constName: 'rollback',
    name: 'rollback',
    definition: {
      describe:
        'Opt in to automatic cleanup when deploy fails. By default, ' +
        'failed one-shot deploys keep partial resources so you can inspect the failure and re-run the same command.',
      defaultValue: false,
      type: 'boolean',
      disablePrompt: true,
    },
  };

  public static readonly output: CommandFlag = {
    constName: 'output',
    name: 'output',
    definition: {
      describe: 'Output format. One of: "json", "yaml", "wide"',
      defaultValue: '',
      alias: 'o',
      type: 'string',
      disablePrompt: true,
    },
  };

  public static readonly mirrorNodeVersion: CommandFlag = {
    constName: 'mirrorNodeVersion',
    name: 'mirror-node-version',
    definition: {
      describe: 'Mirror node chart version',
      defaultValue: version.MIRROR_NODE_VERSION,
      type: 'string',
      promptText: 'Enter mirror node version: ',
    },
    prompt: async function promptMirrorNodeVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.mirrorNodeVersion);
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
  };

  public static readonly mirrorStaticIp: CommandFlag = {
    constName: 'mirrorStaticIp',
    name: 'mirror-static-ip',
    definition: {
      describe: 'static IP address for the mirror node',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly explorerVersion: CommandFlag = {
    constName: 'explorerVersion',
    name: 'explorer-version',
    definition: {
      describe: 'Explorer chart version',
      defaultValue: version.EXPLORER_VERSION,
      type: 'string',
      promptText: 'Enter explorer version: ',
    },
    prompt: async function promptExplorerVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.explorerVersion);
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
      describe:
        'The name the user will reference locally to link to a deployment. ' +
        'Falls back to the SOLO_DEPLOYMENT environment variable, or is selected automatically ' +
        'when the local configuration contains exactly one deployment',
      alias: 'd',
      get defaultValue(): string {
        return constants.getEnvironmentVariable('SOLO_DEPLOYMENT') ?? '';
      },
      type: 'string',
      promptText: 'Enter the name of the deployment:',
    },
    prompt: async function promptDeployment(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.deployment);
    },
    rules: [FlagRules.dnsLabel],
  };

  public static readonly deploymentClusters: CommandFlag = {
    constName: 'deploymentClusters',
    name: 'deployment-clusters',
    definition: {
      describe: 'Solo deployment cluster list (comma separated)',
      type: 'string',
      promptText: 'Enter the Solo deployment cluster names (comma separated): ',
    },
    prompt: async function promptDeploymentClusters(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.deploymentClusters);
    },
    rules: [FlagRules.each(FlagRules.clusterReference)],
  };

  public static readonly serviceMonitor: CommandFlag = {
    constName: 'serviceMonitor',
    name: 'service-monitor',
    definition: {
      describe: 'Install ServiceMonitor custom resource for monitoring Network Node metrics',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly podLog: CommandFlag = {
    constName: 'podLog',
    name: 'pod-log',
    definition: {
      describe: 'Install PodLog custom resource for monitoring Network Node pod logs',
      defaultValue: false,
      type: 'boolean',
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
      promptText: 'Enter node alias and path to TLS certificate for gRPC (ex. nodeAlias=path )',
    },
    prompt: async function promptGrpcTlsCertificatePath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.grpcTlsCertificatePath);
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
      promptText: 'Enter node alias and path to TLS certificate for gGRPC web (ex. nodeAlias=path )',
    },
    prompt: async function promptGrpcWebTlsCertificatePath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.grpcWebTlsCertificatePath);
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
  };

  //* ----------------- External Mirror Node PostgreSQL Database Related Flags ------------------ *//

  public static readonly externalDatabaseHost: CommandFlag = {
    constName: 'externalDatabaseHost',
    name: 'external-database-host',
    definition: {
      describe: `Use to provide the external database host if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
      promptText: 'Enter host of the external database',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.externalDatabaseHost);
    },
  };

  public static readonly externalDatabaseOwnerUsername: CommandFlag = {
    constName: 'externalDatabaseOwnerUsername',
    name: 'external-database-owner-username',
    definition: {
      describe: `Use to provide the external database owner's username if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
      promptText: 'Enter username of the external database owner',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.externalDatabaseOwnerUsername);
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
      promptText: 'Enter password of the external database owner',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.externalDatabaseOwnerPassword);
    },
  };

  public static readonly externalDatabaseReadonlyUsername: CommandFlag = {
    constName: 'externalDatabaseReadonlyUsername',
    name: 'external-database-read-username',
    definition: {
      describe: `Use to provide the external database readonly user's username if the '--${Flags.useExternalDatabase.name}' is passed`,
      defaultValue: '',
      type: 'string',
      promptText: 'Enter username of the external database readonly user',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.externalDatabaseReadonlyUsername);
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
      promptText: 'Enter password of the external database readonly user',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.externalDatabaseReadonlyPassword);
    },
  };

  //* ------------------------------------------------------------------------------------------- *//

  public static readonly username: CommandFlag = {
    constName: 'username',
    name: 'user',
    definition: {
      describe:
        'Optional user name used for local configuration. Only accepts letters and numbers. Defaults to the username provided by the OS',
      type: 'string',
      alias: 'u',
      promptText: 'Please enter your username. Can only contain letters and numbers:',
    },
    prompt: async function promptUsername(task: SoloListrTaskWrapper<AnyListrContext>, input: string): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.username);
    },
    rules: [FlagRules.alphanumeric],
  };

  public static readonly grpcTlsKeyPath: CommandFlag = {
    constName: 'grpcTlsKeyPath',
    name: 'grpc-tls-key',
    definition: {
      describe:
        'TLS Certificate key path for the gRPC ' +
        '(e.g. "node1=/Users/username/node1-grpc.key" ' +
        'with multiple nodes comma separated)',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
      promptText: 'Enter node alias and path to TLS certificate key for gRPC (ex. nodeAlias=path )',
    },
    prompt: async function promptGrpcTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.grpcTlsKeyPath);
    },
  };

  public static readonly grpcWebTlsKeyPath: CommandFlag = {
    constName: 'grpcWebTlsKeyPath',
    name: 'grpc-web-tls-key',
    definition: {
      describe:
        'TLC Certificate key path for gRPC Web ' +
        '(e.g. "node1=/Users/username/node1-grpc-web.key" ' +
        'with multiple nodes comma separated)',
      defaultValue: '',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
      promptText: 'Enter node alias and path to TLS certificate key for gGRPC Web (ex. nodeAlias=path )',
    },
    prompt: async function promptGrpcWebTlsKeyPath(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.grpcWebTlsKeyPath);
    },
  };

  public static readonly stakeAmounts: CommandFlag = {
    constName: 'stakeAmounts',
    name: 'stake-amounts',
    definition: {
      describe:
        'The amount to be staked in the same order you list the node aliases with multiple node staked values comma separated',
      defaultValue: '',
      type: 'string',
    },
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
  };

  public static readonly networkNodeIps: CommandFlag = {
    constName: 'networkNodeIps',
    name: 'network-node-ips',
    definition: {
      describe:
        'IP mapping where key = value is node alias and static ip for the network-node LoadBalancer service, ' +
        '(e.g.: --network-node-ips node1=127.0.0.1,node2=127.0.0.2)',
      type: 'string',
    },
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
  };

  public static readonly gcsBucketPrefix: CommandFlag = {
    constName: 'gcsBucketPrefix',
    name: 'gcs-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of google storage bucket',
      type: 'string',
    },
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
  };

  public static readonly awsBucketRegion: CommandFlag = {
    constName: 'awsBucketRegion',
    name: 'aws-bucket-region',
    definition: {
      defaultValue: '',
      describe: 'name of aws bucket region',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
  };

  public static readonly awsBucketPrefix: CommandFlag = {
    constName: 'awsBucketPrefix',
    name: 'aws-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of aws storage bucket',
      type: 'string',
      dataMask: constants.STANDARD_DATAMASK,
    },
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
  };

  public static readonly backupRegion: CommandFlag = {
    constName: 'backupRegion',
    name: 'backup-region',
    definition: {
      defaultValue: 'us-central1',
      describe: 'backup storage region',
      type: 'string',
    },
  };

  public static readonly backupProvider: CommandFlag = {
    constName: 'backupProvider',
    name: 'backup-provider',
    definition: {
      defaultValue: 'GCS',
      describe: 'backup storage service provider, GCS or AWS',
      type: 'string',
    },
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
  };

  public static readonly storageBucketPrefix: CommandFlag = {
    constName: 'storageBucketPrefix',
    name: 'storage-bucket-prefix',
    definition: {
      defaultValue: '',
      describe: 'path prefix of storage bucket mirror node importer',
      type: 'string',
    },
  };

  public static readonly storageBucketRegion: CommandFlag = {
    constName: 'storageBucketRegion',
    name: 'storage-bucket-region',
    definition: {
      defaultValue: '',
      describe: 'region of storage bucket mirror node importer',
      type: 'string',
    },
  };

  public static readonly loadBalancerEnabled: CommandFlag = {
    constName: 'loadBalancerEnabled',
    name: 'load-balancer',
    definition: {
      describe: 'Expose the deployed services via a LoadBalancer service type',
      defaultValue: false,
      type: 'boolean',
      promptText: 'Enable load balancer? ',
    },
    prompt: async function promptLoadBalancerEnabled(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: boolean,
    ): Promise<boolean> {
      return await Flags.prompt('toggle', task, input, Flags.loadBalancerEnabled);
    },
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
  };

  public static readonly numberOfConsensusNodes: CommandFlag = {
    constName: 'numberOfConsensusNodes',
    name: 'num-consensus-nodes',
    definition: {
      describe: 'Used to specify desired number of consensus nodes for pre-genesis deployments',
      type: 'number',
      promptText: 'Enter number of consensus nodes to add to the provided cluster (must be a positive number):',
    },
    prompt: async function (task: SoloListrTaskWrapper<AnyListrContext>, input: number): Promise<number> {
      const promptForInput: () => Promise<number> = (): Promise<number> =>
        Flags.prompt('number', task, input, Flags.numberOfConsensusNodes);

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
  };

  public static readonly domainName: CommandFlag = {
    constName: 'domainName',
    name: 'domain-name',
    definition: {
      describe: 'Custom domain name',
      type: 'string',
    },
  };

  public static readonly domainNames: CommandFlag = {
    constName: 'domainNames',
    name: 'domain-names',
    definition: {
      describe:
        'Custom domain names for consensus nodes mapping for the' +
        '(e.g. node0=domain.name where key is node alias and value is domain name)' +
        'with multiple nodes comma separated',
      type: 'string',
    },
  };

  public static readonly gossipEndpointPort: CommandFlag = {
    constName: 'gossipEndpointPort',
    name: 'gossip-endpoint-port',
    definition: {
      describe:
        'Port used when building the consensus node gossip endpoints published to the network' +
        `\n(Default port: ${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT})` +
        '\n[Format: <port> to apply the same port to every node, or <alias>=<port>[,<alias>=<port>] per node]',
      type: 'string',
    },
  };

  public static readonly serviceEndpointPort: CommandFlag = {
    constName: 'serviceEndpointPort',
    name: 'service-endpoint-port',
    definition: {
      describe:
        'Port used when building the consensus node gRPC service endpoints published to the network' +
        `\n(Default port: ${constants.GRPC_PORT})` +
        '\n[Format: <port> to apply the same port to every node, or <alias>=<port>[,<alias>=<port>] per node]',
      type: 'string',
    },
  };

  public static readonly realm: CommandFlag = {
    constName: 'realm',
    name: 'realm',
    definition: {
      describe: 'Realm number. Requires network-node > v61.0 for non-zero values',
      type: 'number',
      defaultValue: 0,
    },
  };

  public static readonly shard: CommandFlag = {
    constName: 'shard',
    name: 'shard',
    definition: {
      describe: 'Shard number. Requires network-node > v61.0 for non-zero values',
      type: 'number',
      defaultValue: 0,
    },
  };

  // --------------- Rapid Fire --------------- //

  public static readonly maxTps: CommandFlag = {
    constName: 'maxTps',
    name: 'max-tps',
    definition: {
      describe: 'The maximum transactions per second to be generated by the NLG load test',
      type: 'number',
      defaultValue: 0,
    },
  };

  public static readonly maxRtt: CommandFlag = {
    constName: 'maxRtt',
    name: 'max-rtt',
    definition: {
      describe:
        'Maximum allowed end-to-end round-trip time in milliseconds, from transaction submission to mirror node availability',
      type: 'number',
      defaultValue: 0,
    },
  };

  public static readonly performanceTest: CommandFlag = {
    constName: 'performanceTest',
    name: 'test',
    definition: {
      describe: 'The class name of the Performance Test to run',
      type: 'string',
      defaultValue: '',
    },
  };

  public static readonly packageName: CommandFlag = {
    constName: 'packageName',
    name: 'package',
    definition: {
      describe: 'The package name of the Performance Test to run. Defaults to ',
      type: 'string',
      defaultValue: 'com.hedera.benchmark',
    },
  };

  public static readonly nlgArguments: CommandFlag = {
    constName: 'nlgArguments',
    name: 'args',
    definition: {
      describe:
        'All arguments to be passed to the NLG load test class. Value MUST be wrapped in 2 sets of different quotes. ' +
        'Example: \'"-c 100 -a 40 -t 3600"\'',
      type: 'string',
      defaultValue: '',
    },
  };

  public static readonly javaHeap: CommandFlag = {
    constName: 'javaHeap',
    name: 'javaHeap',
    definition: {
      describe: 'Max Java heap size in GB for the NLG load test class, defaults to 8',
      type: 'number',
      defaultValue: 8,
    },
  };

  // --------------- One Shot --------------- //

  // A minimal setup deployment with 1 consensus node and 1 mirror node
  // Using this flag will enable one-shot to be used in a test workflow running on a default linux GitHub runner
  public static readonly minimalSetup: CommandFlag = {
    constName: 'minimalSetup',
    name: 'minimal-setup',
    definition: {
      describe: 'Create a deployment with minimal setup. Only includes a single consensus node and mirror node',
      defaultValue: false,
      type: 'boolean',
    },
  };

  public static readonly deployMirrorNode: CommandFlag = {
    constName: 'deployMirrorNode',
    name: 'deploy-mirror-node',
    definition: {
      describe: 'Deploy mirror node as part of one-shot falcon deployment',
      defaultValue: true,
      type: 'boolean',
    },
  };

  public static readonly deployExplorer: CommandFlag = {
    constName: 'deployExplorer',
    name: 'deploy-explorer',
    definition: {
      describe: 'Deploy explorer as part of one-shot falcon deployment',
      defaultValue: true,
      type: 'boolean',
    },
  };

  public static readonly deployRelay: CommandFlag = {
    constName: 'deployRelay',
    name: 'deploy-relay',
    definition: {
      describe: 'Deploy relay as part of one-shot falcon deployment',
      defaultValue: true,
      type: 'boolean',
    },
  };

  public static readonly parallelDeploy: CommandFlag = {
    constName: 'parallelDeploy',
    name: 'parallel-deploy',
    definition: {
      describe:
        'Run independent one-shot deploy stages in parallel (consensus+block, mirror+accounts, explorer+relay). ' +
        'Disable with --no-parallel-deploy for sequential execution (useful for debugging or resource-constrained environments).',
      defaultValue: true,
      type: 'boolean',
    },
  };

  // --------------- One Shot Version Pins --------------- //

  public static readonly consensusNodeVersion: CommandFlag = {
    constName: 'releaseTag',
    name: 'consensus-node-version',
    definition: {
      describe: 'Consensus node version to deploy (e.g. v0.73.0 or 0.73.0).',
      defaultValue: '',
      type: 'string',
    },
  };

  public static readonly relayVersion: CommandFlag = {
    constName: 'relayReleaseTag',
    name: 'relay-version',
    definition: {
      describe: 'JSON-RPC relay version to deploy (e.g. v0.76.2 or 0.76.2). ',
      defaultValue: version.HEDERA_JSON_RPC_RELAY_VERSION,
      type: 'string',
      promptText: 'Enter relay version: ',
      emptyCheckMessage: 'relay-version cannot be empty',
    },
    prompt: async function promptRelayVersion(
      task: SoloListrTaskWrapper<AnyListrContext>,
      input: string,
    ): Promise<string> {
      return await Flags.prompt('input', task, input, Flags.relayVersion);
    },
  };

  public static readonly blockNodeVersion: CommandFlag = {
    constName: 'chartVersion',
    name: 'block-node-version',
    definition: {
      describe: 'Block node version to deploy for (e.g. v0.31.0 or 0.31.0). ',
      defaultValue: '',
      type: 'string',
    },
  };

  // ------------------ Edge ---------------- //

  public static readonly edgeEnabled: CommandFlag = {
    constName: 'edgeEnabled',
    name: 'edge',
    definition: {
      describe:
        'Use edge component versions (newer than defaults). Also supports version overrides from solo.config.yaml ' +
        'and solo.config.json, for example: `consensus-node-version: v0.73.0` (YAML) or ' +
        '`{"consensusNodeVersion":"v0.73.0"}` (JSON).',
      defaultValue: false,
      type: 'boolean',
    },
  };

  // Every static CommandFlag defined in this class must be listed here.
  // Helpers derive behavior from allFlags/allFlagsMap, so new flags are incomplete until registered in this array.
  public static readonly allFlags: CommandFlag[] = [
    Flags.accountId,
    Flags.fileId,
    Flags.filePath,
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
    Flags.check,

    //* Chart directories
    Flags.chartDirectory,
    Flags.relayChartDirectory,
    Flags.explorerChartDirectory,
    Flags.blockNodeChartDirectory,
    Flags.mirrorNodeChartDirectory,

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
    Flags.deployMetricsServer,
    Flags.deployPrometheusStack,
    Flags.deployment,
    Flags.deploymentClusters,
    Flags.debugMode,
    Flags.ecdsaPrivateKey,
    Flags.ed25519PrivateKey,
    Flags.enableIngress,
    Flags.enableExplorerTls,
    Flags.enableTimeout,
    Flags.endpointType,
    Flags.envoyIps,
    Flags.networkNodeIps,
    Flags.force,
    Flags.forcePortForward,
    Flags.externalAddress,
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
    Flags.explorerTlsHostName,
    Flags.explorerStaticIp,
    Flags.explorerVersion,
    Flags.inputDir,
    Flags.backupExternalDatabase,
    Flags.externalDbParamsFile,
    Flags.expectedLbIpsFile,
    Flags.skipIpTracking,

    Flags.loadBalancerEnabled,
    Flags.localBuildPath,
    Flags.log4j2Xml,
    Flags.metallbConfig,
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
    Flags.optionsFile,
    Flags.outputDir,
    Flags.outputValuesFile,
    Flags.persistentVolumeClaims,
    Flags.pinger,
    Flags.predefinedAccounts,
    Flags.privateKey,
    Flags.quiet,
    Flags.output,
    Flags.imageTag,
    Flags.componentImage,
    Flags.relayVersion,
    Flags.releaseTag,
    Flags.consensusNodeVersion,
    Flags.upgradeVersion,
    Flags.freezeBlockDrainSeconds,
    Flags.skipNodeStart,
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
    Flags.awsBucketRegion,
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
    Flags.gossipEndpointPort,
    Flags.serviceEndpointPort,
    Flags.blockNodeChartVersion,
    Flags.blockNodeVersion,
    Flags.blockNodeTssOverlay,
    Flags.blockNodeMessageSizeSoftLimitBytes,
    Flags.blockNodeMessageSizeHardLimitBytes,
    Flags.priorityMapping,
    Flags.externalBlockNodeAddress,
    Flags.realm,
    Flags.shard,
    Flags.username,
    Flags.skipNodeAlias,
    Flags.id,
    Flags.mirrorNodeId,
    Flags.serviceMonitor,
    Flags.podLog,
    Flags.nlgArguments,
    Flags.javaHeap,
    Flags.performanceTest,
    Flags.packageName,
    Flags.minimalSetup,
    Flags.deployMirrorNode,
    Flags.deployExplorer,
    Flags.deployRelay,
    Flags.zipPassword,
    Flags.zipFile,
    Flags.maxTps,
    Flags.maxRtt,
    Flags.enableMonitoringSupport,
    Flags.blockNodeMapping,
    Flags.externalBlockNodeMapping,
    Flags.grpcWebEndpoints,
    Flags.grpcWebEndpoint,
    Flags.skipGrpcWebEndpoint,
    Flags.wrapsEnabled,
    Flags.wrapsKeyPath,
    Flags.tssEnabled,
    Flags.javaFlightRecorderConfiguration,
    Flags.forceBlockNodeIntegration,
    Flags.rollback,
    Flags.parallelDeploy,
    Flags.edgeEnabled,
  ];

  /** Resets the definition.disablePrompt for all flags */
  private static resetDisabledPrompts(): void {
    for (const f of Flags.allFlags) {
      if (f.definition.disablePrompt) {
        delete f.definition.disablePrompt;
      }
    }
  }

  public static readonly allFlagsMap: Map<string, CommandFlag> = new Map(
    Flags.allFlags.map((f): [string, CommandFlag] => [f.name, f]),
  );

  public static readonly nodeConfigFileFlags: Map<string, CommandFlag> = new Map(
    [
      Flags.apiPermissionProperties,
      Flags.applicationEnv,
      Flags.applicationProperties,
      Flags.bootstrapProperties,
      Flags.log4j2Xml,
      Flags.settingTxt,
    ].map((f): [string, CommandFlag] => [f.name, f]),
  );

  public static readonly integerFlags: Map<string, CommandFlag> = new Map(
    [
      Flags.replicaCount,
      Flags.blockNodeMessageSizeSoftLimitBytes,
      Flags.blockNodeMessageSizeHardLimitBytes,
      Flags.freezeBlockDrainSeconds,
    ].map((f): [string, CommandFlag] => [f.name, f]),
  );

  public static readonly DEFAULT_FLAGS: CommandFlags = {
    required: [],
    optional: [Flags.namespace, Flags.cacheDir, Flags.releaseTag, Flags.debugMode, Flags.quiet],
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
      const flag: CommandFlag = Flags.allFlags.find((flag: CommandFlag): boolean => flag.name === name);
      if (!flag || (flag.definition.defaultValue && flag.definition.defaultValue === value)) {
        continue;
      }

      const flagName: string = flag.name;

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

  /**
   * Returns the full flag key with '--' prefix for a given CommandFlag
   * @param flag - the CommandFlag for which to get the formatted flag key
   * @returns the formatted flag key as a string (e.g. '--flag-name')
   */
  public static getFormattedFlagKey(flag: CommandFlag): string {
    return `--${flag.name}`;
  }
}
