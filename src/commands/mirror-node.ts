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
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import * as helpers from '../core/helpers.js';
import {type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeComponent} from '../core/config/remote/components/mirror-node-component.js';
import * as fs from 'node:fs';
import {type Optional, type SoloListrTask} from '../types/index.js';
import * as Base64 from 'js-base64';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {
  INGRESS_CONTROLLER_PREFIX,
  MIRROR_INGRESS_TLS_SECRET_NAME,
  MIRROR_INGRESS_CONTROLLER,
} from '../core/constants.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import chalk from 'chalk';
import {type CommandFlag} from '../types/flag-types.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {type ClusterReference, type DeploymentName} from '../core/config/remote/types.js';
import {KeyManager} from '../core/key-manager.js';
import {prepareValuesFiles, showVersionBanner} from '../core/helpers.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';

interface MirrorNodeDeployConfigClass {
  cacheDir: string;
  chartDirectory: string;
  clusterContext: string;
  clusterRef: ClusterReference;
  namespace: NamespaceName;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  mirrorStaticIp: string;
  profileFile: string;
  profileName: string;
  valuesFile: string;
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
  storageBucketRegion: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
  domainName: Optional<string>;
}

interface MirrorNodeDeployContext {
  config: MirrorNodeDeployConfigClass;
  addressBook: string;
}

interface MirrorNodeDestroyContext {
  config: {
    namespace: NamespaceName;
    clusterContext: string;
    isChartInstalled: boolean;
    clusterRef?: Optional<ClusterReference>;
  };
}

export class MirrorNodeCommand extends BaseCommand {
  private readonly accountManager: AccountManager;
  private readonly profileManager: ProfileManager;

  public constructor(options: Options) {
    super(options);
    if (!options || !options.accountManager) {
      throw new IllegalArgumentError('An instance of core/AccountManager is required', options.accountManager);
    }
    if (!options || !options.profileManager) {
      throw new MissingArgumentError('An instance of core/ProfileManager is required', options.downloader);
    }

    this.accountManager = options.accountManager;
    this.profileManager = options.profileManager;
  }

  public static readonly COMMAND_NAME = 'mirror-node';

