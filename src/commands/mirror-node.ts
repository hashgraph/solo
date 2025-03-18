// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {Listr} from 'listr2';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {BaseCommand, type Opts} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import * as helpers from '../core/helpers.js';
import {type CommandBuilder, type NodeAlias} from '../types/aliases.js';
import {type PodName} from '../core/kube/resources/pod/pod-name.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeComponent} from '../core/config/remote/components/mirror-node-component.js';
import * as fs from 'node:fs';
import {type Optional, type SoloListrTask} from '../types/index.js';
import * as Base64 from 'js-base64';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {INGRESS_CONTROLLER_NAME} from '../core/constants.js';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace-name.js';
import {PodRef} from '../core/kube/resources/pod/pod-ref.js';
import {ContainerName} from '../core/kube/resources/container/container-name.js';
import {ContainerRef} from '../core/kube/resources/container/container-ref.js';
import chalk from 'chalk';
import {type CommandFlag} from '../types/flag-types.js';
import {PvcRef} from '../core/kube/resources/pvc/pvc-ref.js';
import {PvcName} from '../core/kube/resources/pvc/pvc-name.js';
import {type ClusterRef, type DeploymentName} from '../core/config/remote/types.js';
import {extractContextFromConsensusNodes, showVersionBanner} from '../core/helpers.js';
import {type Pod} from '../core/kube/resources/pod/pod.js';
import {PathEx} from '../core/util/path-ex.js';

export interface MirrorNodeDeployConfigClass {
  chartDirectory: string;
  clusterContext: string;
  namespace: NamespaceName;
  enableIngress: boolean;
  mirrorStaticIp: string;
  profileFile: string;
  profileName: string;
  valuesFile: string;
  chartPath: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageReadAccessKey: string;
  storageReadSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
}

export interface Context {
  config: MirrorNodeDeployConfigClass;
  addressBook: string;
}

export class MirrorNodeCommand extends BaseCommand {
  private readonly accountManager: AccountManager;
  private readonly profileManager: ProfileManager;

