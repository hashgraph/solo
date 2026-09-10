// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt, select as selectPrompt} from '@inquirer/prompts';
import {BaseCommand} from './base.js';
import {Flags, Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {type ClusterCommandTasks} from './cluster/tasks.js';
import {
  type ClusterReferenceName,
  type Context,
  type DeploymentName,
  type Optional,
  type PortForwardConfig,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ArgvStruct, type NodeAliases} from '../types/aliases.js';
import {Templates} from '../core/templates.js';
import {promptTheUserForDeployment, resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {DeploymentStates} from '../core/config/remote/enumerations/deployment-states.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {StringFacade} from '../business/runtime-state/facade/string-facade.js';
import {Deployment} from '../business/runtime-state/config/local/deployment.js';
import {CommandFlags} from '../types/flag-types.js';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type FacadeArray} from '../business/runtime-state/collection/facade-array.js';
import {Helpers, remoteConfigsToDeploymentsTable} from '../core/helpers.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {MessageLevel} from '../core/logging/message-level.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {type K8} from '../integration/kube/k8.js';
import {type BaseStateSchema} from '../data/schema/model/remote/state/base-state-schema.js';
import * as version from '../../version.js';
import find from 'find-process';
import type ProcessInfo from 'find-process';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {IncompleteLocalConfigError} from '../core/errors/classes/config/incomplete-local-config-error.js';
import {RefreshLocalConfigSourceError} from '../core/errors/classes/config/refresh-local-config-source-error.js';
import {DeploymentStateSchema} from '../data/schema/model/remote/deployment-state-schema.js';
import yaml from 'yaml';
import {PathEx} from '../business/utils/path-ex.js';
import fs from 'node:fs/promises';
import {DEFAULT_SOLO_NAMESPACE_LABELS} from '../core/constants.js';
import {type DeploymentAddClusterContext} from './deployment-add-cluster-context.js';
export {type DeploymentAddClusterContext} from './deployment-add-cluster-context.js';

interface PortEntry {
  componentId: number;
  localPort: number;
  podPort: number;
}

interface ImagesConfig {
  quiet: boolean;
  namespace: NamespaceName;
  deployment: DeploymentName;
  context: string;
}

interface ImagesContext {
  config: ImagesConfig;
}

interface ImageRow {
  component: string;
  pod: string;
  container: string;
  image: string;
}

function collectPortEntries(components: BaseStateSchema[]): PortEntry[] {
  const entries: PortEntry[] = [];

  for (const component of components) {
    const portForwardConfigs: PortForwardConfig[] = component.metadata?.portForwardConfigs || [];

    for (const portForwardConfig of portForwardConfigs) {
      entries.push({
        componentId: component.metadata.id,
        localPort: portForwardConfig.localPort,
        podPort: portForwardConfig.podPort,
      });
    }
  }
  return entries;
}

@injectable()
export class DeploymentCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
  }

  public static CREATE_FLAGS_LIST: CommandFlags = {
    required: [flags.namespace, flags.deployment],
    optional: [flags.quiet, flags.realm, flags.shard],
  };

  public static DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.quiet],
  };

  public static ADD_CLUSTER_FLAGS_LIST: CommandFlags = {
    required: [flags.clusterRef],
    optional: [
      flags.deployment,
      flags.quiet,
      flags.enableCertManager,
      flags.numberOfConsensusNodes,
      flags.dnsBaseDomain,
      flags.dnsConsensusNodePattern,
    ],
  };

  public static LIST_DEPLOYMENTS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.clusterRef, flags.quiet],
  };

  public static SHOW_STATUS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.clusterRef, flags.quiet],
  };

  public static REFRESH_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.quiet],
  };

  public static STOP_PORT_FORWARDS_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet],
  };

  public static IMAGES_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.clusterRef, flags.quiet],
  };

  public static PORTS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.clusterRef, flags.quiet, flags.output, flags.cacheDir],
  };

  public static IMPORT_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.context, flags.deployment, flags.namespace, flags.quiet],
  };

  /**
   * Create new deployment inside the local config
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
      realm: Realm;
      shard: Shard;
      skipDeploymentCreate?: boolean;
    }

    interface Context {
      config: Config;
    }

    const tasks: ReturnType<typeof this.taskList.newTaskList> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            await this.configManager.executePrompt(task, [flags.namespace, flags.deployment]);

            const config: Config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              namespace: this.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
              realm: this.configManager.getFlag<Realm>(flags.realm) || flags.realm.definition.defaultValue,
              shard: this.configManager.getFlag<Shard>(flags.shard) || flags.shard.definition.defaultValue,
            } as Config;

            context_.config = config;

            if (
              this.localConfig.configuration.deployments &&
              this.localConfig.configuration.deployments.some(
                (d: Deployment): boolean => d.name === context_.config.deployment,
              )
            ) {
              const deploymentName: DeploymentName = context_.config.deployment;
              const existingDeployment: Deployment = this.localConfig.configuration.deploymentByName(deploymentName);

              const deploymentExistsInCluster: boolean = await this.deploymentRemoteConfigExists(existingDeployment);

              if (deploymentExistsInCluster) {
                this.logger.info(`Deployment '${deploymentName}' already exists, skipping creation`);
                context_.config.skipDeploymentCreate = true;
                return;
              }

              this.logger.showUser(
                chalk.yellow(
                  `\nLocal config shows deployment '${deploymentName}' exists, ` +
                    'but no matching resources were found in the cluster. ' +
                    'Cleaning up stale local config and proceeding with fresh deployment.',
                ),
              );

              this.localConfig.configuration.deployments.remove(existingDeployment);
              await this.localConfig.persist();
            }
          },
        },
        {
          title: 'Add deployment to local config',
          skip: ({config}: Context): boolean => config.skipDeploymentCreate === true,
          task: async ({config: {namespace, deployment, realm, shard}}: Context, task): Promise<void> => {
            task.title = `Adding deployment: ${deployment} with namespace: ${namespace.name} to local config`;

            if (this.localConfig.configuration.deployments.some((d: Deployment): boolean => d.name === deployment)) {
              throw new SoloErrors.deployment.alreadyExists(deployment);
            }

            const actualDeployment: Deployment = this.localConfig.configuration.deployments.addNew();
            actualDeployment.name = deployment;
            actualDeployment.namespace = namespace.name;
            actualDeployment.realm = realm;
            actualDeployment.shard = shard;

            await this.localConfig.persist();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'deployment config create',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.deployment.createFailed(error);
      }
    }

    return true;
  }

  /**
   * Delete a deployment from the local config
   */
  public async delete(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
      skipRemoteDelete: boolean;
    }

    interface Context {
      config: Config;
    }

    const tasks: ReturnType<typeof this.taskList.newTaskList> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task): Promise<void> => {
            await this.localConfig.load();
            try {
              await this.remoteConfig.loadAndValidate(argv);
            } catch {
              // Guard
            }

            this.configManager.update(argv);

            await promptTheUserForDeployment(this.configManager, task, this.localConfig);

            context_.config = {
              quiet: this.configManager.getFlag(flags.quiet),
              deployment: this.configManager.getFlag(flags.deployment),
            } as Config;

            const deployment: DeploymentName = context_.config.deployment;

            if (!this.localConfig.configuration.deployments?.some((d): boolean => d.name === deployment)) {
              context_.config.skipRemoteDelete = true;
            }
          },
        },
        {
          title: 'Check for existing remote resources',
          task: async ({config: {deployment}}): Promise<void> => {
            const clusterReferences: FacadeArray<StringFacade, string> =
              this.localConfig.configuration.deploymentByName(deployment).clusters;

            for (const clusterReferenceFacade of clusterReferences) {
              const clusterReference: ClusterReferenceName = clusterReferenceFacade.toString();

              const namespace: NamespaceName = NamespaceName.of(
                this.localConfig.configuration.deploymentByName(deployment).namespace,
              );

              const context: Optional<string> = this.localConfig.configuration.clusterRefs
                .get(clusterReference)
                ?.toString();

              const remoteConfigExists: boolean = await this.remoteConfig
                .remoteConfigExists(namespace, context)
                .catch((): boolean => false);

              let existingConfigMaps: ConfigMap[] = [];
              try {
                existingConfigMaps = await this.k8Factory
                  .getK8(context)
                  .configMaps()
                  .list(namespace, ['app.kubernetes.io/managed-by=Helm']);
              } catch {
                // Guard
              }

              if (remoteConfigExists || existingConfigMaps.length > 0) {
                // Best-effort, never-blocking: do not abort local-config cleanup when remote resources
                // still exist. The one-shot destroy flow tears these down first; a standalone delete
                // simply warns so the user can run the network/component destroy commands.
                this.logger.warn(
                  `Deployment '${deployment}' still has remote resources in cluster-ref '${clusterReference}'; ` +
                    'continuing with local config cleanup. Run the network/component destroy commands to remove them.',
                );
              }
            }
          },
          skip: ({config: {skipRemoteDelete}}): boolean => skipRemoteDelete === true,
        },
        {
          title: 'Remove deployment from local config',
          task: async ({config: {deployment}}): Promise<void> => {
            try {
              const actualDeployment: Deployment = this.localConfig.configuration.deploymentByName(deployment);
              if (actualDeployment) {
                this.localConfig.configuration.deployments.remove(actualDeployment);
              }

              // Prune cluster-refs that are no longer referenced by any remaining deployment, so destroy
              // converges to a clean local config. Idempotent: deleting an absent cluster-ref is a no-op.
              const referencedClusterReferences: Set<string> = new Set<string>();
              for (const remainingDeployment of this.localConfig.configuration.deployments) {
                for (const cluster of remainingDeployment.clusters) {
                  referencedClusterReferences.add(cluster.toString());
                }
              }
              for (const clusterReference of this.localConfig.configuration.clusterRefs.keys()) {
                if (!referencedClusterReferences.has(clusterReference)) {
                  this.localConfig.configuration.clusterRefs.delete(clusterReference);
                }
              }

              await this.localConfig.persist();
            } catch {
              // Deployment might not exist in local config, ignore error and continue with cleanup of other deployments if needed
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'deployment config delete',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.deployment.deleteFailed(error);
      }
    }

    return true;
  }

  /**
   * Add new cluster for specified deployment, and create or edit the remote config
   */
  public async addCluster(argv: ArgvStruct): Promise<boolean> {
    const tasks: ReturnType<typeof this.taskList.newTaskList> = this.taskList.newTaskList(
      [
        this.initializeClusterAddConfig(argv),
        this.verifyClusterAddArgs(),
        this.checkNetworkState(),
        this.testClusterConnection(),
        this.verifyClusterAddPrerequisites(),
        this.checkForExistingDeployments(),
        this.addClusterRefToDeployments(),
        this.createOrEditRemoteConfigForNewDeployment(argv),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'deployment cluster attach',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.deployment.clusterAddFailed(
          flags.getFormattedFlagKey(flags.clusterRef),
          flags.getFormattedFlagKey(flags.context),
          error,
        );
      }
    }

    return true;
  }

  public async list(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      clusterName?: ClusterReferenceName;
    }

    interface Context {
      config: Config;
    }

    const tasks: SoloListr<Context> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            let clusterName: ClusterReferenceName | undefined = this.configManager.getFlag(flags.clusterRef);

            // --cluster-ref is optional.
            // When it is not provided, prompt the user to either filter by one of the
            // cluster references found in local config or list all deployments.
            //
            // --quiet (or no cluster references in local config)
            // lists all deployments without prompting.
            if (!clusterName) {
              const isQuiet: boolean = this.configManager.getFlag<boolean>(flags.quiet);
              const clusterReferences: ClusterReferenceName[] = [...this.localConfig.configuration.clusterRefs.keys()];

              if (!isQuiet && clusterReferences.length > 0) {
                const selectedClusterReference: string = (await task
                  .prompt(ListrInquirerPromptAdapter)
                  .run(selectPrompt, {
                    message: 'Select cluster-ref to filter deployments by:',
                    choices: [
                      {name: 'All deployments', value: ''},
                      ...clusterReferences.map((clusterReference): {name: string; value: string} => ({
                        name: `${clusterReference} (${this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString() ?? 'no-context'})`,
                        value: clusterReference,
                      })),
                    ],
                  })) as string;

                clusterName = selectedClusterReference || undefined;
              }
            }

            context_.config = {
              clusterName,
            } as Config;
          },
        },
        {
          title: 'List deployments from local configuration',
          task: async (context_): Promise<void> => {
            const clusterName: ClusterReferenceName | undefined = context_.config.clusterName;
            const deploymentRows: string[] = [];
            const deployments: Deployment[] = [];

            if (this.localConfig.configuration.deployments) {
              for (const deployment of this.localConfig.configuration.deployments) {
                deployments.push(deployment);
              }
            }

            for (const deployment of deployments) {
              const deploymentNamespace: NamespaceName = NamespaceName.of(deployment.namespace);
              const clusterReferences: FacadeArray<StringFacade, string> = deployment.clusters;

              if (clusterReferences.length === 0) {
                if (!clusterName) {
                  deploymentRows.push(
                    `${deployment.name} | namespace=${deploymentNamespace.name} | cluster-ref=<none> | context=<none> | status=disconnected`,
                  );
                }
                continue;
              }

              for (const clusterReferenceFacade of clusterReferences) {
                const clusterReference: ClusterReferenceName = clusterReferenceFacade.toString();

                if (clusterName && clusterReference !== clusterName) {
                  continue;
                }

                const clusterContext: string | undefined = this.localConfig.configuration.clusterRefs
                  .get(clusterReference)
                  ?.toString();
                let status: 'connected' | 'disconnected' | 'not-found' = 'disconnected';

                if (clusterContext) {
                  const k8: K8 = this.k8Factory.getK8(clusterContext);
                  try {
                    await k8.namespaces().list();
                    const remoteConfigExists: boolean = await k8
                      .configMaps()
                      .exists(deploymentNamespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
                    status = remoteConfigExists ? 'connected' : 'not-found';
                  } catch {
                    status = 'disconnected';
                  }
                }

                deploymentRows.push(
                  `${deployment.name} | namespace=${deploymentNamespace.name} | cluster-ref=${clusterReference} | context=${clusterContext ?? '<none>'} | status=${status}`,
                );
              }
            }

            const title: string = clusterName
              ? `Local deployments for cluster-ref: ${chalk.cyan(clusterName)}`
              : 'Local deployments';
            this.logger.showList(title, deploymentRows);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.deployment.listFailed(error);
    }

    return true;
  }

  /**
   * Reconstruct the local configuration for an existing deployment from a cluster's remote config.
   */
  public async importConfig(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      kubeContext: Context;
      namespace: Optional<NamespaceName>;
      deploymentFilter: Optional<DeploymentName>;
      configMap: Optional<ConfigMap>;
    }

    interface ImportTaskContext {
      config: Config;
    }

    interface DiscoveredDeployment {
      configMap: ConfigMap;
      deploymentName: string;
    }

    const tasks: ReturnType<typeof this.taskList.newTaskList> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_: ImportTaskContext): Promise<void> => {
            // The import command is the recovery path for a broken local config, so it must not die on one.
            try {
              await this.localConfig.load();
            } catch (error) {
              if (error instanceof RefreshLocalConfigSourceError || error instanceof IncompleteLocalConfigError) {
                const backupFilePath: string = this.localConfig.backupInvalidConfigFile();
                this.logger.showUser(
                  chalk.yellow(
                    'The existing local configuration could not be loaded and will be regenerated; ' +
                      `the original file was moved to ${backupFilePath}: ${error.message}`,
                  ),
                );
                await this.localConfig.persist();
              } else {
                throw error;
              }
            }

            this.configManager.update(argv);

            const namespaceValue: string = this.configManager.getFlag<string>(flags.namespace);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              kubeContext:
                this.configManager.getFlag<Context>(flags.context) || this.k8Factory.default().contexts().readCurrent(),
              namespace: namespaceValue ? NamespaceName.of(namespaceValue) : undefined,
              deploymentFilter: this.configManager.getFlag<DeploymentName>(flags.deployment) || undefined,
              configMap: undefined,
            };
          },
        },
        {
          title: 'Discover Solo deployments in the cluster',
          task: async (context_: ImportTaskContext, task): Promise<void> => {
            const {kubeContext, namespace, deploymentFilter, quiet} = context_.config;

            const labels: string[] = Templates.renderConfigMapRemoteConfigLabels();
            const configMaps: ConfigMap[] = await (namespace
              ? this.k8Factory.getK8(kubeContext).configMaps().list(namespace, labels)
              : this.k8Factory.getK8(kubeContext).configMaps().listForAllNamespaces(labels));

            let discovered: DiscoveredDeployment[] = configMaps
              .map((configMap: ConfigMap): Optional<DiscoveredDeployment> => {
                const deploymentName: Optional<string> = Helpers.extractRemoteConfigDeploymentNames(configMap)[0];
                return deploymentName ? {configMap, deploymentName} : undefined;
              })
              .filter((entry: Optional<DiscoveredDeployment>): entry is DiscoveredDeployment => entry !== undefined);

            if (deploymentFilter) {
              discovered = discovered.filter(
                (entry: DiscoveredDeployment): boolean => entry.deploymentName === deploymentFilter,
              );
            }

            const searchScope: string =
              `kube context '${kubeContext}'` + (namespace ? ` and namespace '${namespace.name}'` : '');

            if (discovered.length === 0) {
              throw new SoloErrors.deployment.importFailed(`no Solo deployment found in ${searchScope}`);
            }

            let selected: DiscoveredDeployment = discovered[0];
            if (discovered.length > 1) {
              if (quiet) {
                const candidates: string = discovered
                  .map((entry: DiscoveredDeployment): string => {
                    return `${entry.configMap.namespace.name}:${entry.deploymentName}`;
                  })
                  .join(', ');
                throw new SoloErrors.deployment.importFailed(
                  `multiple Solo deployments found in ${searchScope} (${candidates}); narrow the selection with ` +
                    `the ${Flags.getFormattedFlagKey(flags.deployment)} or ${Flags.getFormattedFlagKey(flags.namespace)} ` +
                    `flag, or run without ${Flags.getFormattedFlagKey(flags.quiet)} to select interactively`,
                );
              }

              const selectedIndex: number = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                message: 'Select the deployment to import:',
                choices: discovered.map(
                  (entry: DiscoveredDeployment, index: number): {name: string; value: number} => ({
                    name: `${entry.deploymentName} (namespace: ${entry.configMap.namespace.name})`,
                    value: index,
                  }),
                ),
              })) as number;
              selected = discovered[selectedIndex];
            }

            context_.config.configMap = selected.configMap;
            task.title += `: found '${selected.deploymentName}' in namespace '${selected.configMap.namespace.name}'`;
          },
        },
        {
          title: 'Load remote configuration',
          task: async (context_: ImportTaskContext): Promise<void> => {
            const {configMap, kubeContext} = context_.config;
            await this.remoteConfig.populateFromExisting(configMap.namespace, kubeContext);
          },
        },
        {
          title: 'Import deployment into local configuration',
          task: async (context_: ImportTaskContext, task): Promise<void> => {
            const {kubeContext, quiet, configMap} = context_.config;

            const clusters: ReadonlyArray<Readonly<ClusterSchema>> = this.remoteConfig.configuration.clusters;
            if (clusters.length === 0) {
              throw new SoloErrors.deployment.importFailed('the remote config does not reference any clusters');
            }

            const deploymentName: DeploymentName = clusters[0].deployment as DeploymentName;
            const namespaceName: string = clusters[0].namespace;

            task.title = `Import deployment '${deploymentName}' into local configuration`;

            const existing: Deployment = this.localConfig.configuration.deployments.find(
              (candidate: Deployment): boolean => candidate.name === deploymentName,
            );
            if (existing) {
              const matchesRemote: boolean =
                existing.namespace === namespaceName &&
                clusters.every((cluster: Readonly<ClusterSchema>): boolean =>
                  existing.clusters.some(
                    (clusterReference: StringFacade): boolean => clusterReference.toString() === cluster.name,
                  ),
                );

              if (!matchesRemote) {
                if (quiet) {
                  throw new SoloErrors.deployment.importFailed(
                    `deployment '${deploymentName}' already exists in the local config with different settings; ` +
                      `run without ${Flags.getFormattedFlagKey(flags.quiet)} to confirm overwriting it`,
                  );
                }

                const overwrite: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                  default: false,
                  message:
                    `Deployment '${deploymentName}' already exists in the local config ` +
                    'with different settings. Overwrite it?',
                });

                if (!overwrite) {
                  this.logger.showUser(chalk.yellow('Import aborted; local configuration left unchanged.'));
                  return;
                }

                this.localConfig.configuration.deployments.remove(existing);
              }
            }

            // Map cluster-refs to kube contexts without overwriting mappings that already exist locally.
            for (const cluster of clusters) {
              const clusterReference: ClusterReferenceName = cluster.name;
              const mappedContext: Optional<string> = this.localConfig.configuration.clusterRefs
                .get(clusterReference)
                ?.toString();

              if (mappedContext) {
                if (mappedContext !== kubeContext) {
                  this.logger.showUser(
                    chalk.yellow(
                      `Keeping existing mapping for cluster-ref '${clusterReference}' → '${mappedContext}'.`,
                    ),
                  );
                }
                continue;
              }

              if (clusters.length === 1) {
                this.localConfig.configuration.clusterRefs.set(clusterReference, new StringFacade(kubeContext));
                continue;
              }

              if (quiet) {
                throw new SoloErrors.deployment.importFailed(
                  `cluster-ref '${clusterReference}' is not mapped to a kube context in the local config; ` +
                    `run without ${Flags.getFormattedFlagKey(flags.quiet)} to select the context interactively`,
                );
              }

              const selectedContext: string = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                message: `Select the kube context for cluster-ref '${clusterReference}':`,
                choices: this.k8Factory
                  .default()
                  .contexts()
                  .list()
                  .map((contextName: string): {name: string; value: string} => ({
                    name: contextName,
                    value: contextName,
                  })),
                default: kubeContext,
              })) as string;
              this.localConfig.configuration.clusterRefs.set(clusterReference, new StringFacade(selectedContext));
            }

            let deployment: Deployment = this.localConfig.configuration.deployments.find(
              (candidate: Deployment): boolean => candidate.name === deploymentName,
            );
            if (!deployment) {
              const {realm, shard} = await this.readRealmAndShardFromConsensusNode(kubeContext, configMap.namespace);
              deployment = this.localConfig.configuration.deployments.addNew();
              deployment.name = deploymentName;
              deployment.namespace = namespaceName;
              deployment.realm = realm;
              deployment.shard = shard;
            }

            for (const cluster of clusters) {
              const alreadyListed: boolean = deployment.clusters.some(
                (clusterReference: StringFacade): boolean => clusterReference.toString() === cluster.name,
              );
              if (!alreadyListed) {
                deployment.clusters.add(new StringFacade(cluster.name));
              }
            }

            await this.localConfig.persist();

            this.logger.showList(
              `Imported deployment '${deploymentName}'`,
              clusters.map((cluster: Readonly<ClusterSchema>): string => {
                const mapped: string =
                  this.localConfig.configuration.clusterRefs.get(cluster.name)?.toString() ?? '<none>';
                return `${deploymentName} | namespace=${namespaceName} | cluster-ref=${cluster.name} | context=${mapped}`;
              }),
            );
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'deployment config import',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw error instanceof SoloErrors.deployment.importFailed
          ? error
          : new SoloErrors.deployment.importFailed('could not complete the import', error);
      }
    }

    return true;
  }

  /** Read the realm and shard from the deployment's application.properties, warning and defaulting when unreachable. */
  private async readRealmAndShardFromConsensusNode(
    kubeContext: Context,
    namespace: NamespaceName,
  ): Promise<{realm: Realm; shard: Shard}> {
    const defaultRealm: Realm = flags.realm.definition.defaultValue as Realm;
    const defaultShard: Shard = flags.shard.definition.defaultValue as Shard;

    const applicationProperties: Optional<string> = await this.readApplicationPropertiesFromCluster(
      kubeContext,
      namespace,
    );
    const realm: Optional<number> = applicationProperties
      ? Helpers.parseNumericApplicationProperty(applicationProperties, 'hedera.realm')
      : undefined;
    const shard: Optional<number> = applicationProperties
      ? Helpers.parseNumericApplicationProperty(applicationProperties, 'hedera.shard')
      : undefined;

    if (realm === undefined || shard === undefined) {
      this.logger.showUser(
        chalk.yellow(
          "Could not read the realm and shard from the deployment's consensus nodes; " +
            `defaulting to realm ${defaultRealm}, shard ${defaultShard}.`,
        ),
      );
    }

    return {realm: realm ?? defaultRealm, shard: shard ?? defaultShard};
  }

  /** Fetch application.properties from the first reachable consensus node pod, else from the shared data ConfigMap. */
  private async readApplicationPropertiesFromCluster(
    kubeContext: Context,
    namespace: NamespaceName,
  ): Promise<Optional<string>> {
    const k8: K8 = this.k8Factory.getK8(kubeContext);
    const applicationPropertiesPath: string = `${constants.HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`;

    try {
      const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
      for (const pod of pods) {
        if (!pod?.podReference) {
          continue;
        }
        try {
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.ROOT_CONTAINER,
          );
          const applicationProperties: string = await k8
            .containers()
            .readByRef(containerReference)
            .execContainer(`cat ${applicationPropertiesPath}`);
          if (applicationProperties) {
            return applicationProperties;
          }
        } catch {
          // best-effort: this pod may not be running; try the next consensus node
        }
      }
    } catch {
      // best-effort: pod listing may fail when the network is down; fall through to the ConfigMap
    }

    try {
      const configMap: ConfigMap = await k8
        .configMaps()
        .read(namespace, constants.NETWORK_NODE_SHARED_DATA_CONFIG_MAP_NAME);
      return configMap.data?.[constants.APPLICATION_PROPERTIES];
    } catch {
      // best-effort: the shared data ConfigMap may be absent; the caller falls back to defaults
      return undefined;
    }
  }

  public async close(): Promise<void> {} // no-op

  public async ports(argv: ArgvStruct): Promise<boolean> {
    interface PortEntry {
      componentId: number;
      localPort: number;
      podPort: number;
    }

    interface PortsReport {
      deployment: DeploymentName;
      clusterReference: ClusterReferenceName;
      namespace: string;
      services: {
        consensusNodeGrpc: PortEntry[];
        mirrorNodeRest: PortEntry[];
        jsonRpcRelay: PortEntry[];
        explorer: PortEntry[];
        blockNode: PortEntry[];
      };
    }

    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
      clusterReference: ClusterReferenceName;
      deploymentConfig: Deployment;
      output: 'json' | 'yaml' | 'wide';
      cacheDirectory: string;
    }

    interface PortsContext {
      config: Config;
    }

    const tasks: SoloListr<PortsContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            const deployment: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
            const deploymentConfig: Deployment = this.localConfig.configuration.deploymentByName(deployment);
            if (!deploymentConfig) {
              throw new SoloErrors.deployment.notFound(`Deployment ${deployment} not found in local config`);
            }

            let output: 'json' | 'yaml' | 'wide' = 'wide';

            const rawOutput: string = this.configManager.getFlag(flags.output);
            switch (rawOutput) {
              case '': {
                output = 'wide';
                break;
              }
              case 'json':
              case 'yaml':
              case 'wide': {
                output = rawOutput;
                break;
              }
              default: {
                throw new SoloErrors.validation.invalidOutputFormat(rawOutput);
              }
            }

            context_.config = {
              clusterReference: this.getClusterReference(),
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              deployment,
              deploymentConfig,
              namespace: NamespaceName.of(deploymentConfig.namespace),
              output,
              cacheDirectory: this.configManager.getFlag(flags.cacheDir),
            };
          },
        },
        {
          title: 'List deployment port-forwards',
          task: async ({config}, task): Promise<void> => {
            const {deployment, namespace, clusterReference, output} = config;
            const state: DeploymentStateSchema = this.remoteConfig.configuration.state;

            const report: PortsReport = {
              deployment,
              clusterReference,
              namespace: namespace.name,
              services: {
                consensusNodeGrpc: collectPortEntries(state.haProxies || []),
                mirrorNodeRest: collectPortEntries(state.mirrorNodes || []),
                jsonRpcRelay: collectPortEntries(state.relayNodes || []),
                explorer: collectPortEntries(state.explorers || []),
                blockNode: collectPortEntries(state.blockNodes || []),
              },
            };

            const targetDirectory: string = PathEx.join(config.cacheDirectory, 'output');
            await fs.mkdir(targetDirectory, {recursive: true});

            if (output === 'json') {
              const targetFile: string = PathEx.join(targetDirectory, 'forwarded-ports.json');
              const jsonData: string = JSON.stringify(report, undefined, 2);

              await fs.writeFile(targetFile, jsonData, 'utf8');
              this.logger.showUser(`Ports data file written to: ${targetFile}`);
              this.logger.showUser(jsonData);
            } else if (output === 'yaml') {
              const targetFile: string = PathEx.join(targetDirectory, 'forwarded-ports.yaml');
              const yamlData: string = yaml.stringify(report);

              await fs.writeFile(targetFile, yamlData, 'utf8');
              this.logger.showUser(`Ports data file written to: ${targetFile}`);
              this.logger.showUser(yamlData);
            } else {
              this.logger.showUser(chalk.cyan(`\n=== Port-forwards for deployment: ${deployment} ===`));
              this.logger.showUser(`Cluster: ${clusterReference}`);
              this.logger.showUser(`Namespace: ${namespace.name}`);

              const serviceGroups: {title: string; entries: PortEntry[]}[] = [
                {title: 'Consensus node gRPC', entries: report.services.consensusNodeGrpc},
                {title: 'Mirror node REST', entries: report.services.mirrorNodeRest},
                {title: 'JSON-RPC relay', entries: report.services.jsonRpcRelay},
                {title: 'Explorer', entries: report.services.explorer},
                {title: 'Block node', entries: report.services.blockNode},
              ];

              let foundAnyPortForwards: boolean = false;

              for (const {title, entries} of serviceGroups) {
                if (entries.length === 0) {
                  continue;
                }

                foundAnyPortForwards = true;
                this.logger.showList(
                  title,
                  entries.map(
                    (entry): string =>
                      `component ${entry.componentId}: localhost:${entry.localPort} -> pod:${entry.podPort}`,
                  ),
                );
              }

              if (!foundAnyPortForwards) {
                this.logger.showUser(chalk.yellow('No port-forwards configured in remote config'));
              }
            }

            task.title = `Listed port-forwards for deployment ${deployment}`;
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.deployment.listPortsFailed(error);
    }

    return true;
  }

  public async images(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<ImagesContext> = this.taskList.newTaskList<ImagesContext>(
      [
        {
          title: 'Initialize',
          task: async (context_: ImagesContext): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            this.configManager.update(argv);

            const deployment: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
            const deploymentConfig: Deployment = this.localConfig.configuration.deploymentByName(deployment);
            if (!deploymentConfig) {
              throw new SoloErrors.deployment.notFound(`Deployment ${deployment} not found in local config`);
            }
            const namespace: NamespaceName = NamespaceName.of(deploymentConfig.namespace);
            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const clusterContext: string = this.getClusterContext(clusterReference);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              namespace,
              deployment,
              context: clusterContext,
            };
          },
        },
        {
          title: 'Collect running images',
          task: async ({config}: ImagesContext): Promise<void> => {
            const pods: Pod[] = await this.k8Factory.getK8(config.context).pods().list(config.namespace, []);

            if (pods.length === 0) {
              this.logger.showUser(chalk.yellow(`No pods found in namespace: ${config.namespace.name}`));
              return;
            }

            const rows: ImageRow[] = pods
              .filter((pod: Pod): boolean => Boolean(pod.containerImage))
              .map((pod: Pod): ImageRow => {
                const podName: string = pod.podReference?.name?.toString() ?? '';
                const component: string =
                  pod.labels?.['app.kubernetes.io/instance'] ??
                  pod.labels?.['app.kubernetes.io/name'] ??
                  podName
                    .replace(/-[a-z0-9]{5}$/, '') // strip Deployment pod-id suffix
                    .replace(/-[a-z0-9]{7,10}$/, '') // strip Deployment replicaset hash
                    .replace(/-\d+$/, ''); // strip StatefulSet index
                return {
                  component: component || '<unknown>',
                  pod: podName || '<unknown>',
                  container: pod.containerName?.toString() ?? '<unknown>',
                  image: pod.containerImage ?? '<unknown>',
                };
              });

            const headers: ImageRow = {component: 'COMPONENT', pod: 'POD', container: 'CONTAINER', image: 'IMAGE'};
            const colWidth: (key: keyof ImageRow) => number = (key: keyof ImageRow): number =>
              Math.max(headers[key].length, ...rows.map((row: ImageRow): number => row[key].length));
            const widths: Record<'component' | 'pod' | 'container', number> = {
              component: colWidth('component'),
              pod: colWidth('pod'),
              container: colWidth('container'),
            };

            const formatRow: (row: ImageRow) => string = (row: ImageRow): string =>
              `  ${row.component.padEnd(widths.component)}  ${row.pod.padEnd(widths.pod)}  ${row.container.padEnd(widths.container)}  ${row.image}`;

            const separator: string = '-'.repeat(widths.component + widths.pod + widths.container + 40);

            this.logger.showUser(chalk.green(`\n *** Running images in deployment: ${config.deployment} ***`));
            this.logger.showUser(chalk.green(separator));
            this.logger.showUser(chalk.bold.white(formatRow(headers)));
            this.logger.showUser(chalk.green(separator));
            for (const row of rows) {
              this.logger.showUser(chalk.cyan(formatRow(row)));
            }
            this.logger.showUser('');
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.deployment.listFailed(error);
    }

    return true;
  }

  /**
   * Initializes and populates the config and context for 'deployment cluster attach'
   */
  public initializeClusterAddConfig(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Initialize',
      task: async (context_, task): Promise<void> => {
        await this.localConfig.load();

        this.configManager.update(argv);

        await this.configManager.executePrompt(task, [flags.clusterRef]);

        context_.config = {
          quiet: this.configManager.getFlag<boolean>(flags.quiet),
          namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
          deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
          clusterRef: this.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),

          enableCertManager: this.configManager.getFlag<boolean>(flags.enableCertManager),
          numberOfConsensusNodes: this.configManager.getFlag<number>(flags.numberOfConsensusNodes),
          dnsBaseDomain: this.configManager.getFlag(flags.dnsBaseDomain),
          dnsConsensusNodePattern: this.configManager.getFlag(flags.dnsConsensusNodePattern),

          existingNodesCount: 0,
          nodeAliases: [] as NodeAliases,
          context: '',
        };
      },
    };
  }

  /**
   * Validates:
   * - cluster ref is present in the local config's cluster-ref => context mapping
   * - the deployment is created
   * - the cluster-ref is not already added to the deployment
   */
  public verifyClusterAddArgs(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify args',
      task: async (context_): Promise<void> => {
        const {clusterRef, deployment} = context_.config;

        if (!this.localConfig.configuration.clusterRefs.get(clusterRef)) {
          throw new SoloErrors.deployment.clusterRefNotFound(
            clusterRef,
            Flags.getFormattedFlagKey(Flags.clusterRef),
            Flags.getFormattedFlagKey(Flags.context),
          );
        }

        context_.config.context = this.localConfig.configuration.clusterRefs.get(clusterRef)?.toString();

        if (!this.localConfig.configuration.deploymentByName(deployment)) {
          throw new SoloErrors.deployment.notFound(`Deployment ${deployment} not found in local config`);
        }

        if (
          this.localConfig.configuration.deploymentByName(deployment).clusters.includes(new StringFacade(clusterRef))
        ) {
          throw new SoloErrors.deployment.clusterRefAlreadyExists(
            clusterRef,
            Flags.getFormattedFlagKey(Flags.clusterRef),
          );
        }
      },
    };
  }

  /**
   * Checks the ledger phase:
   * - if remote config is found check's the ledgerPhase field to see if it's pre or post genesis.
   *   - pre genesis:
   *     - prompts user if needed.
   *     - generates node aliases based on '--number-of-consensus-nodes'
   *   - post genesis:
   *     - throws if '--number-of-consensus-nodes' is passed
   * - if remote config is not found:
   *   - prompts user if needed.
   *   - generates node aliases based on '--number-of-consensus-nodes'.
   */
  public checkNetworkState(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'check ledger phase',
      task: async (context_, task): Promise<void> => {
        const {deployment, numberOfConsensusNodes, quiet, namespace} = context_.config;

        const existingClusterReferences: FacadeArray<StringFacade, string> =
          this.localConfig.configuration.deploymentByName(deployment).clusters;

        // if there is no remote config don't validate deployment ledger phase
        if (existingClusterReferences.length === 0) {
          context_.config.ledgerPhase = LedgerPhase.UNINITIALIZED;

          // if the user can't be prompted for '--num-consensus-nodes' fail
          if (!numberOfConsensusNodes && quiet) {
            throw new SoloErrors.validation.consensusNodeCountRequired(
              flags.numberOfConsensusNodes.name,
              DeploymentStates.PRE_GENESIS,
            );
          }

          // prompt the user for the '--num-consensus-nodes'
          else if (!numberOfConsensusNodes) {
            await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
            context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          }

          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(context_.config.numberOfConsensusNodes, 0);

          return;
        }

        const existingClusterContext: Context = this.localConfig.configuration.clusterRefs
          .get(existingClusterReferences.get(0)?.toString())
          ?.toString();

        context_.config.existingClusterContext = existingClusterContext;

        await this.remoteConfig.populateFromExisting(namespace, existingClusterContext);

        const ledgerPhase: LedgerPhase = this.remoteConfig.configuration.state.ledgerPhase;

        context_.config.ledgerPhase = ledgerPhase;

        const existingNodesCount: number = Object.keys(this.remoteConfig.configuration.state.consensusNodes).length;

        context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, existingNodesCount);

        // If ledgerPhase is pre-genesis and user can't be prompted for the '--num-consensus-nodes' fail
        if (ledgerPhase === LedgerPhase.UNINITIALIZED && !numberOfConsensusNodes && quiet) {
          throw new SoloErrors.validation.consensusNodeCountRequired(
            flags.numberOfConsensusNodes.name,
            LedgerPhase.UNINITIALIZED,
          );
        }

        // If ledgerPhase is pre-genesis prompt the user for the '--num-consensus-nodes'
        else if (ledgerPhase === LedgerPhase.UNINITIALIZED && !numberOfConsensusNodes) {
          await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
          context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(
            context_.config.numberOfConsensusNodes,
            existingNodesCount,
          );
        }

        // if the ledgerPhase is post-genesis and '--num-consensus-nodes' is specified throw
        else if (ledgerPhase === LedgerPhase.INITIALIZED && numberOfConsensusNodes) {
          throw new SoloErrors.validation.illegalArgument(
            `--${flags.numberOfConsensusNodes.name}=${numberOfConsensusNodes} shouldn't be specified ${ledgerPhase}`,
          );
        }
      },
    };
  }

  /**
   * Tries to connect with the cluster using the context from the local config
   */
  public testClusterConnection(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Test cluster reference connection',
      task: async (context_, task): Promise<void> => {
        const {clusterRef, context} = context_.config;

        task.title += `: ${clusterRef}, context: ${context}`;

        const isConnected: boolean = await this.k8Factory
          .getK8(context)
          .namespaces()
          .list()
          .then((): boolean => true)
          .catch((): boolean => false);

        if (!isConnected) {
          throw new SoloErrors.system.clusterConnectionFailed(clusterRef, context);
        }
      },
    };
  }

  public verifyClusterAddPrerequisites(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify prerequisites',
      task: async (): Promise<void> => {
        // TODO: Verifies Kubernetes cluster & namespace-level prerequisites (e.g., cert-manager, HAProxy, etc.)
      },
    };
  }

  public checkForExistingDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Check for other deployments',
      task: async (): Promise<void> => {
        await this.showExistingDeploymentsInCluster();
      },
    };
  }

  /**
   * Adds the new cluster-ref for the deployment in local config
   */
  public addClusterRefToDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'add cluster-ref in local config deployments',
      task: async ({config: {clusterRef, deployment}}, task): Promise<void> => {
        task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

        const existsInLocalConfig: boolean = this.localConfig.configuration
          .deploymentByName(deployment)
          .clusters.some((cluster): boolean => cluster.toString() === clusterRef);

        if (existsInLocalConfig) {
          this.logger.showUser(
            `Cluster-ref: ${clusterRef} already exists for deployment: ${deployment} in local config`,
          );
        } else {
          this.logger.showUserUnlessOneShot(
            `Adding cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`,
          );
          this.localConfig.configuration.deploymentByName(deployment).clusters.add(new StringFacade(clusterRef));
        }

        await this.localConfig.persist();
      },
    };
  }

  /**
   * - if remote config not found, create new remote config for the deployment.
   * - if remote config is found, add the new data for the deployment.
   */
  public createOrEditRemoteConfigForNewDeployment(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'create remote config for deployment',
      task: async (context_, task): Promise<void> => {
        const {
          deployment,
          clusterRef,
          context,
          ledgerPhase,
          nodeAliases,
          namespace,
          existingClusterContext,
          dnsBaseDomain,
          dnsConsensusNodePattern,
        } = context_.config;

        argv[flags.nodeAliasesUnparsed.name] = nodeAliases.join(',');

        task.title += `: ${deployment} in cluster reference: ${clusterRef}`;

        if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
          await this.k8Factory.getK8(context).namespaces().create(namespace, DEFAULT_SOLO_NAMESPACE_LABELS);
        }

        if (await this.k8Factory.getK8(context).configMaps().exists(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME)) {
          this.logger.showUser(`Remote config already exists for deployment: ${deployment} in cluster: ${clusterRef}`);
          return;
        }

        await (existingClusterContext
          ? this.remoteConfig.createFromExisting(
              namespace,
              clusterRef,
              deployment,
              this.componentFactory,
              dnsBaseDomain,
              dnsConsensusNodePattern,
              existingClusterContext,
              argv,
              nodeAliases,
            )
          : this.remoteConfig.create(
              argv,
              ledgerPhase,
              nodeAliases,
              namespace,
              deployment,
              clusterRef,
              context,
              dnsBaseDomain,
              dnsConsensusNodePattern,
            ));
      },
    };
  }

  /** Show list of existing deployments in the cluster */
  private async showExistingDeploymentsInCluster(): Promise<void> {
    const existingRemoteConfigs: ConfigMap[] = await this.k8Factory
      .default()
      .configMaps()
      .listForAllNamespaces(Templates.renderConfigMapRemoteConfigLabels());

    if (existingRemoteConfigs.length > 0) {
      const messageGroupName: string = 'existing-deployments';
      this.logger.addMessageGroup(messageGroupName, '⚠️ Warning: Existing solo deployment detected in cluster.');
      const existingDeploymentsRows: string[] = remoteConfigsToDeploymentsTable(existingRemoteConfigs);
      for (const row of existingDeploymentsRows) {
        this.logger.addMessageGroupMessage(messageGroupName, row);
      }
      this.logger.showMessageGroup(messageGroupName, MessageLevel.WARN);
    }
  }

  /**
   * Deprecated entry point for the legacy `solo deployment refresh port-forwards` command. Emits a deprecation
   * notice pointing users at `solo deployment port-forwards refresh`, then delegates to {@link refresh}.
   */
  public async refreshDeprecated(argv: ArgvStruct): Promise<boolean> {
    this.logger.showUser(
      chalk.yellow(
        "[DEPRECATED] 'solo deployment refresh port-forwards' is deprecated and will be removed in a future " +
          "release. Use 'solo deployment port-forwards refresh' instead.",
      ),
    );
    return this.refresh(argv);
  }

  /**
   * Refresh port-forward processes for all components in the deployment
   */
  public async refresh(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      deployment: DeploymentName;
    }

    interface RefreshContext {
      config: Config;
      namespace?: NamespaceName;
      clusterReference?: string;
      context?: string;
    }

    const tasks: SoloListr<RefreshContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            await promptTheUserForDeployment(this.configManager, task, this.localConfig);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            // Get namespace from deployment
            const deployment: Deployment = this.localConfig.configuration.deploymentByName(context_.config.deployment);

            context_.namespace = NamespaceName.of(deployment.namespace);
          },
        },
        {
          title: 'Load remote configuration',
          task: async (context_): Promise<void> => {
            if (!context_.namespace) {
              throw new SoloErrors.deployment.namespaceNotSet();
            }

            // Load remote config from a selected cluster in the deployment
            const deployment: Deployment = this.localConfig.configuration.deploymentByName(context_.config.deployment);
            const clusters: FacadeArray<StringFacade, string> = deployment.clusters;

            if (clusters.length === 0) {
              throw new SoloErrors.deployment.noClustersForDeployment(context_.config.deployment);
            }

            const clusterReferences: string[] = [];
            for (let index: number = 0; index < clusters.length; index++) {
              const clusterReferenceFacade: StringFacade = clusters.get(index);
              if (clusterReferenceFacade) {
                clusterReferences.push(clusterReferenceFacade.toString());
              }
            }

            if (clusterReferences.length === 0) {
              throw new SoloErrors.deployment.clusterReferenceResolutionFailed(
                context_.config.deployment,
                Flags.getFormattedFlagKey(Flags.deployment),
                Flags.getFormattedFlagKey(Flags.numberOfConsensusNodes),
                Flags.getFormattedFlagKey(Flags.clusterRef),
              );
            }

            // Remote config is replicated across all clusters; load from the first one.
            // Port-forwards are refreshed for every component in the deployment regardless
            // of which cluster's remote config is loaded here.
            const clusterReference: string = clusterReferences[0];

            const contextValue: StringFacade = this.localConfig.configuration.clusterRefs.get(clusterReference);
            if (!contextValue) {
              throw new SoloErrors.deployment.contextNotFoundForCluster(
                clusterReference,
                Flags.getFormattedFlagKey(Flags.clusterRef),
                Flags.getFormattedFlagKey(Flags.context),
              );
            }

            const context: string = contextValue.toString();
            context_.clusterReference = clusterReference;
            context_.context = context;

            await this.remoteConfig.load(context_.namespace, context);
          },
        },
        {
          title: 'Refresh port-forwards for all components',
          task: async (_context_, task): Promise<void> => {
            const componentsToCheck: {type: string; components: BaseStateSchema[]}[] =
              DeploymentCommand.buildComponentsToCheck(this.remoteConfig.configuration.state);

            let restoredCount: number = 0;
            let totalChecked: number = 0;
            let alreadyRunningCount: number = 0;
            const portForwardDetails: string[] = [];

            this.logger.showUser(chalk.cyan('\n=== Port-Forward Status Check ===\n'));

            for (const {type, components} of componentsToCheck) {
              for (const component of components) {
                if (!component.metadata?.portForwardConfigs || component.metadata.portForwardConfigs.length === 0) {
                  continue;
                }

                const {cluster: clusterReference, namespace} = component.metadata;
                const context: string | undefined = this.localConfig.configuration.clusterRefs
                  .get(clusterReference)
                  ?.toString();
                const k8Client: K8 = this.k8Factory.getK8(context);
                const namespaceName: NamespaceName = NamespaceName.of(namespace);
                const podName: PodName | null = await this.getPodNameForComponent(
                  component,
                  type,
                  k8Client,
                  namespaceName,
                );

                for (const portForwardConfig of component.metadata.portForwardConfigs) {
                  totalChecked++;
                  const {localPort, podPort} = portForwardConfig;
                  const componentLabel: string = `${type} ${component.metadata.id}`;

                  // Check if port-forward is running against the current pod target.
                  const isRunning: boolean = await this.isPortForwardRunning(localPort, podName?.toString());

                  if (isRunning) {
                    alreadyRunningCount++;
                    const detail: string = `✓ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Running]`;
                    portForwardDetails.push(detail);
                    this.logger.showUser(chalk.green(detail));
                  } else {
                    const missingDetail: string = `⚠ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Missing]`;
                    portForwardDetails.push(missingDetail);
                    this.logger.showUser(chalk.yellow(missingDetail));

                    try {
                      if (podName) {
                        // Re-enable port forward
                        const podReference: PodReference = PodReference.of(namespaceName, podName);

                        // Clear any stale process still holding the configured local port
                        // so the restored port-forward binds to the expected port instead
                        // of allocating the next free one.
                        await k8Client.pods().readByReference(podReference).stopPortForward(localPort);

                        // portForward parameters:
                        // - localPort: the port to forward to on localhost
                        // - podPort: the port on the pod to forward from
                        // - reuse: true = reuse the configured port number
                        // - persist: true = persistent port-forward (will restart on failure)
                        await k8Client.pods().readByReference(podReference).portForward(localPort, podPort, true, true);

                        const restoredDetail: string = `  ↳ Restored port forward for ${componentLabel}`;
                        this.logger.showUser(chalk.green(restoredDetail));
                        restoredCount++;
                      } else {
                        this.logger.showUser(
                          chalk.red(`  ↳ Could not find pod for ${componentLabel}; restore it manually:`),
                        );
                        this.logger.showUser(
                          `      kubectl -n ${namespaceName.name} port-forward pods/<POD_NAME> ${localPort}:${podPort}`,
                        );
                      }
                    } catch (error) {
                      const errorDetail: string = `  ↳ Failed to restore: ${error.message}`;
                      this.logger.showUser(chalk.red(errorDetail));
                    }
                  }
                }
              }
            }

            this.logger.showUser(chalk.cyan('\n=== Summary ==='));
            this.logger.showUser(`Total port-forwards configured: ${totalChecked}`);
            this.logger.showUser(chalk.green(`Already running: ${alreadyRunningCount}`));
            if (restoredCount > 0) {
              this.logger.showUser(chalk.green(`Successfully restored: ${restoredCount}`));
            }
            if (totalChecked === 0) {
              this.logger.showUser(chalk.yellow('No port-forwards configured in this deployment'));
            } else if (alreadyRunningCount === totalChecked) {
              this.logger.showUser(chalk.green('✓ All port-forwards are running correctly'));
            }

            task.title = `Checked ${totalChecked} port-forward(s), restored ${restoredCount}`;
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.system.portForwardRefreshFailed(error);
    }

    return true;
  }

  /**
   * Stop (close down) all port-forwards configured for a deployment. Kills the underlying kubectl port-forward
   * processes and removes their configuration from the deployment's remote config so a subsequent refresh does not
   * restore them and list no longer reports them.
   */
  public async stopPortForwards(argv: ArgvStruct): Promise<boolean> {
    interface StopPortForwardsContext {
      deployment: DeploymentName;
    }

    const tasks: SoloListr<StopPortForwardsContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            context_.deployment = this.configManager.getFlag<DeploymentName>(flags.deployment);
            const deployment: Deployment = this.localConfig.configuration.deploymentByName(context_.deployment);
            if (!deployment) {
              throw new SoloErrors.deployment.notFound(`Deployment ${context_.deployment} not found in local config`);
            }
          },
        },
        {
          title: 'Stop port-forwards for all components',
          task: async (_context_, task): Promise<void> => {
            const componentsToCheck: {type: string; components: BaseStateSchema[]}[] =
              DeploymentCommand.buildComponentsToCheck(this.remoteConfig.configuration.state);

            let totalConfigured: number = 0;
            let stoppedCount: number = 0;

            this.logger.showUser(chalk.cyan('\n=== Stopping Port-Forwards ===\n'));

            for (const {type, components} of componentsToCheck) {
              for (const component of components) {
                if (!component.metadata?.portForwardConfigs || component.metadata.portForwardConfigs.length === 0) {
                  continue;
                }

                const {cluster: clusterReference} = component.metadata;
                const context: string | undefined = this.localConfig.configuration.clusterRefs
                  .get(clusterReference)
                  ?.toString();
                const k8Client: K8 = this.k8Factory.getK8(context);

                // Only entries that fail to stop are retained so a later refresh can retry them.
                const remainingConfigs: PortForwardConfig[] = [];

                for (const portForwardConfig of component.metadata.portForwardConfigs) {
                  totalConfigured++;
                  const {localPort, podPort} = portForwardConfig;
                  const componentLabel: string = `${type} ${component.metadata.id}`;

                  try {
                    // stopPortForward matches the running process by local port, so no pod reference is needed.
                    // eslint-disable-next-line unicorn/no-null
                    await k8Client.pods().readByReference(null).stopPortForward(localPort);
                    stoppedCount++;
                    const detail: string = `✓ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Stopped]`;
                    this.logger.showUser(chalk.green(detail));
                  } catch (error) {
                    remainingConfigs.push(portForwardConfig);
                    const detail: string = `✗ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Failed: ${error.message}]`;
                    this.logger.showUser(chalk.red(detail));
                  }
                }

                component.metadata.portForwardConfigs = remainingConfigs;
              }
            }

            if (stoppedCount > 0) {
              await this.remoteConfig.persist();
            }

            this.logger.showUser(chalk.cyan('\n=== Summary ==='));
            this.logger.showUser(`Total port-forwards configured: ${totalConfigured}`);
            if (totalConfigured === 0) {
              this.logger.showUser(chalk.yellow('No port-forwards configured in this deployment'));
            } else {
              this.logger.showUser(chalk.green(`Stopped: ${stoppedCount}`));
              if (stoppedCount === totalConfigured) {
                this.logger.showUser(chalk.green('✓ All port-forwards stopped'));
              }
            }

            task.title = `Stopped ${stoppedCount} of ${totalConfigured} port-forward(s)`;
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.system.portForwardStopFailed(error);
    }

    return true;
  }

  /**
   * Check if a port-forward process is running on the specified port
   */
  private async isPortForwardRunning(port: number, targetPodName?: string): Promise<boolean> {
    // Validate port before process matching.
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new SoloErrors.validation.invalidPortNumber(port);
    }

    try {
      const foundProcess: ProcessInfo[] = await find('name', 'port-forward', {skipSelf: true});
      return foundProcess.some((process: ProcessInfo): boolean => {
        const command: string = (process.cmd ?? '').toLowerCase();
        if (!command.includes('port-forward') || !command.includes(`${port}:`)) {
          return false;
        }

        if (!targetPodName) {
          return true;
        }

        return command.includes(targetPodName.toLowerCase());
      });
    } catch {
      return false;
    }
  }

  /**
   * Display the full deployment status including component info, versions, and port-forward status.
   * If no deployment is specified, iterates over all local deployments.
   */
  public async showDeploymentStatus(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      deployment: DeploymentName | undefined;
    }

    interface PortStatusContext {
      config: Config;
      deployments: Deployment[];
    }

    const tasks: SoloListr<PortStatusContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            if (context_.config.deployment) {
              const deployment: Deployment = this.localConfig.configuration.deploymentByName(
                context_.config.deployment,
              );
              if (!deployment) {
                throw new SoloErrors.deployment.notFound(
                  `Deployment ${context_.config.deployment} not found in local config`,
                );
              }
              context_.deployments = [deployment];
            } else {
              const allDeployments: Deployment[] = [];
              if (this.localConfig.configuration.deployments) {
                for (const d of this.localConfig.configuration.deployments) {
                  allDeployments.push(d);
                }
              }
              if (allDeployments.length === 0) {
                throw new SoloErrors.deployment.noDeploymentsFound();
              }
              context_.deployments = allDeployments;
            }
          },
        },
        {
          title: 'Display deployment status',
          task: async (context_, task): Promise<void> => {
            // Show versions once at the top
            this.logger.showUser(chalk.cyan('\nVersions:'));
            this.logger.showUser(`  Solo Chart Version:     ${chalk.bold(version.SOLO_CHART_VERSION)}`);
            this.logger.showUser(`  Consensus Node Version: ${chalk.bold(version.HEDERA_PLATFORM_VERSION)}`);
            this.logger.showUser(`  Mirror Node Version:    ${chalk.bold(version.MIRROR_NODE_VERSION)}`);
            this.logger.showUser(`  Explorer Version:       ${chalk.bold(version.EXPLORER_VERSION)}`);
            this.logger.showUser(`  JSON RPC Relay Version: ${chalk.bold(version.HEDERA_JSON_RPC_RELAY_VERSION)}`);
            this.logger.showUser(`  Block Node Version:     ${chalk.bold(version.BLOCK_NODE_VERSION)}`);

            let grandTotalChecked: number = 0;
            let grandRunning: number = 0;
            let grandNotRunning: number = 0;

            for (const deployment of context_.deployments) {
              const namespace: NamespaceName = NamespaceName.of(deployment.namespace);
              const clusters: FacadeArray<StringFacade, string> = deployment.clusters;

              this.logger.showUser(chalk.cyan(`\n=== Deployment: ${chalk.bold(deployment.name)} ===`));
              this.logger.showUser(`  Namespace: ${chalk.bold(namespace.name)}`);

              if (clusters.length === 0) {
                this.logger.showUser(chalk.yellow('  \u26A0 No clusters configured for this deployment'));
                continue;
              }

              // Use first cluster reference (auto-select for non-interactive multi-deployment iteration)
              const clusterReference: string = clusters.get(0).toString();
              const contextValue: StringFacade = this.localConfig.configuration.clusterRefs.get(clusterReference);
              if (!contextValue) {
                this.logger.showUser(
                  chalk.yellow(`  \u26A0 No context found for cluster reference: ${clusterReference}`),
                );
                continue;
              }

              const clusterContext: string = contextValue.toString();

              try {
                await this.remoteConfig.populateFromExisting(namespace, clusterContext);
              } catch (error: Error | unknown) {
                const message: string = error instanceof Error ? error.message : String(error);
                this.logger.showUser(
                  chalk.yellow(`  \u26A0 Could not load remote config (cluster may be unreachable): ${message}`),
                );
                continue;
              }

              // Show deployed components
              const state: typeof this.remoteConfig.configuration.state = this.remoteConfig.configuration.state;
              const consensusNodes: BaseStateSchema[] = state.consensusNodes || [];
              const haProxies: BaseStateSchema[] = state.haProxies || [];
              const blockNodes: BaseStateSchema[] = state.blockNodes || [];
              const mirrorNodes: BaseStateSchema[] = state.mirrorNodes || [];
              const relayNodes: BaseStateSchema[] = state.relayNodes || [];
              const explorers: BaseStateSchema[] = state.explorers || [];

              this.logger.showUser(chalk.cyan('\n  Deployed Components:'));
              if (consensusNodes.length > 0) {
                const nodeNames: string = consensusNodes
                  .map((n: BaseStateSchema): string => String(n.metadata.id))
                  .join(', ');
                this.logger.showUser(
                  `    ${chalk.green('\u2713')} Consensus Nodes: ${chalk.bold(String(consensusNodes.length))} (${nodeNames})`,
                );
              }
              if (mirrorNodes.length > 0) {
                this.logger.showUser(
                  `    ${chalk.green('\u2713')} Mirror Nodes: ${chalk.bold(String(mirrorNodes.length))}`,
                );
              }
              if (blockNodes.length > 0) {
                this.logger.showUser(
                  `    ${chalk.green('\u2713')} Block Nodes: ${chalk.bold(String(blockNodes.length))}`,
                );
              }
              if (relayNodes.length > 0) {
                this.logger.showUser(
                  `    ${chalk.green('\u2713')} Relay Nodes: ${chalk.bold(String(relayNodes.length))}`,
                );
              }
              if (explorers.length > 0) {
                this.logger.showUser(`    ${chalk.green('\u2713')} Explorers: ${chalk.bold(String(explorers.length))}`);
              }
              if (haProxies.length > 0) {
                this.logger.showUser(
                  `    ${chalk.green('\u2713')} HA Proxies: ${chalk.bold(String(haProxies.length))}`,
                );
              }

              // Show port-forward status
              const componentsToCheck: {type: string; components: BaseStateSchema[]}[] =
                DeploymentCommand.buildComponentsToCheck(state);

              let totalChecked: number = 0;
              let runningCount: number = 0;
              let notRunningCount: number = 0;

              this.logger.showUser(chalk.cyan('\n  Port-Forward Status:'));
              for (const {type, components} of componentsToCheck) {
                for (const component of components) {
                  if (!component.metadata?.portForwardConfigs || component.metadata.portForwardConfigs.length === 0) {
                    continue;
                  }

                  for (const portForwardConfig of component.metadata.portForwardConfigs) {
                    totalChecked++;
                    const {localPort, podPort} = portForwardConfig;
                    const componentLabel: string = `${type} ${component.metadata.id}`;

                    const isRunning: boolean = await this.isPortForwardRunning(localPort);

                    if (isRunning) {
                      runningCount++;
                      this.logger.showUser(
                        chalk.green(`    \u2713 ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Running]`),
                      );
                    } else {
                      notRunningCount++;
                      this.logger.showUser(
                        chalk.yellow(
                          `    \u26A0 ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Not Running]`,
                        ),
                      );
                    }
                  }
                }
              }

              if (totalChecked === 0) {
                this.logger.showUser(chalk.yellow('    No port-forwards configured'));
              } else {
                this.logger.showUser(`    Running: ${chalk.green(String(runningCount))} / ${totalChecked}`);
                if (notRunningCount > 0) {
                  this.logger.showUser(
                    chalk.yellow(
                      `    Tip: Run 'solo deployment port-forwards refresh --deployment ${deployment.name}' to restore missing port-forwards.`,
                    ),
                  );
                }
              }

              grandTotalChecked += totalChecked;
              grandRunning += runningCount;
              grandNotRunning += notRunningCount;
            }

            this.logger.showUser(chalk.cyan('\n=== Overall Summary ==='));
            this.logger.showUser(`Deployments checked: ${context_.deployments.length}`);
            this.logger.showUser(`Total port-forwards: ${grandTotalChecked}`);
            if (grandTotalChecked > 0) {
              this.logger.showUser(chalk.green(`Running: ${grandRunning}`));
              if (grandNotRunning > 0) {
                this.logger.showUser(chalk.yellow(`Not running: ${grandNotRunning}`));
              } else {
                this.logger.showUser(chalk.green('\u2713 All port-forwards are running correctly'));
              }
            }

            task.title = `Checked ${context_.deployments.length} deployment(s): ${grandTotalChecked} port-forward(s), ${grandRunning} running`;
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.system.portForwardStatusFailed(error);
    }

    return true;
  }

  /**
   * Get the pod name for a component based on its type
   */
  private static buildComponentsToCheck(state: DeploymentStateSchema): {type: string; components: BaseStateSchema[]}[] {
    return [
      {type: 'ConsensusNode', components: state.consensusNodes || []},
      {type: 'HaProxy', components: state.haProxies || []},
      {type: 'BlockNode', components: state.blockNodes || []},
      {type: 'MirrorNode', components: state.mirrorNodes || []},
      {type: 'RelayNode', components: state.relayNodes || []},
      {type: 'Explorer', components: state.explorers || []},
    ];
  }

  private async getPodNameForComponent(
    component: BaseStateSchema,
    componentType: string,
    k8Client: K8,
    namespace: NamespaceName,
  ): Promise<PodName | null> {
    try {
      const labels: string[] = Templates.renderComponentLabelSelectors(componentType, component.metadata.id);
      if (labels.length === 0) {
        return undefined;
      }

      const pods: Pod[] = await k8Client.pods().list(namespace, labels);
      if (pods?.length > 0) {
        if (componentType === 'ConsensusNode') {
          const haProxyPod: Pod | undefined = pods.find((pod): boolean =>
            pod.podReference?.name?.toString()?.startsWith('haproxy-node'),
          );
          if (haProxyPod) {
            return haProxyPod.podReference.name;
          }
        }
        if (componentType === 'MirrorNode') {
          // Only bind the mirror ingress pod; never fall back to pods[0], which can be another haproxy-ingress (e.g. Explorer).
          const mirrorIngressPod: Pod | undefined = pods.find((pod): boolean =>
            pod.podReference?.name?.toString()?.startsWith(constants.MIRROR_INGRESS_CONTROLLER),
          );
          return mirrorIngressPod?.podReference?.name;
        }
        return pods[0].podReference.name;
      }

      return undefined;
    } catch (error) {
      this.logger.warn(`Error finding pod for ${componentType}: ${error.message}`);
      return undefined;
    }
  }

  private async deploymentRemoteConfigExists(existingDeployment: Deployment): Promise<boolean> {
    const deploymentNamespace: NamespaceName = NamespaceName.of(existingDeployment.namespace);
    const clusterReferences: FacadeArray<StringFacade, string> = existingDeployment.clusters;

    for (const clusterReferenceFacade of clusterReferences) {
      const clusterReference: string = clusterReferenceFacade.toString();
      const clusterContext: Optional<string> = this.localConfig.configuration.clusterRefs
        .get(clusterReference)
        ?.toString();

      if (!clusterContext) {
        continue;
      }

      try {
        const k8: K8 = this.k8Factory.getK8(clusterContext);
        const namespaceExists: boolean = await k8.namespaces().has(deploymentNamespace);

        if (!namespaceExists) {
          continue;
        }

        const remoteConfigExists: boolean = await k8
          .configMaps()
          .exists(deploymentNamespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);

        if (remoteConfigExists) {
          return true;
        }
      } catch (error: unknown) {
        this.logger.debug(
          `Could not connect to cluster context '${clusterContext}' for deployment '${existingDeployment.name}': ${
            error instanceof Error ? error.message : String(error)
          }. Treating as stale.`,
        );
      }
    }

    return false;
  }
}