  private static readonly DEPLOY_CONFIGS_NAME = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.clusterRef,
      flags.chartDirectory,
      flags.deployment,
      flags.enableIngress,
      flags.ingressControllerValueFile,
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
      flags.storageBucketRegion,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
      flags.domainName,
    ],
  };

  private async prepareValuesArg(config: MirrorNodeDeployConfigClass): Promise<string> {
    let valuesArgument = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    if (config.storageBucket) {
      valuesArgument += ` --set importer.config.hedera.mirror.importer.downloader.bucketName=${config.storageBucket}`;
    }
    if (config.storageBucketPrefix) {
      this.logger.info(`Setting storage bucket prefix to ${config.storageBucketPrefix}`);
      valuesArgument += ` --set importer.config.hedera.mirror.importer.downloader.pathPrefix=${config.storageBucketPrefix}`;
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
      valuesArgument += helpers.populateHelmArguments({
        'importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_CLOUDPROVIDER': storageType,
        'importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_ENDPOINTOVERRIDE': config.storageEndpoint,
        'importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_ACCESSKEY': config.storageReadAccessKey,
        'importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SECRETKEY': config.storageReadSecrets,
      });
    }

    if (config.storageBucketRegion) {
      valuesArgument += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_REGION=${config.storageBucketRegion}`;
    }

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.tls.enabled': false,
        'ingress.hosts[0].host': config.domainName,
      });
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

      valuesArgument += helpers.populateHelmArguments({
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

    return valuesArgument;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<MirrorNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
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
              flags.domainName,
            ]);

            const allFlags = [
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.required,
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional,
            ];
            await self.configManager.executePrompt(task, allFlags);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            context_.config = this.configManager.getConfig(MirrorNodeCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'valuesArg',
              'namespace',
            ]) as MirrorNodeDeployConfigClass;

            context_.config.namespace = namespace;

            // predefined values first
            context_.config.valuesArg += helpers.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE);
            // user defined values later to override predefined values
            context_.config.valuesArg += await self.prepareValuesArg(context_.config);

            context_.config.clusterContext = context_.config.clusterRef
              ? this.localConfig.clusterRefs[context_.config.clusterRef]
              : this.k8Factory.default().contexts().readCurrent();

            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
            if (context_.config.pinger) {
              const startAccumulatorId = constants.HEDERA_NODE_ACCOUNT_ID_START;
              const networkPods: Pod[] = await this.k8Factory
                .getK8(context_.config.clusterContext)
                .pods()
                .list(namespace, ['solo.hedera.com/type=network-node']);

              if (networkPods.length > 0) {
                const pod = networkPods[0];
                context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.accountId=${startAccumulatorId}`;
                context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.host=${pod.podIp}`;
                context_.config.valuesArg += ' --set monitor.config.hedera.mirror.monitor.nodes.0.nodeId=0';

                const operatorId = context_.config.operatorId || constants.OPERATOR_ID;
                context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.accountId=${operatorId}`;

                if (context_.config.operatorKey) {
                  this.logger.info('Using provided operator key');
                  context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${context_.config.operatorKey}`;
                } else {
                  try {
                    const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
                    const secrets = await this.k8Factory
                      .getK8(context_.config.clusterContext)
                      .secrets()
                      .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                    if (secrets.length === 0) {
                      this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                      context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${constants.OPERATOR_KEY}`;
                    } else {
                      this.logger.info('Using operator key from k8s secret');
                      const operatorKeyFromK8 = Base64.decode(secrets[0].data.privateKey);
                      context_.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${operatorKeyFromK8}`;
                    }
                  } catch (error) {
                    throw new SoloError(`Error getting operator key: ${error.message}`, error);
                  }
                }
              }
            }

            const isQuiet = context_.config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (context_.config.useExternalDatabase && !isQuiet) {
              await self.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              context_.config.useExternalDatabase &&
              (!context_.config.externalDatabaseHost ||
                !context_.config.externalDatabaseOwnerUsername ||
                !context_.config.externalDatabaseOwnerPassword ||
                !context_.config.externalDatabaseReadonlyUsername ||
                !context_.config.externalDatabaseReadonlyPassword)
            ) {
              const missingFlags: CommandFlag[] = [];
              if (!context_.config.externalDatabaseHost) {
                missingFlags.push(flags.externalDatabaseHost);
              }
              if (!context_.config.externalDatabaseOwnerUsername) {
                missingFlags.push(flags.externalDatabaseOwnerUsername);
              }
              if (!context_.config.externalDatabaseOwnerPassword) {
                missingFlags.push(flags.externalDatabaseOwnerPassword);
              }

              if (!context_.config.externalDatabaseReadonlyUsername) {
                missingFlags.push(flags.externalDatabaseReadonlyUsername);
              }
              if (!context_.config.externalDatabaseReadonlyPassword) {
                missingFlags.push(flags.externalDatabaseReadonlyPassword);
              }

              if (missingFlags.length > 0) {
                const errorMessage =
                  'There are missing values that need to be provided when' +
                  `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

                throw new SoloError(`${errorMessage} ${missingFlags.map(flag => `--${flag.name}`).join(', ')}`);
              }
            }

            if (
              !(await self.k8Factory.getK8(context_.config.clusterContext).namespaces().has(context_.config.namespace))
            ) {
              throw new SoloError(`namespace ${context_.config.namespace} does not exist`);
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Enable mirror-node',
          task: (_, parentTask) => {
            return parentTask.newListr<MirrorNodeDeployContext>(
              [
                {
                  title: 'Prepare address book',
                  task: async context_ => {
                    const deployment = this.configManager.getFlag<DeploymentName>(flags.deployment);
                    const portForward = this.configManager.getFlag<boolean>(flags.forcePortForward);
                    context_.addressBook = await self.accountManager.prepareAddressBookBase64(
                      context_.config.namespace,
                      this.remoteConfigManager.getClusterRefs(),
                      deployment,
                      this.configManager.getFlag(flags.operatorId),
                      this.configManager.getFlag(flags.operatorKey),
                      portForward,
                    );
                    context_.config.valuesArg += ` --set "importer.addressBook=${context_.addressBook}"`;
                  },
                },
                {
                  title: 'Install mirror ingress controller',
                  task: async context_ => {
                    const config = context_.config;

                    let mirrorIngressControllerValuesArgument = '';

                    if (config.mirrorStaticIp !== '') {
                      mirrorIngressControllerValuesArgument += ` --set controller.service.loadBalancerIP=${context_.config.mirrorStaticIp}`;
                    }
                    mirrorIngressControllerValuesArgument += ` --set fullnameOverride=${MIRROR_INGRESS_CONTROLLER}`;
                    mirrorIngressControllerValuesArgument += ` --set controller.ingressClass=${constants.MIRROR_INGRESS_CLASS_NAME}`;
                    mirrorIngressControllerValuesArgument += ` --set controller.extraArgs.controller-class=${constants.MIRROR_INGRESS_CONTROLLER}`;

                    mirrorIngressControllerValuesArgument += prepareValuesFiles(config.ingressControllerValueFile);

                    await self.chartManager.install(
                      config.namespace,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      INGRESS_CONTROLLER_VERSION,
                      mirrorIngressControllerValuesArgument,
                      context_.config.clusterContext,
                    );
                    showVersionBanner(
                      self.logger,
                      constants.INGRESS_CONTROLLER_RELEASE_NAME,
                      INGRESS_CONTROLLER_VERSION,
                    );
                  },
                  skip: context_ => !context_.config.enableIngress,
                },
                {
                  title: 'Deploy mirror-node',
                  task: async context_ => {
                    await self.chartManager.install(
                      context_.config.namespace,
                      constants.MIRROR_NODE_RELEASE_NAME,
                      constants.MIRROR_NODE_CHART,
                      constants.MIRROR_NODE_RELEASE_NAME,
                      context_.config.mirrorNodeVersion,
                      context_.config.valuesArg,
                      context_.config.clusterContext,
                    );

                    showVersionBanner(
                      self.logger,
                      constants.MIRROR_NODE_RELEASE_NAME,
                      context_.config.mirrorNodeVersion,
                    );

                    if (context_.config.enableIngress) {
                      await KeyManager.createTlsSecret(
                        this.k8Factory,
                        context_.config.namespace,
                        context_.config.domainName,
                        context_.config.cacheDir,
                        MIRROR_INGRESS_TLS_SECRET_NAME,
                      );
                      // patch ingressClassName of mirror ingress so it can be recognized by haproxy ingress controller
                      const updated: object = {
                        metadata: {
                          annotations: {
                            'haproxy-ingress.github.io/backend-protocol': 'h1',
                          },
                        },
                        spec: {
                          ingressClassName: `${constants.MIRROR_INGRESS_CLASS_NAME}`,
                          tls: [
                            {
                              hosts: [context_.config.domainName || 'localhost'],
                              secretName: MIRROR_INGRESS_TLS_SECRET_NAME,
                            },
                          ],
                        },
                      };
                      await this.k8Factory
                        .getK8(context_.config.clusterContext)
                        .ingresses()
                        .update(context_.config.namespace, constants.MIRROR_NODE_RELEASE_NAME, updated);

                      // to support GRPC over HTTP/2
                      await this.k8Factory
                        .getK8(context_.config.clusterContext)
                        .configMaps()
                        .update(context_.config.namespace, MIRROR_INGRESS_CONTROLLER, {
                          'backend-protocol': 'h2',
                        });

                      await this.k8Factory
                        .getK8(context_.config.clusterContext)
                        .ingressClasses()
                        .create(
                          constants.MIRROR_INGRESS_CLASS_NAME,
                          INGRESS_CONTROLLER_PREFIX + MIRROR_INGRESS_CONTROLLER,
                        );
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
          task: (context_, task) => {
            const subTasks: SoloListrTask<MirrorNodeDeployContext>[] = [
              {
                title: 'Check Postgres DB',
                labels: ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/name=postgres'],
                skip: () => !!context_.config.useExternalDatabase,
              },
              {
                title: 'Check REST API',
                labels: ['app.kubernetes.io/component=rest', 'app.kubernetes.io/name=rest'],
              },
              {
                title: 'Check GRPC',
                labels: ['app.kubernetes.io/component=grpc', 'app.kubernetes.io/name=grpc'],
              },
              {
                title: 'Check Monitor',
                labels: ['app.kubernetes.io/component=monitor', 'app.kubernetes.io/name=monitor'],
              },
              {
                title: 'Check Importer',
                labels: ['app.kubernetes.io/component=importer', 'app.kubernetes.io/name=importer'],
              },
            ].map(({title, labels, skip}: {title: string; labels: string[]; skip?: () => boolean}) => {
              const task: SoloListrTask<MirrorNodeDeployContext> = {
                title: title,
                task: async () =>
                  await self.k8Factory
                    .getK8(context_.config.clusterContext)
                    .pods()
                    .waitForReadyStatus(
                      context_.config.namespace,
                      labels,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
              };

              if (skip) {
                task.skip = skip;
              }

              return task;
            });

            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
            });
          },
        },
        {
          title: 'Seed DB data',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Insert data in public.file_data',
                  task: async context_ => {
                    const namespace = context_.config.namespace;

                    const feesFileIdNumber = 111;
                    const exchangeRatesFileIdNumber = 112;
                    const timestamp = Date.now();

                    const clusterReferences = this.remoteConfigManager.getClusterRefs();
                    const deployment = this.configManager.getFlag<DeploymentName>(flags.deployment);
                    const fees = await this.accountManager.getFileContents(
                      namespace,
                      feesFileIdNumber,
                      clusterReferences,
                      deployment,
                      this.configManager.getFlag<boolean>(flags.forcePortForward),
                    );
                    const exchangeRates = await this.accountManager.getFileContents(
                      namespace,
                      exchangeRatesFileIdNumber,
                      clusterReferences,
                      deployment,
                      this.configManager.getFlag<boolean>(flags.forcePortForward),
                    );

                    const importFeesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id,
                                                                          transaction_type)
                                             VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'},
                                                     ${feesFileIdNumber}, 17);`;
                    const importExchangeRatesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp,
                                                                                   entity_id, transaction_type)
                                                      VALUES (decode('${exchangeRates}', 'hex'), ${
                                                        timestamp + '000001'
                                                      }, ${exchangeRatesFileIdNumber}, 17);`;
                    const sqlQuery = [importFeesQuery, importExchangeRatesQuery].join('\n');

                    // When useExternalDatabase flag is enabled, the query is not executed,
                    // but exported to the specified path inside the cache directory,
                    // and the user has the responsibility to execute it manually on his own
                    if (context_.config.useExternalDatabase) {
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
                      .getK8(context_.config.clusterContext)
                      .pods()
                      .list(namespace, ['app.kubernetes.io/name=postgres']);
                    if (pods.length === 0) {
                      throw new SoloError('postgres pod not found');
                    }
                    const postgresPodName: PodName = pods[0].podReference.name;
                    const postgresContainerName = ContainerName.of('postgresql');
                    const postgresPodReference = PodReference.of(namespace, postgresPodName);
                    const containerReference = ContainerReference.of(postgresPodReference, postgresContainerName);
                    const mirrorEnvironmentVariables = await self.k8Factory
                      .getK8(context_.config.clusterContext)
                      .containers()
                      .readByRef(containerReference)
                      .execContainer('/bin/bash -c printenv');
                    const mirrorEnvironmentVariablesArray = mirrorEnvironmentVariables.split('\n');
                    const HEDERA_MIRROR_IMPORTER_DB_OWNER = helpers.getEnvironmentValue(
                      mirrorEnvironmentVariablesArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNER',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD = helpers.getEnvironmentValue(
                      mirrorEnvironmentVariablesArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_NAME = helpers.getEnvironmentValue(
                      mirrorEnvironmentVariablesArray,
                      'HEDERA_MIRROR_IMPORTER_DB_NAME',
                    );

                    await self.k8Factory
                      .getK8(context_.config.clusterContext)
                      .containers()
                      .readByRef(containerReference)
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
    } catch (error) {
      throw new SoloError(`Error deploying mirror node: ${error.message}`, error);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<MirrorNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
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
            const clusterReference = this.configManager.getFlag<string>(flags.clusterRef) as string;
            const clusterContext = clusterReference
              ? this.localConfig.clusterRefs[clusterReference]
              : this.k8Factory.default().contexts().readCurrent();

            if (!(await self.k8Factory.getK8(clusterContext).namespaces().has(namespace))) {
              throw new SoloError(`namespace ${namespace} does not exist`);
            }

            const isChartInstalled = await this.chartManager.isChartInstalled(
              namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
              clusterContext,
            );

            context_.config = {
              clusterContext,
              namespace,
              isChartInstalled,
            };

            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy mirror-node',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
              context_.config.clusterContext,
            );
          },
          skip: context_ => !context_.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async context_ => {
            // filtering postgres and redis PVCs using instance labels
            // since they have different name or component labels
            const pvcs = await self.k8Factory
              .getK8(context_.config.clusterContext)
              .pvcs()
              .list(context_.config.namespace, [`app.kubernetes.io/instance=${constants.MIRROR_NODE_RELEASE_NAME}`]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await self.k8Factory
                  .getK8(context_.config.clusterContext)
                  .pvcs()
                  .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc)));
              }
            }
          },
          skip: context_ => !context_.config.isChartInstalled,
        },
        {
          title: 'Uninstall mirror ingress controller',
          task: async context_ => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.INGRESS_CONTROLLER_RELEASE_NAME,
              context_.config.clusterContext,
            );
            // delete ingress class if found one
            const existingIngressClasses = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            existingIngressClasses.map(ingressClass => {
              if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
                this.k8Factory
                  .getK8(context_.config.clusterContext)
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
    } catch (error) {
      throw new SoloError(`Error destroying mirror node: ${error.message}`, error);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  public getCommandDefinition() {
    const self = this;
    return {
      command: MirrorNodeCommand.COMMAND_NAME,
      desc: 'Manage Hedera Mirror Node in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async argv => {
              self.logger.info("==== Running 'mirror-node deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node deploy`====');
                  if (!r) {
                    throw new SoloError('Error deploying mirror node, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error deploying mirror node: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: y =>
              flags.setOptionalCommandFlags(
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
                  if (!r) {
                    throw new SoloError('Error destroying mirror node, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error destroying mirror node: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a mirror-node command');
      },
    };
  }

  /** Removes the mirror node components from remote config. */
  public removeMirrorNodeComponents(): SoloListrTask<MirrorNodeDestroyContext> {
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
  public addMirrorNodeComponents(): SoloListrTask<MirrorNodeDeployContext> {
    return {
      title: 'Add mirror node to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, clusterRef},
          } = context_;

          remoteConfig.components.add(new MirrorNodeComponent('mirrorNode', clusterRef, namespace.name));
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