  constructor(opts: Opts) {
    super(opts);
    if (!opts || !opts.accountManager)
      throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager);
    if (!opts || !opts.profileManager)
      throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader);

    this.accountManager = opts.accountManager;
    this.profileManager = opts.profileManager;
  }

  public static readonly COMMAND_NAME = 'mirror-node';

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.clusterRef,
      flags.chartDirectory,
      flags.deployment,
      flags.enableIngress,
      flags.mirrorStaticIp,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.pinger,
      flags.useExternalDatabase,
      flags.operatorId,
      flags.operatorKey,
      flags.storageType,
      flags.storageReadAccessKey,
      flags.storageReadSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
    ];
  }

  async prepareValuesArg(config: MirrorNodeDeployConfigClass) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName);
    if (profileValuesFile) {
      valuesArg += helpers.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArg += helpers.prepareValuesFiles(config.valuesFile);
    }

    if (config.storageBucket) {
      valuesArg += ` --set importer.config.hedera.mirror.importer.downloader.bucketName=${config.storageBucket}`;
    }
    if (config.storageBucketPrefix) {
      this.logger.info(`Setting storage bucket prefix to ${config.storageBucketPrefix}`);
      valuesArg += ` --set importer.config.hedera.mirror.importer.downloader.pathPrefix=${config.storageBucketPrefix}`;
    }

    let storageType = '';
    if (
      config.storageType !== constants.StorageType.MINIO_ONLY &&
      config.storageReadAccessKey &&
      config.storageReadSecrets &&
      config.storageEndpoint
    ) {
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.AWS_AND_GCS
      ) {
        storageType = 'gcp';
      } else if (config.storageType === constants.StorageType.AWS_ONLY) {
        storageType = 's3';
      } else {
        throw new IllegalArgumentError(`Invalid cloud storage type: ${config.storageType}`);
      }
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_TYPE=${storageType}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_URI=${config.storageEndpoint}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_ACCESSKEY=${config.storageReadAccessKey}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_SECRETKEY=${config.storageReadSecrets}`;
    }

    // if the useExternalDatabase populate all the required values before installing the chart
    if (config.useExternalDatabase) {
      const {
        externalDatabaseHost: host,
        externalDatabaseOwnerUsername: ownerUsername,
        externalDatabaseOwnerPassword: ownerPassword,
        externalDatabaseReadonlyUsername: readonlyUsername,
        externalDatabaseReadonlyPassword: readonlyPassword,
      } = config;

      valuesArg += helpers.populateHelmArgs({
        // Disable default database deployment
        'stackgres.enabled': false,
        'postgresql.enabled': false,

        // Set the host and name
        'db.host': host,
        'db.name': 'mirror_node',

        // set the usernames
        'db.owner.username': ownerUsername,
        'importer.db.username': ownerUsername,

        'grpc.db.username': readonlyUsername,
        'restjava.db.username': readonlyUsername,
        'web3.db.username': readonlyUsername,

        // TODO: Fixes a problem where importer's V1.0__Init.sql migration fails
        // 'rest.db.username': readonlyUsername,

        // set the passwords
        'db.owner.password': ownerPassword,
        'importer.db.password': ownerPassword,

        'grpc.db.password': readonlyPassword,
        'restjava.db.password': readonlyPassword,
        'web3.db.password': readonlyPassword,
        'rest.db.password': readonlyPassword,
      });
    }

    return valuesArg;
  }

  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);

            // disable the prompts that we don't want to prompt the user for
            flags.disablePrompts([
              flags.clusterRef,
              flags.valuesFile,
              flags.mirrorNodeVersion,
              flags.pinger,
              flags.operatorId,
              flags.operatorKey,
              flags.useExternalDatabase,
              flags.externalDatabaseHost,
              flags.externalDatabaseOwnerUsername,
              flags.externalDatabaseOwnerPassword,
              flags.externalDatabaseReadonlyUsername,
              flags.externalDatabaseReadonlyPassword,
              flags.profileFile,
              flags.profileName,
            ]);

            await self.configManager.executePrompt(task, MirrorNodeCommand.DEPLOY_FLAGS_LIST);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            ctx.config = this.configManager.getConfig(
              MirrorNodeCommand.DEPLOY_CONFIGS_NAME,
              MirrorNodeCommand.DEPLOY_FLAGS_LIST,
              ['chartPath', 'valuesArg', 'namespace'],
            ) as MirrorNodeDeployConfigClass;

            ctx.config.namespace = namespace;
            ctx.config.chartPath = await helpers.prepareChartPath(
              self.helm,
              '', // don't use chartPath which is for local solo-charts only
              constants.MIRROR_NODE_RELEASE_NAME,
              constants.MIRROR_NODE_CHART,
            );

            // predefined values first
            ctx.config.valuesArg += helpers.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE);
            // user defined values later to override predefined values
            ctx.config.valuesArg += await self.prepareValuesArg(ctx.config);

            const clusterRef = this.configManager.getFlag<string>(flags.clusterRef) as string;
            ctx.config.clusterContext = clusterRef
              ? this.localConfig.clusterRefs[clusterRef]
              : this.k8Factory.default().contexts().readCurrent();

            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              ctx.config.clusterContext,
            );
            if (ctx.config.pinger) {
              const startAccId = constants.HEDERA_NODE_ACCOUNT_ID_START;
              const networkPods: Pod[] = await this.k8Factory
                .getK8(ctx.config.clusterContext)
                .pods()
                .list(namespace, ['solo.hedera.com/type=network-node']);

              if (networkPods.length) {
                const pod = networkPods[0];
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.accountId=${startAccId}`;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.host=${pod.podIp}`;
                ctx.config.valuesArg += ' --set monitor.config.hedera.mirror.monitor.nodes.0.nodeId=0';

                const operatorId = ctx.config.operatorId || constants.OPERATOR_ID;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.accountId=${operatorId}`;

                if (ctx.config.operatorKey) {
                  this.logger.info('Using provided operator key');
                  ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${ctx.config.operatorKey}`;
                } else {
                  try {
                    const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
                    const secrets = await this.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .secrets()
                      .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                    if (secrets.length === 0) {
                      this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                      ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${constants.OPERATOR_KEY}`;
                    } else {
                      this.logger.info('Using operator key from k8s secret');
                      const operatorKeyFromK8 = Base64.decode(secrets[0].data.privateKey);
                      ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                    }
                  } catch (e) {
                    throw new SoloError(`Error getting operator key: ${e.message}`, e);
                  }
                }
              }
            }

            const isQuiet = ctx.config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (ctx.config.useExternalDatabase && !isQuiet) {
              await self.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              ctx.config.useExternalDatabase &&
              (!ctx.config.externalDatabaseHost ||
                !ctx.config.externalDatabaseOwnerUsername ||
                !ctx.config.externalDatabaseOwnerPassword ||
                !ctx.config.externalDatabaseReadonlyUsername ||
                !ctx.config.externalDatabaseReadonlyPassword)
            ) {
              const missingFlags: CommandFlag[] = [];
              if (!ctx.config.externalDatabaseHost) missingFlags.push(flags.externalDatabaseHost);
              if (!ctx.config.externalDatabaseOwnerUsername) missingFlags.push(flags.externalDatabaseOwnerUsername);
              if (!ctx.config.externalDatabaseOwnerPassword) missingFlags.push(flags.externalDatabaseOwnerPassword);

              if (!ctx.config.externalDatabaseReadonlyUsername) {
                missingFlags.push(flags.externalDatabaseReadonlyUsername);
              }
              if (!ctx.config.externalDatabaseReadonlyPassword) {
                missingFlags.push(flags.externalDatabaseReadonlyPassword);
              }

              if (missingFlags.length) {
                const errorMessage =
                  'There are missing values that need to be provided when' +
                  `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

                throw new SoloError(`${errorMessage} ${missingFlags.map(flag => `--${flag.name}`).join(', ')}`);
              }
            }

            if (!(await self.k8Factory.getK8(ctx.config.clusterContext).namespaces().has(ctx.config.namespace))) {
              throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Enable mirror-node',
          task: (_, parentTask) => {
            return parentTask.newListr<Context>(
              [
                {
                  title: 'Prepare address book',
                  task: async ctx => {
                    const deployment = this.configManager.getFlag<DeploymentName>(flags.deployment);
                    const portForward = this.configManager.getFlag<boolean>(flags.forcePortForward);
                    const consensusNodes = this.remoteConfigManager.getConsensusNodes();
                    const nodeAlias = `node${consensusNodes[0].nodeId}` as NodeAlias;
                    const context = extractContextFromConsensusNodes(nodeAlias, consensusNodes);
                    ctx.addressBook = await self.accountManager.prepareAddressBookBase64(
                      ctx.config.namespace,
                      this.remoteConfigManager.getClusterRefs(),
                      deployment,
                      this.configManager.getFlag(flags.operatorId),
                      this.configManager.getFlag(flags.operatorKey),
                      portForward,
                      context,
                    );
                    ctx.config.valuesArg += ` --set "importer.addressBook=${ctx.addressBook}"`;
                  },
                },
                {
                  title: 'Install mirror ingress controller',
                  task: async ctx => {
                    const config = ctx.config;

                    let mirrorIngressControllerValuesArg = '';

                    if (config.mirrorStaticIp !== '') {
                      mirrorIngressControllerValuesArg += ` --set controller.service.loadBalancerIP=${ctx.config.mirrorStaticIp}`;
                    }
                    mirrorIngressControllerValuesArg += ` --set fullnameOverride=${constants.MIRROR_INGRESS_CONTROLLER}`;

                    const ingressControllerChartPath = await helpers.prepareChartPath(
                      self.helm,
                      '', // don't use chartPath which is for local solo-charts only
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                    );

                    await self.chartManager.install(
                      config.namespace,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      ingressControllerChartPath,
                      INGRESS_CONTROLLER_VERSION,
                      mirrorIngressControllerValuesArg,
                      ctx.config.clusterContext,
                    );
                    showVersionBanner(
                      self.logger,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      INGRESS_CONTROLLER_VERSION,
                    );
                  },
                  skip: ctx => !ctx.config.enableIngress,
                },
                {
                  title: 'Deploy mirror-node',
                  task: async ctx => {
                    await self.chartManager.install(
                      ctx.config.namespace,
                      constants.MIRROR_NODE_RELEASE_NAME,
                      ctx.config.chartPath,
                      ctx.config.mirrorNodeVersion,
                      ctx.config.valuesArg,
                      ctx.config.clusterContext,
                    );
                    showVersionBanner(self.logger, constants.MIRROR_NODE_RELEASE_NAME, ctx.config.mirrorNodeVersion);

                    if (ctx.config.enableIngress) {
                      // patch ingressClassName of mirror ingress so it can be recognized by haproxy ingress controller
                      await this.k8Factory
                        .getK8(ctx.config.clusterContext)
                        .ingresses()
                        .update(ctx.config.namespace, constants.MIRROR_NODE_RELEASE_NAME, {
                          spec: {
                            ingressClassName: `${constants.MIRROR_INGRESS_CLASS_NAME}`,
                          },
                        });

                      // to support GRPC over HTTP/2
                      await this.k8Factory
                        .getK8(ctx.config.clusterContext)
                        .configMaps()
                        .update(ctx.config.namespace, constants.MIRROR_INGRESS_CONTROLLER, {
                          'backend-protocol': 'h2',
                        });

                      await this.k8Factory
                        .getK8(ctx.config.clusterContext)
                        .ingressClasses()
                        .create(constants.MIRROR_INGRESS_CLASS_NAME, INGRESS_CONTROLLER_NAME);
                    }
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: 'Check pods are ready',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Check Postgres DB',
                  task: async ctx =>
                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .waitForReadyStatus(
                        ctx.config.namespace,
                        ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/name=postgres'],
                        constants.PODS_READY_MAX_ATTEMPTS,
                        constants.PODS_READY_DELAY,
                      ),
                  skip: ctx => !!ctx.config.useExternalDatabase,
                },
                {
                  title: 'Check REST API',
                  task: async ctx =>
                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .waitForReadyStatus(
                        ctx.config.namespace,
                        ['app.kubernetes.io/component=rest', 'app.kubernetes.io/name=rest'],
                        constants.PODS_READY_MAX_ATTEMPTS,
                        constants.PODS_READY_DELAY,
                      ),
                },
                {
                  title: 'Check GRPC',
                  task: async ctx =>
                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .waitForReadyStatus(
                        ctx.config.namespace,
                        ['app.kubernetes.io/component=grpc', 'app.kubernetes.io/name=grpc'],
                        constants.PODS_READY_MAX_ATTEMPTS,
                        constants.PODS_READY_DELAY,
                      ),
                },
                {
                  title: 'Check Monitor',
                  task: async ctx =>
                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .waitForReadyStatus(
                        ctx.config.namespace,
                        ['app.kubernetes.io/component=monitor', 'app.kubernetes.io/name=monitor'],
                        constants.PODS_READY_MAX_ATTEMPTS,
                        constants.PODS_READY_DELAY,
                      ),
                },
                {
                  title: 'Check Importer',
                  task: async ctx =>
                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .waitForReadyStatus(
                        ctx.config.namespace,
                        ['app.kubernetes.io/component=importer', 'app.kubernetes.io/name=importer'],
                        constants.PODS_READY_MAX_ATTEMPTS,
                        constants.PODS_READY_DELAY,
                      ),
                },
              ],
              {
                concurrent: true,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: 'Seed DB data',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Insert data in public.file_data',
                  task: async ctx => {
                    const namespace = ctx.config.namespace;
                    const clusterContext = ctx.config.clusterContext;

                    const feesFileIdNum = 111;
                    const exchangeRatesFileIdNum = 112;
                    const timestamp = Date.now();

                    const clusterRefs = this.remoteConfigManager.getClusterRefs();
                    const deployment = this.configManager.getFlag<DeploymentName>(flags.deployment);
                    const fees = await this.accountManager.getFileContents(
                      namespace,
                      feesFileIdNum,
                      clusterRefs,
                      clusterContext,
                      deployment,
                      this.configManager.getFlag<boolean>(flags.forcePortForward),
                    );
                    const exchangeRates = await this.accountManager.getFileContents(
                      namespace,
                      exchangeRatesFileIdNum,
                      clusterRefs,
                      clusterContext,
                      deployment,
                      this.configManager.getFlag<boolean>(flags.forcePortForward),
                    );

                    const importFeesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id,
                                                                          transaction_type)
                                             VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'},
                                                     ${feesFileIdNum}, 17);`;
                    const importExchangeRatesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp,
                                                                                   entity_id, transaction_type)
                                                      VALUES (decode('${exchangeRates}', 'hex'), ${
                                                        timestamp + '000001'
                                                      }, ${exchangeRatesFileIdNum}, 17);`;
                    const sqlQuery = [importFeesQuery, importExchangeRatesQuery].join('\n');

                    // When useExternalDatabase flag is enabled, the query is not executed,
                    // but exported to the specified path inside the cache directory,
                    // and the user has the responsibility to execute it manually on his own
                    if (ctx.config.useExternalDatabase) {
                      // Build the path
                      const databaseSeedingQueryPath = PathEx.join(
                        constants.SOLO_CACHE_DIR,
                        'database-seeding-query.sql',
                      );

                      // Write the file database seeding query inside the cache
                      fs.writeFileSync(databaseSeedingQueryPath, sqlQuery);

                      // Notify the user
                      self.logger.showUser(
                        chalk.cyan(
                          'Please run the following SQL script against the external database ' +
                            'to enable Mirror Node to function correctly:',
                        ),
                        chalk.yellow(databaseSeedingQueryPath),
                      );

                      return; //! stop the execution
                    }

                    const pods: Pod[] = await this.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .pods()
                      .list(namespace, ['app.kubernetes.io/name=postgres']);
                    if (pods.length === 0) {
                      throw new SoloError('postgres pod not found');
                    }
                    const postgresPodName: PodName = pods[0].podRef.name;
                    const postgresContainerName = ContainerName.of('postgresql');
                    const postgresPodRef = PodRef.of(namespace, postgresPodName);
                    const containerRef = ContainerRef.of(postgresPodRef, postgresContainerName);
                    const mirrorEnvVars = await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .containers()
                      .readByRef(containerRef)
                      .execContainer('/bin/bash -c printenv');
                    const mirrorEnvVarsArray = mirrorEnvVars.split('\n');
                    const HEDERA_MIRROR_IMPORTER_DB_OWNER = helpers.getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNER',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD = helpers.getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_NAME = helpers.getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_NAME',
                    );

                    await self.k8Factory
                      .getK8(ctx.config.clusterContext)
                      .containers()
                      .readByRef(containerRef)
                      .execContainer([
                        'psql',
                        `postgresql://${HEDERA_MIRROR_IMPORTER_DB_OWNER}:${HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD}@localhost:5432/${HEDERA_MIRROR_IMPORTER_DB_NAME}`,
                        '-c',
                        sqlQuery,
                      ]);
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        this.addMirrorNodeComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('mirror node deployment has completed');
    } catch (e) {
      throw new SoloError(`Error deploying mirror node: ${e.message}`, e);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        namespace: NamespaceName;
        clusterContext: string;
        isChartInstalled: boolean;
        clusterRef?: Optional<ClusterRef>;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the mirror-node components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
            const clusterRef = this.configManager.getFlag<string>(flags.clusterRef) as string;
            const clusterContext = clusterRef
              ? this.localConfig.clusterRefs[clusterRef]
              : this.k8Factory.default().contexts().readCurrent();

            if (!(await self.k8Factory.getK8(clusterContext).namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace} does not exist`);
            }

            const isChartInstalled = await this.chartManager.isChartInstalled(
              namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
              clusterContext,
            );

            ctx.config = {
              clusterContext,
              namespace,
              isChartInstalled,
            };

            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              ctx.config.clusterContext,
            );
            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy mirror-node',
          task: async ctx => {
            await this.chartManager.uninstall(
              ctx.config.namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
              ctx.config.clusterContext,
            );
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async ctx => {
            // filtering postgres and redis PVCs using instance labels
            // since they have different name or component labels
            const pvcs = await self.k8Factory
              .getK8(ctx.config.clusterContext)
              .pvcs()
              .list(ctx.config.namespace, [`app.kubernetes.io/instance=${constants.MIRROR_NODE_RELEASE_NAME}`]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await self.k8Factory
                  .getK8(ctx.config.clusterContext)
                  .pvcs()
                  .delete(PvcRef.of(ctx.config.namespace, PvcName.of(pvc)));
              }
            }
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        {
          title: 'Uninstall mirror ingress controller',
          task: async ctx => {
            await this.chartManager.uninstall(
              ctx.config.namespace,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              ctx.config.clusterContext,
            );
            // delete ingress class if found one
            const existingIngressClasses = await this.k8Factory
              .getK8(ctx.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map(ingressClass => {
              if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
                this.k8Factory
                  .getK8(ctx.config.clusterContext)
                  .ingressClasses()
                  .delete(constants.MIRROR_INGRESS_CLASS_NAME);
              }
            });
          },
        },
        this.removeMirrorNodeComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('mirror node destruction has completed');
    } catch (e) {
      throw new SoloError(`Error destroying mirror node: ${e.message}`, e);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  /** Return Yargs command definition for 'mirror-mirror-node' command */
  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: MirrorNodeCommand.COMMAND_NAME,
      desc: 'Manage Hedera Mirror Node in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: y => flags.setCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST),
            handler: async argv => {
              self.logger.info("==== Running 'mirror-node deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node deploy`====');
                  if (!r) throw new SoloError('Error deploying mirror node, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error deploying mirror node: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: y =>
              flags.setCommandFlags(
                y,
                flags.chartDirectory,
                flags.clusterRef,
                flags.force,
                flags.quiet,
                flags.deployment,
              ),
            handler: async argv => {
              self.logger.info("==== Running 'mirror-node destroy' ===");
              self.logger.info(argv);

              await self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node destroy`====');
                  if (!r) throw new SoloError('Error destroying mirror node, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error destroying mirror node: ${err.message}`, err);
                });
            },
          })
          .demandCommand(1, 'Select a mirror-node command');
      },
    };
  }

  /** Removes the mirror node components from remote config. */
  public removeMirrorNodeComponents(): SoloListrTask<any> {
    return {
      title: 'Remove mirror node from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('mirrorNode', ComponentType.MirrorNode);
        });
      },
    };
  }

  /** Adds the mirror node components to remote config. */
  public addMirrorNodeComponents(): SoloListrTask<any> {
    return {
      title: 'Add mirror node to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          remoteConfig.components.add(new MirrorNodeComponent('mirrorNode', cluster, namespace.name));
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
