/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {Listr} from 'listr2';
import {IllegalArgumentError, MissingArgumentError, SoloError} from '../core/errors.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account_manager.js';
import {type ProfileManager} from '../core/profile_manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import * as helpers from '../core/helpers.js';
import {type CommandBuilder} from '../types/aliases.js';
import {PodName} from '../core/kube/resources/pod/pod_name.js';
import {type Opts} from '../types/command_types.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeComponent} from '../core/config/remote/components/mirror_node_component.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {type Optional, type SoloListrTask} from '../types/index.js';
import * as Base64 from 'js-base64';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../core/kube/resources/pod/pod_ref.js';
import {ContainerName} from '../core/kube/resources/container/container_name.js';
import {ContainerRef} from '../core/kube/resources/container/container_ref.js';
import chalk from 'chalk';
import {type CommandFlag} from '../types/flag_types.js';

interface MirrorNodeDeployConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  profileFile: string;
  profileName: string;
  valuesFile: string;
  chartPath: string;
  valuesArg: string;
  quiet: boolean;
  mirrorNodeVersion: string;
  getUnusedConfigs: () => string[];
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageAccessKey: string;
  storageSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
}

interface Context {
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

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.chartDirectory,
      flags.deployment,
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
      flags.storageAccessKey,
      flags.storageSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
    ];
  }

  async prepareValuesArg(config: MirrorNodeDeployConfigClass) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName);
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }

    if (config.storageBucket) {
      valuesArg += ` --set importer.config.hedera.mirror.importer.downloader.bucketName=${config.storageBucket}`;
    }
    if (config.storageBucketPrefix) {
      this.logger.info(`Setting storage bucket prefix to ${config.storageBucketPrefix}`);
      valuesArg += ` --set importer.config.hedera.mirror.importer.downloader.pathPrefix=${config.storageBucketPrefix}`;
    }

    let storageType = '';
    if (config.storageType && config.storageAccessKey && config.storageSecrets && config.storageEndpoint) {
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.S3_AND_GCS ||
        config.storageType === constants.StorageType.GCS_AND_MINIO
      ) {
        storageType = 'gcp';
      } else if (config.storageType === constants.StorageType.S3_ONLY) {
        storageType = 's3';
      } else {
        throw new IllegalArgumentError(`Invalid cloud storage type: ${config.storageType}`);
      }
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_TYPE=${storageType}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_URI=${config.storageEndpoint}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_ACCESSKEY=${config.storageAccessKey}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_SECRETKEY=${config.storageSecrets}`;
    }

    // if the useExternalDatabase populate all the required values before installing the chart
    if (config.useExternalDatabase) {
      const {
        externalDatabaseHost: host,
        externalDatabaseOwnerUsername: username,
        externalDatabaseOwnerPassword: password,
      } = config;

      valuesArg += helpers.populateHelmArgs({
        // Disable default database deployment
        'stackgres.enabled': false,
        'postgresql.enabled': false,

        // Set the host and name
        'db.host': host,
        'db.name': 'mirror_node',

        // set the usernames
        'db.owner.username': username,
        'importer.db.username': username,
        'grpc.db.username': username,
        'restjava.db.username': username,
        'web3.db.username': username,
        // Fixes problem where importer's V1.0__Init.sql migration fails
        // 'rest.db.username': username,

        // set the passwords
        'db.owner.password': password,
        'importer.db.password': password,
        'grpc.db.password': password,
        'rest.db.password': password,
        'restjava.db.password': password,
        'web3.db.password': password,
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
              flags.valuesFile,
              flags.mirrorNodeVersion,
              flags.pinger,
              flags.operatorId,
              flags.operatorKey,
              flags.useExternalDatabase,
              flags.externalDatabaseHost,
              flags.externalDatabaseOwnerUsername,
              flags.externalDatabaseOwnerPassword,
            ]);

            await self.configManager.executePrompt(task, MirrorNodeCommand.DEPLOY_FLAGS_LIST);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            ctx.config = this.getConfig(MirrorNodeCommand.DEPLOY_CONFIGS_NAME, MirrorNodeCommand.DEPLOY_FLAGS_LIST, [
              'chartPath',
              'valuesArg',
              'namespace',
            ]) as MirrorNodeDeployConfigClass;

            ctx.config.namespace = namespace;
            ctx.config.chartPath = await self.prepareChartPath(
              '', // don't use chartPath which is for local solo-charts only
              constants.MIRROR_NODE_RELEASE_NAME,
              constants.MIRROR_NODE_CHART,
            );

            // predefined values first
            ctx.config.valuesArg += this.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE);
            // user defined values later to override predefined values
            ctx.config.valuesArg += await self.prepareValuesArg(ctx.config);

            await self.accountManager.loadNodeClient(ctx.config.namespace);

            if (ctx.config.pinger) {
              const startAccId = constants.HEDERA_NODE_ACCOUNT_ID_START;
              const networkPods = await this.k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

              if (networkPods.length) {
                const pod = networkPods[0];
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.accountId=${startAccId}`;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.host=${pod.status.podIP}`;
                ctx.config.valuesArg += ' --set monitor.config.hedera.mirror.monitor.nodes.0.nodeId=0';

                const operatorId = ctx.config.operatorId || constants.OPERATOR_ID;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.accountId=${operatorId}`;

                if (ctx.config.operatorKey) {
                  this.logger.info('Using provided operator key');
                  ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${ctx.config.operatorKey}`;
                } else {
                  try {
                    const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
                    const secrets = await this.k8
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
              ]);
            } else if (ctx.config.useExternalDatabase) {
              if (
                !ctx.config.externalDatabaseHost ||
                !ctx.config.externalDatabaseOwnerUsername ||
                !ctx.config.externalDatabaseOwnerPassword
              ) {
                const missingFlags: CommandFlag[] = [];
                if (!ctx.config.externalDatabaseHost) missingFlags.push(flags.externalDatabaseHost);
                if (!ctx.config.externalDatabaseOwnerUsername) missingFlags.push(flags.externalDatabaseOwnerUsername);
                if (!ctx.config.externalDatabaseOwnerPassword) missingFlags.push(flags.externalDatabaseOwnerPassword);
                if (missingFlags.length) {
                  const errorMessage =
                    'There are missing values that need to be provided when' +
                    `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

                  throw new SoloError(`${errorMessage} ${missingFlags.map(flag => `--${flag.name}`).join(', ')}`);
                }
              }
            }

            if (!(await self.k8.namespaces().has(ctx.config.namespace))) {
              throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
            }

            return ListrLease.newAcquireLeaseTask(lease, task);
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
                    ctx.addressBook = await self.accountManager.prepareAddressBookBase64();
                    ctx.config.valuesArg += ` --set "importer.addressBook=${ctx.addressBook}"`;
                  },
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
                    );
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
                    await self.k8
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
                    await self.k8
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
                    await self.k8
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
                    await self.k8
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
                    await self.k8
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

                    const feesFileIdNum = 111;
                    const exchangeRatesFileIdNum = 112;
                    const timestamp = Date.now();

                    const fees = await this.accountManager.getFileContents(namespace, feesFileIdNum);
                    const exchangeRates = await this.accountManager.getFileContents(namespace, exchangeRatesFileIdNum);

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
                      const databaseSeedingQueryPath = path.join(
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

                    const pods = await this.k8.pods().list(namespace, ['app.kubernetes.io/name=postgres']);
                    if (pods.length === 0) {
                      throw new SoloError('postgres pod not found');
                    }
                    const postgresPodName = PodName.of(pods[0].metadata.name);
                    const postgresContainerName = ContainerName.of('postgresql');
                    const postgresPodRef = PodRef.of(namespace, postgresPodName);
                    const containerRef = ContainerRef.of(postgresPodRef, postgresContainerName);
                    const mirrorEnvVars = await self.k8.execContainer(containerRef, '/bin/bash -c printenv');
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

                    await self.k8.execContainer(containerRef, [
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
      const message = `Error deploying node: ${e.message}`;
      self.logger.error(message, e);
      throw new SoloError(message, e);
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
        isChartInstalled: boolean;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
                type: 'toggle',
                default: false,
                message: 'Are you sure you would like to destroy the mirror-node components?',
              });

              if (!confirm) {
                process.exit(0);
              }
            }

            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            if (!(await self.k8.namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace} does not exist`);
            }

            const isChartInstalled = await this.chartManager.isChartInstalled(
              namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
            );

            ctx.config = {
              namespace,
              isChartInstalled,
            };

            await self.accountManager.loadNodeClient(ctx.config.namespace);

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: 'Destroy mirror-node',
          task: async ctx => {
            await this.chartManager.uninstall(ctx.config.namespace, constants.MIRROR_NODE_RELEASE_NAME);
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async ctx => {
            // filtering postgres and redis PVCs using instance labels
            // since they have different name or component labels
            const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace, [
              `app.kubernetes.io/instance=${constants.MIRROR_NODE_RELEASE_NAME}`,
            ]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await self.k8.deletePvc(pvc, ctx.config.namespace);
              }
            }
          },
          skip: ctx => !ctx.config.isChartInstalled,
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
      command: 'mirror-node',
      desc: 'Manage Hedera Mirror Node in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: y => flags.setCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              self.logger.info("==== Running 'mirror-node deploy' ===");
              self.logger.info(argv);

              self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node deploy`====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: y => flags.setCommandFlags(y, flags.chartDirectory, flags.force, flags.quiet, flags.deployment),
            handler: argv => {
              self.logger.info("==== Running 'mirror-node destroy' ===");
              self.logger.info(argv);

              self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node destroy`====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
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

          remoteConfig.components.add('mirrorNode', new MirrorNodeComponent('mirrorNode', cluster, namespace.name));
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
