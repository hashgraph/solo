// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrRendererValue} from 'listr2';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags} from '../flags.js';
import {AnyListrContext, type ArgvStruct, type NodeAlias} from '../../types/aliases.js';
import {SoloListrTaskWrapper, type DeploymentName, type Optional, type SoloListr} from '../../types/index.js';
import {CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {inject, injectable} from 'tsyringe-neo';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {type OneShotCommand} from './one-shot-command.js';
import {OneShotSingleDeployConfigClass} from './one-shot-single-deploy-config-class.js';
import {type OneShotVersionsObject} from './one-shot-versions-object.js';
import * as version from '../../../version.js';
import {EdgeVersionFetcher} from '../../core/edge-version-fetcher.js';
import {type EdgeVersionsObject} from '../../core/edge-versions-object.js';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type FalconPrepareConfig} from './falcon-prepare-config.js';
import {type FalconOverrideValue, type FalconPrepareSpec} from './falcon-prepare-spec.js';
import {FalconPrepareSpecLoader} from './falcon-prepare-spec-loader.js';
import {FALCON_DEPLOY_COMMAND, FALCON_PREPARE_COMMAND} from './one-shot-command-paths.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {UserInput} from '../../core/user-input.js';
import fs from 'node:fs';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import yaml from 'yaml';
import {NetworkCommand} from '../network.js';
import {MirrorNodeCommand} from '../mirror-node.js';
import {RelayCommand} from '../relay.js';
import {ExplorerCommand} from '../explorer.js';
import {BlockNodeCommand} from '../block-node.js';
import {SETUP_FLAGS as NODE_SETUP_FLAGS, START_FLAGS as NODE_START_FLAGS} from '../node/flags.js';
import {negatedOptionFromFlag, optionFromFlag, soloCommand} from '../command-helpers.js';
import {ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../../integration/kube/k8.js';
import {Templates} from '../../core/templates.js';
import {type Lock} from '../../core/lock/lock.js';
import {type SoloEventBus} from '../../core/events/solo-event-bus.js';
import {type OneShotDeployOrchestrator} from './orchestrator/deploy/one-shot-deploy-orchestrator.js';
import {type OneShotDestroyOrchestrator} from './orchestrator/destroy/one-shot-destroy-orchestrator.js';
import {type OrchestratorPipeline} from './orchestrator/orchestrator-pipeline.js';
import {type OneShotSingleDestroyContext} from './one-shot-single-destroy-context.js';
import {Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {type DeploymentStateSchema} from '../../data/schema/model/remote/deployment-state-schema.js';
import {OneShotInfoContext} from './one-shot-info-context.js';
import {type ApplicationVersionsSchema} from '../../data/schema/model/common/application-versions-schema.js';
import path from 'node:path';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {K8Helper} from '../../business/utils/k8-helper.js';

/** A single account entry from the one-shot deployment's accounts.json file. */
interface OneShotAccount {
  accountId?: string;
  name?: string;
  balance?: string;
  publicAddress?: string;
}

@injectable()
export class DefaultOneShotCommand extends BaseCommand implements OneShotCommand {
  private _isRollback: boolean = false;

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.minimalSetup,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
      flags.edgeEnabled,
      flags.consensusNodeVersion,
      flags.mirrorNodeVersion,
      flags.pinger,
      flags.relayReleaseTag,
      flags.relayVersion,
      flags.explorerVersion,
      flags.blockNodeChartVersion,
      flags.blockNodeVersion,
      flags.deployMetricsServer,
    ],
  };

  public static readonly MULTI_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DEPLOY_FLAGS_LIST.optional, flags.numberOfConsensusNodes],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public static readonly FALCON_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.valuesFile,
      flags.numberOfConsensusNodes,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.deployMirrorNode,
      flags.deployExplorer,
      flags.deployRelay,
      flags.deployMetricsServer,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
      flags.consensusNodeVersion,
      flags.mirrorNodeVersion,
      flags.relayReleaseTag,
      flags.relayVersion,
      flags.explorerVersion,
      flags.blockNodeChartVersion,
      flags.blockNodeVersion,
      flags.edgeEnabled,
    ],
  };

  public static readonly FALCON_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DESTROY_FLAGS_LIST.optional],
  };

  public static readonly INFO_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public static readonly SHOW_ACCOUNTS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment, flags.output],
  };

  public static readonly FALCON_PREPARE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.outputValuesFile,
      flags.quiet,
      flags.numberOfConsensusNodes,
      flags.releaseTag,
      flags.consensusNodeVersion,
      flags.relayReleaseTag,
      flags.relayVersion,
      flags.soloChartVersion,
      flags.mirrorNodeVersion,
      flags.blockNodeChartVersion,
      flags.blockNodeVersion,
      flags.explorerVersion,
      flags.loadBalancerEnabled,
      flags.forcePortForward,
      flags.localBuildPath,
      flags.debugNodeAlias,
    ],
  };

  private static readonly FALCON_PREPARE_CONFIGS_NAME: string = 'falconPrepareConfigs';

  public constructor(
    @inject(InjectTokens.OneShotDeployOrchestrator)
    private readonly deployOrchestrator: OneShotDeployOrchestrator,
    @inject(InjectTokens.OneShotDestroyOrchestrator)
    private readonly destroyOrchestrator: OneShotDestroyOrchestrator,
    @inject(InjectTokens.SoloEventBus)
    private readonly eventBus: SoloEventBus,
  ) {
    super();
    this.deployOrchestrator = patchInject(
      deployOrchestrator,
      InjectTokens.OneShotDeployOrchestrator,
      this.constructor.name,
    );
    this.destroyOrchestrator = patchInject(
      destroyOrchestrator,
      InjectTokens.OneShotDestroyOrchestrator,
      this.constructor.name,
    );
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
  }

  public async deploy(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.DEPLOY_FLAGS_LIST);
  }

  public async deployFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST);
  }

  private async performRollback(
    deployError: Error,
    config: OneShotSingleDeployConfigClass | undefined,
  ): Promise<never> {
    if (!config) {
      throw new SoloErrors.component.oneShotDeployFailed(
        `Deploy failed: ${deployError.message}. Rollback skipped: no resources created.`,
        deployError,
      );
    }

    if (config.rollback === false) {
      this.logger.warn('Automatic rollback skipped (--no-rollback flag provided)');
      this.logger.warn('To clean up: solo one-shot single destroy');
      this.logger.warn(`Or: kubectl delete ns ${config.namespace.name}`);
      throw new SoloErrors.component.oneShotDeployFailed(
        `Deploy failed: ${deployError.message}. Rollback skipped (--no-rollback).`,
        deployError,
      );
    }

    this.logger.warn(
      `Deploy failed. Starting automatic rollback for deployment '${config.deployment}' in namespace '${config.namespace.name}'...`,
    );

    const destroyArgv: ArgvStruct = {
      _: [],
      deployment: config.deployment,
      clusterRef: config.clusterRef,
      namespace: config.namespace.name,
      context: config.context,
      quiet: true,
    };

    this._isRollback = true;
    try {
      await this.destroyInternal(destroyArgv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
    } catch (rollbackError) {
      this.logger.error(`Rollback failed for deployment '${config.deployment}': ${rollbackError.message}`);
      throw new SoloErrors.component.oneShotDeployFailed(
        `Deploy failed: ${deployError.message}. Rollback also failed: ${rollbackError.message}`,
        deployError,
      );
    } finally {
      // Safety net: ensure namespace is always deleted during rollback, even if destroyInternal
      // failed or skipped namespace cleanup (e.g. due to skipAll, helm uninstall failure, etc.)
      try {
        const k8: K8 = this.k8Factory.getK8(config.context);
        if (await k8.namespaces().has(config.namespace)) {
          const shouldDeleteNamespace: boolean = await new K8Helper(config.context).isNamespaceOwnedBySolo(
            config.namespace,
          );

          if (shouldDeleteNamespace) {
            this.logger.warn(`Rollback cleanup: deleting namespace '${config.namespace.name}'`);
            await k8.namespaces().delete(config.namespace);
          } else {
            this.logger.warn(`Rollback cleanup: skipping namespace '${config.namespace.name}', not created by solo`);
          }
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to delete namespace '${config.namespace.name}' during rollback cleanup: ${cleanupError.message}`,
        );
      }

      this._isRollback = false;
    }

    this.logger.info(`Rollback complete. Cache preserved at: ${config.cacheDir}`);
    throw new SoloErrors.component.oneShotDeployFailed(
      `Deploy failed: ${deployError.message}. Rollback completed successfully.`,
      deployError,
    );
  }

  private async deployInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    const leaseReference: {value?: Lock} = {};
    const configReference: {value?: OneShotSingleDeployConfigClass} = {};
    const deferUserOutput: boolean = argv[flags.parallelDeploy.name] !== false;
    if (deferUserOutput) {
      this.logger.beginDeferredUserOutput();
    }
    this.eventBus.reset();
    try {
      await this.deployOrchestrator.buildDeployPipeline(argv, flagsList, leaseReference, configReference).run();
    } catch (error) {
      const rootError: Error = this.eventBus.abortReason() ?? error;
      await this.performRollback(rootError, configReference.value);
    } finally {
      if (deferUserOutput) {
        this.logger.flushDeferredUserOutput();
      }
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (leaseReference.value) {
        cleanupPromises.push(
          leaseReference.value.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => {
            this.logger.error('Error during closing task list:', error);
          }),
      );
      await Promise.all(cleanupPromises);
    }
    return true;
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${UserInput.safeFilenameComponent(deploymentName)}`);
  }

  /** Prints the one-shot deployment's `accounts.json` file in the format given by `--output`. */
  public async showAccounts(): Promise<boolean> {
    const deploymentName: DeploymentName =
      this.configManager.getFlag(flags.deployment) || constants.ONE_SHOT_DEPLOYMENT_NAME;

    const accountsFile: string = PathEx.join(this.getOneShotOutputDirectory(deploymentName), 'accounts.json');

    if (!fs.existsSync(accountsFile)) {
      this.logger.showUser(chalk.yellow(`\n⚠️  Accounts file not found: ${accountsFile}`));
      return true;
    }

    const format: 'json' | 'yaml' | 'wide' = this.resolveOutputFormat();
    const accounts: Record<string, OneShotAccount[]> = JSON.parse(fs.readFileSync(accountsFile, 'utf8')) as Record<
      string,
      OneShotAccount[]
    >;

    if (format === 'json') {
      this.logger.showUser(JSON.stringify(accounts, undefined, 2));
      return true;
    }
    if (format === 'yaml') {
      this.logger.showUser(yaml.stringify(accounts));
      return true;
    }

    this.logger.showUser(chalk.cyan(`\n=== Accounts: ${accountsFile} ===`));
    for (const [groupName, groupAccounts] of Object.entries(accounts)) {
      if (Array.isArray(groupAccounts) && groupAccounts.length > 0) {
        this.logger.showList(
          groupName,
          groupAccounts.map((account): string =>
            [account.accountId, account.name, account.balance, account.publicAddress].filter(Boolean).join('  '),
          ),
        );
      }
    }
    return true;
  }

  /** Resolves the `--output` flag to a supported format, defaulting to `wide`. */
  private resolveOutputFormat(): 'json' | 'yaml' | 'wide' {
    const rawOutput: string = this.configManager.getFlag(flags.output);
    switch (rawOutput) {
      case '':
      case 'wide': {
        return 'wide';
      }
      case 'json':
      case 'yaml': {
        return rawOutput;
      }
      default: {
        throw new SoloErrors.validation.invalidOutputFormat(rawOutput);
      }
    }
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
  }

  public async destroyFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.FALCON_DESTROY_FLAGS_LIST);
  }

  private async destroyInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    const leaseReference: {value?: Lock} = {};
    const runningNested: boolean = this.oneShotState.isActive();
    const commandName: string = argv._.slice(0, 3).join(' ');
    const pipeline: OrchestratorPipeline<OneShotSingleDestroyContext> = this.destroyOrchestrator.buildDestroyPipeline(
      argv,
      flagsList,
      leaseReference,
      runningNested,
    );
    const tasks: SoloListr<OneShotSingleDestroyContext> = this.taskList.newTaskList(
      pipeline.tasks,
      pipeline.defaultOptions,
      undefined,
      commandName,
    );

    if (!tasks.isRoot()) {
      return true;
    }

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.oneShotDestroyFailed(error);
    } finally {
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (leaseReference.value) {
        cleanupPromises.push(
          leaseReference.value.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => this.logger.error('Error during closing task list:', error)),
      );
      await Promise.all(cleanupPromises);
    }
    return true;
  }

  public async info(): Promise<boolean> {
    const tasks: SoloListr<OneShotInfoContext> = new Listr(
      [
        {
          title: 'Determine deployment name',
          task: async (context_): Promise<void> => {
            const deploymentFromFlag: DeploymentName = this.configManager.getFlag(flags.deployment);
            if (deploymentFromFlag) {
              context_.deploymentName = deploymentFromFlag;
              this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(deploymentFromFlag)} (from flag)`));
              return;
            }

            context_.deploymentName = constants.ONE_SHOT_DEPLOYMENT_NAME;
            this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(context_.deploymentName)} (default)`));
          },
        },
        {
          title: 'Load local configuration',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            const deployment: Deployment = this.localConfig.configuration.deployments.find(
              (d): boolean => d.name === context_.deploymentName,
            );

            if (!deployment) {
              this.logger.showUser(
                chalk.yellow(
                  `\n⚠️  Deployment '${context_.deploymentName}' not found in local configuration.\n` +
                    'This may be a deployment that was created but not properly registered.',
                ),
              );
              return;
            }

            context_.deployment = deployment;
            this.logger.showUser(chalk.cyan(`\nNamespace: ${chalk.bold(deployment.namespace)}`));

            if (deployment.clusters && deployment.clusters.length > 0) {
              const clusterNames: string = deployment.clusters.map((c): string => c.toString()).join(', ');
              this.logger.showUser(chalk.cyan(`Clusters: ${chalk.bold(clusterNames)}`));
            }
          },
        },
        {
          title: 'Check cluster connectivity',
          task: async (context_, task): Promise<void> => {
            if (!context_.deployment) {
              task.skip('No deployment configuration found');
              return;
            }

            const deployment: Deployment = context_.deployment;
            if (!deployment.clusters || deployment.clusters.length === 0) {
              this.logger.showUser(chalk.yellow('\n⚠️  No clusters attached to this deployment.'));
              return;
            }

            const clusterReference: string = deployment.clusters.get(0).toString();
            const clusterContext: StringFacade | undefined =
              this.localConfig.configuration.clusterRefs.get(clusterReference);

            if (!clusterContext) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Cluster reference '${clusterReference}' not found in configuration.`),
              );
              return;
            }

            try {
              this.k8Factory.default().contexts().updateCurrent(clusterContext.toString());
              const namespaces: NamespaceName[] = await this.k8Factory.default().namespaces().list();
              const targetNamespace: NamespaceName = namespaces.find((ns): boolean => ns.name === deployment.namespace);

              if (!targetNamespace) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Namespace '${deployment.namespace}' not found in cluster '${clusterReference}'.` +
                      '\nThe deployment may have been destroyed or is not accessible.',
                  ),
                );
                return;
              }

              context_.clusterConnected = true;
            } catch (error) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Unable to connect to cluster '${clusterReference}'.\n` + `Error: ${error.message}`),
              );
            }
          },
        },
        {
          title: 'Fetch deployment state',
          task: async (context_, task): Promise<void> => {
            if (!context_.clusterConnected || !context_.deployment) {
              task.skip('Cluster not accessible or no deployment configuration');
              return;
            }

            const deployment: Deployment = context_.deployment;

            try {
              const namespaceName: NamespaceName = NamespaceName.of(deployment.namespace);
              const configMaps: ConfigMap[] = await this.k8Factory.default().configMaps().list(namespaceName, []);

              const remoteConfigMap: Optional<ConfigMap> = configMaps.find(
                (cm): boolean => cm.name === constants.SOLO_REMOTE_CONFIGMAP_NAME,
              );

              if (!remoteConfigMap) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Remote configuration not found in namespace '${deployment.namespace}'.` +
                      '\nThe deployment may have been partially destroyed.',
                  ),
                );
                return;
              }

              context_.remoteConfig = yaml.parse(remoteConfigMap.data[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]);
            } catch (error) {
              this.logger.showUser(chalk.yellow(`\n⚠️  Unable to fetch remote configuration: ${error.message}`));
            }
          },
        },
        {
          title: 'Display deployment information',
          task: async (context_): Promise<void> => {
            this.logger.showUser(chalk.cyan('\n=== Deployment Components ==='));

            const versions: ApplicationVersionsSchema = context_.remoteConfig.versions;

            // Show versions
            this.logger.showUser(chalk.cyan('\nVersions:'));
            this.logger.showUser(`  Solo Chart Version: ${chalk.bold(versions.chart?.toString())}`);
            this.logger.showUser(`  Consensus Node Version: ${chalk.bold(versions.consensusNode?.toString())}`);
            this.logger.showUser(`  Mirror Node Version: ${chalk.bold(versions.mirrorNodeChart?.toString())}`);
            this.logger.showUser(`  Explorer Version: ${chalk.bold(versions.explorerChart?.toString())}`);
            this.logger.showUser(`  JSON RPC Relay Version: ${chalk.bold(versions.jsonRpcRelayChart?.toString())}`);
            this.logger.showUser(`  Block Node Version: ${chalk.bold(versions.blockNodeChart?.toString())}`);

            if (context_.remoteConfig) {
              const components: DeploymentStateSchema = context_.remoteConfig.state;

              if (components) {
                this.logger.showUser(chalk.cyan('\nDeployed Components:'));

                if (components.consensusNodes && components.consensusNodes.length > 0) {
                  const nodeNames: string = components.consensusNodes
                    .map((n): NodeAlias => Templates.renderNodeAliasFromNumber(n.metadata.id))
                    .join(', ');

                  this.logger.showUser(
                    `  ${chalk.green('✓')} Consensus Nodes: ${chalk.bold(components.consensusNodes.length)} (${nodeNames})`,
                  );
                }

                if (components.mirrorNodes && components.mirrorNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Mirror Nodes: ${chalk.bold(components.mirrorNodes.length)}`,
                  );
                }

                if (components.blockNodes && components.blockNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Block Nodes: ${chalk.bold(components.blockNodes.length)}`,
                  );
                }

                if (components.relayNodes && components.relayNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Relay Nodes: ${chalk.bold(components.relayNodes.length)}`,
                  );
                }

                if (components.explorers && components.explorers.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Explorers: ${chalk.bold(components.explorers.length)}`);
                }

                if (components.postgres && components.postgres.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Postgres: ${chalk.bold(components.postgres.length)}`);
                }

                if (components.redis && components.redis.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Redis: ${chalk.bold(components.redis.length)}`);
                }
              }
            } else {
              this.logger.showUser(
                chalk.yellow('\n⚠️  Remote configuration not available. Cannot display deployed components.'),
              );
            }

            // Show information about where files are stored
            const outputDirectory: string = this.getOneShotOutputDirectory(context_.deploymentName);

            this.logger.showUser(chalk.cyan('\n=== Deployment Files ==='));

            if (fs.existsSync(outputDirectory)) {
              this.logger.showUser(`Output directory: ${chalk.bold(outputDirectory)}`);

              const notesFile: string = PathEx.join(outputDirectory, 'notes');
              const versionsFile: string = PathEx.join(outputDirectory, 'versions');
              const forwardsFile: string = PathEx.join(outputDirectory, 'forwards');
              const accountsFile: string = PathEx.join(outputDirectory, 'accounts.json');

              if (fs.existsSync(notesFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Notes: ${notesFile}`);
              }
              if (fs.existsSync(versionsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Versions: ${versionsFile}`);
              }
              if (fs.existsSync(forwardsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Port forwards: ${forwardsFile}`);
              }
              if (fs.existsSync(accountsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Accounts: ${accountsFile}`);
              }
            } else {
              this.logger.showUser(chalk.yellow(`\n⚠️  Output directory not found: ${outputDirectory}`));
            }

            this.logger.showUser(chalk.green('\n✓ Deployment information retrieved successfully.\n'));
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.oneShotDeploymentInfoRetrievalFailed(error);
    }

    return true;
  }

  private async resolveOneShotComponentVersions(useEdge: boolean): Promise<OneShotVersionsObject> {
    if (!useEdge) {
      return {
        soloChart: version.SOLO_CHART_VERSION,
        consensus: version.HEDERA_PLATFORM_VERSION,
        mirror: version.MIRROR_NODE_VERSION,
        explorer: version.EXPLORER_VERSION,
        relay: version.HEDERA_JSON_RPC_RELAY_VERSION,
        blockNode: version.BLOCK_NODE_VERSION,
      };
    }

    const edgeVersions: OneShotVersionsObject = {
      soloChart: version.SOLO_CHART_EDGE_VERSION,
      consensus: version.HEDERA_PLATFORM_EDGE_VERSION,
      mirror: version.MIRROR_NODE_EDGE_VERSION,
      explorer: version.EXPLORER_EDGE_VERSION,
      relay: version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
      blockNode: version.BLOCK_NODE_EDGE_VERSION,
    };

    const resolvedComponentVersions: EdgeVersionsObject = await EdgeVersionFetcher.resolveEdgeVersions({
      consensus: edgeVersions.consensus,
      mirror: edgeVersions.mirror,
      blockNode: edgeVersions.blockNode,
      explorer: edgeVersions.explorer,
      relay: edgeVersions.relay,
    });

    return {
      soloChart: edgeVersions.soloChart,
      consensus: resolvedComponentVersions.consensus,
      mirror: resolvedComponentVersions.mirror,
      explorer: resolvedComponentVersions.explorer,
      relay: resolvedComponentVersions.relay,
      blockNode: resolvedComponentVersions.blockNode,
    };
  }

  public async prepareFalcon(argv: ArgvStruct): Promise<boolean> {
    this.configManager.update(argv);

    const configuredOutputPath: string = this.configManager.getFlag(flags.outputValuesFile);
    const resolvedOutputPath: string = path.isAbsolute(configuredOutputPath)
      ? configuredOutputPath
      : PathEx.resolve(process.env.INIT_CWD || process.cwd(), configuredOutputPath);

    const quiet: boolean = this.configManager.getFlag(flags.quiet);

    let config: FalconPrepareConfig;

    const tasks: Listr<AnyListrContext, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Configure deployment options',
          task: async (_context: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>): Promise<void> => {
            const allFlags: CommandFlag[] = [
              ...DefaultOneShotCommand.FALCON_PREPARE_FLAGS_LIST.required,
              ...DefaultOneShotCommand.FALCON_PREPARE_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            config = this.configManager.getConfig(DefaultOneShotCommand.FALCON_PREPARE_CONFIGS_NAME, allFlags, [
              'enableDevChartMode',
              'enableMirrorIngress',
              'outputPath',
            ]) as FalconPrepareConfig;

            config.enableMirrorIngress = true;
            config.outputPath = resolvedOutputPath;

            await this.runFalconPreparePrompts(FalconPrepareSpecLoader.load(), config, task, quiet);
          },
        },
        {
          title: 'Generate values file',
          task: async (): Promise<void> => {
            const yamlContent: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
            fs.writeFileSync(config.outputPath, yamlContent);
            this.logger.showUser(chalk.green(`\nFalcon values file generated: ${config.outputPath}`));
            this.logger.showUser(
              `\nTo deploy, run:\n  ${soloCommand(FALCON_DEPLOY_COMMAND, optionFromFlag(flags.valuesFile), config.outputPath)}`,
            );
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.falconValuesPreparationFailed(error);
    }

    return true;
  }

  /**
   * Registry mapping a spec `flagsFrom` key to the command flag-list it enumerates. Class
   * references cannot live in the YAML spec, so this is the one piece of the generation that stays
   * in code.
   */
  private static readonly FALCON_FLAG_LISTS: ReadonlyMap<string, CommandFlags> = new Map<string, CommandFlags>([
    ['network.deploy', NetworkCommand.DEPLOY_FLAGS_LIST],
    ['node.setup', NODE_SETUP_FLAGS],
    ['node.start', NODE_START_FLAGS],
    ['mirror.deploy', MirrorNodeCommand.DEPLOY_FLAGS_LIST],
    ['relay.deploy', RelayCommand.DEPLOY_FLAGS_LIST],
    ['block.add', BlockNodeCommand.ADD_FLAGS_LIST],
    ['explorer.deploy', ExplorerCommand.DEPLOY_FLAGS_LIST],
  ]);

  /**
   * Resolves a spec override value against the wizard answers and flag defaults. See the override
   * value grammar documented in `resources/one-shot-falcon-prepare.yaml`.
   */
  private static resolveFalconValue(
    raw: FalconOverrideValue,
    flag: CommandFlag,
    config: FalconPrepareConfig,
  ): FalconOverrideValue {
    if (typeof raw !== 'string') {
      return raw;
    }
    if (raw === '${default}') {
      return flag.definition.defaultValue as FalconOverrideValue;
    }
    const configReference: RegExpExecArray | null = /^\$\{config\.([A-Za-z0-9_]+)\}$/.exec(raw);
    if (configReference) {
      const configKey: string = configReference[1];
      if (!Object.hasOwn(config, configKey)) {
        throw new SoloErrors.component.falconValuesPreparationFailed(
          new Error(`Unknown config key '${configKey}' referenced in falcon prepare spec`),
        );
      }
      return (config as unknown as Record<string, FalconOverrideValue>)[configKey];
    }
    return raw;
  }

  private static buildFalconSection(
    section: FalconPrepareSpec['sections'][number],
    blockedFlags: ReadonlySet<string>,
    config: FalconPrepareConfig,
  ): Record<string, FalconOverrideValue> {
    const flagList: CommandFlags | undefined = DefaultOneShotCommand.FALCON_FLAG_LISTS.get(section.flagsFrom);
    if (!flagList) {
      throw new SoloErrors.component.falconValuesPreparationFailed(
        new Error(`Unknown falcon prepare flagsFrom '${section.flagsFrom}' for section '${section.name}'`),
      );
    }

    // Fail fast on override keys that are not real flag names: a typo (e.g. `dev` instead of
    // `debug`) would otherwise be silently dropped, leaving the flag at its empty default.
    for (const overrideKey of Object.keys(section.overrides ?? {})) {
      if (!flags.allFlagsMap.has(overrideKey)) {
        throw new SoloErrors.component.falconValuesPreparationFailed(
          new Error(`Unknown flag '${overrideKey}' in overrides for section '${section.name}'`),
        );
      }
    }

    const built: Record<string, FalconOverrideValue> = {};
    for (const flag of flagList.optional) {
      if (blockedFlags.has(flag.name)) {
        continue;
      }
      built[optionFromFlag(flag)] =
        section.overrides && Object.hasOwn(section.overrides, flag.name)
          ? DefaultOneShotCommand.resolveFalconValue(section.overrides[flag.name], flag, config)
          : '';
    }

    // Keys forced in regardless of the flag-list (legacy version keys kept for backward
    // compatibility with existing templates, tests, and user-edited values files).
    for (const [flagName, raw] of Object.entries(section.extraKeys ?? {})) {
      const flag: CommandFlag | undefined = flags.allFlagsMap.get(flagName);
      if (!flag) {
        throw new SoloErrors.component.falconValuesPreparationFailed(
          new Error(`Unknown flag '${flagName}' in extraKeys for section '${section.name}'`),
        );
      }
      built[optionFromFlag(flag)] = DefaultOneShotCommand.resolveFalconValue(raw, flag, config);
    }

    return built;
  }

  public static generateFalconValuesYaml(config: FalconPrepareConfig): string {
    const spec: FalconPrepareSpec = FalconPrepareSpecLoader.load();
    const blockedFlags: ReadonlySet<string> = new Set(spec.blockedFlags);

    const valuesObject: Record<string, Record<string, FalconOverrideValue>> = {};
    for (const section of spec.sections) {
      valuesObject[section.name] = DefaultOneShotCommand.buildFalconSection(section, blockedFlags, config);
    }

    const header: string =
      '# One-Shot Falcon Deployment Configuration\n' +
      `# Generated by: ${soloCommand(FALCON_PREPARE_COMMAND)}\n` +
      '# This file configures all components of the Hiero network deployment\n' +
      `#\n# Consensus nodes: ${config.numberOfConsensusNodes}\n` +
      '#\n# Usage:\n' +
      `#   ${soloCommand(FALCON_DEPLOY_COMMAND, optionFromFlag(flags.valuesFile), config.outputPath)}\n` +
      '#\n# To disable optional components, pass CLI flags:\n' +
      `#   ${negatedOptionFromFlag(flags.deployMirrorNode)}\n` +
      `#   ${negatedOptionFromFlag(flags.deployExplorer)}\n` +
      `#   ${negatedOptionFromFlag(flags.deployRelay)}\n\n`;

    return header + yaml.stringify(valuesObject, {lineWidth: 0});
  }

  /**
   * Runs the spec-defined interactive prompt workflow, writing each answer into `config`. In quiet
   * mode a step that opts in via `skipWhenQuiet` is replaced by its `quietValue` instead of prompting.
   */
  private async runFalconPreparePrompts(
    spec: FalconPrepareSpec,
    config: FalconPrepareConfig,
    task: SoloListrTaskWrapper<AnyListrContext>,
    quiet: boolean,
  ): Promise<void> {
    const target: Record<string, unknown> = config as unknown as Record<string, unknown>;
    for (const prompt of spec.prompts) {
      if (prompt.type !== 'confirm') {
        throw new SoloErrors.component.falconValuesPreparationFailed(
          new Error(`Unsupported falcon prepare prompt type '${prompt.type}' for '${prompt.configKey}'`),
        );
      }

      if (quiet && prompt.skipWhenQuiet) {
        target[prompt.configKey] = prompt.quietValue ?? false;
        continue;
      }

      const answer: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
        message: prompt.message,
        default: prompt.default,
      });
      target[prompt.configKey] = answer;

      if (answer && prompt.onTrue) {
        const followUpFlags: CommandFlag[] = prompt.onTrue.promptFlags.map((name: string): CommandFlag => {
          const flag: CommandFlag | undefined = flags.allFlagsMap.get(name);
          if (!flag) {
            throw new SoloErrors.component.falconValuesPreparationFailed(
              new Error(`Unknown flag '${name}' in promptFlags for prompt '${prompt.configKey}'`),
            );
          }
          return flag;
        });
        await this.configManager.executePrompt(task, followUpFlags);
        for (const entry of prompt.onTrue.setConfig) {
          const flag: CommandFlag | undefined = flags.allFlagsMap.get(entry.flag);
          if (!flag) {
            throw new SoloErrors.component.falconValuesPreparationFailed(
              new Error(`Unknown flag '${entry.flag}' in setConfig for prompt '${prompt.configKey}'`),
            );
          }
          target[entry.configKey] = this.configManager.getFlag(flag);
        }
      }
    }
  }

  public async close(): Promise<void> {} // no-op
}
