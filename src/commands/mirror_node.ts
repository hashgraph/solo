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
import { ListrEnquirerPromptAdapter } from '@listr2/prompt-adapter-enquirer'
import { Listr } from 'listr2'
import { SoloError, IllegalArgumentError, MissingArgumentError } from '../core/errors.ts'
import { constants, type ProfileManager } from '../core/index.ts'
import { BaseCommand } from './base.ts'
import * as flags from './flags.ts'
import * as prompts from './prompts.ts'
import { getFileContents, getEnvValue } from '../core/helpers.ts'
import { type AccountManager } from '../core/account_manager.ts'
import { type PodName } from '../types/aliases.ts'
import { type Opts } from '../types/index.js'

export class MirrorNodeCommand extends BaseCommand {
  private readonly accountManager: AccountManager
  private readonly profileManager: ProfileManager

  constructor (opts: Opts) {
    super(opts)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.accountManager = opts.accountManager
    this.profileManager = opts.profileManager
  }

  static readonly DEPLOY_CONFIGS_NAME = 'deployConfigs'

  static readonly DEPLOY_FLAGS_LIST = [
    flags.chartDirectory,
    flags.deployHederaExplorer,
    flags.enableHederaExplorerTls,
    flags.soloChartVersion,
    flags.hederaExplorerTlsHostName,
    flags.hederaExplorerTlsLoadBalancerIp,
    flags.namespace,
    flags.profileFile,
    flags.profileName,
    flags.quiet,
    flags.tlsClusterIssuerType,
    flags.valuesFile,
    flags.mirrorNodeVersion
  ]

  /**
   * @param tlsClusterIssuerType
   * @param enableHederaExplorerTls
   * @param namespace
   * @param hederaExplorerTlsLoadBalancerIp
   * @param hederaExplorerTlsHostName
   */
  getTlsValueArguments (tlsClusterIssuerType: string, enableHederaExplorerTls: boolean, namespace: string,
    hederaExplorerTlsLoadBalancerIp: string, hederaExplorerTlsHostName: string) {
    let valuesArg = ''

    if (enableHederaExplorerTls) {
      if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
        throw new Error(`Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`)
      }

      valuesArg += ' --set hedera-explorer.ingress.enabled=true'
      valuesArg += ' --set cloud.haproxyIngressController.enabled=true'
      valuesArg += ` --set global.ingressClassName=${namespace}-hedera-explorer-ingress-class`
      valuesArg += ` --set-json 'hedera-explorer.ingress.hosts[0]={"host":"${hederaExplorerTlsHostName}","paths":[{"path":"/","pathType":"Prefix"}]}'`

      if (hederaExplorerTlsLoadBalancerIp !== '') {
        valuesArg += ` --set haproxy-ingress.controller.service.loadBalancerIP=${hederaExplorerTlsLoadBalancerIp}`
      }

      if (tlsClusterIssuerType === 'self-signed') {
        valuesArg += ' --set cloud.selfSignedClusterIssuer.enabled=true'
      } else {
        valuesArg += ' --set cloud.acmeClusterIssuer.enabled=true'
        valuesArg += ` --set hedera-explorer.certClusterIssuerType=${tlsClusterIssuerType}`
      }
    }

    return valuesArg
  }

  async prepareValuesArg (config: any) {
    let valuesArg = ''

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName)
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile)
    }

    if (config.enableHederaExplorerTls) {
      valuesArg += this.getTlsValueArguments(config.tlsClusterIssuerType, config.enableHederaExplorerTls, config.namespace,
        config.hederaExplorerTlsLoadBalancerIp, config.hederaExplorerTlsHostName)
    }

    if (config.mirrorNodeVersion) {
      valuesArg += ` --set global.image.tag=${config.mirrorNodeVersion}`
    }

    valuesArg += ` --set hedera-mirror-node.enabled=true --set hedera-explorer.enabled=${config.deployHederaExplorer}`

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile)
    }

    return valuesArg
  }

  async deploy (argv: any) {
    const self = this

    interface MirrorNodeDeployConfigClass {
      chartDirectory: string
      deployHederaExplorer: boolean
      enableHederaExplorerTls: string
      soloChartVersion: string
      hederaExplorerTlsHostName: string
      hederaExplorerTlsLoadBalancerIp: string
      namespace: string
      profileFile: string
      profileName: string
      tlsClusterIssuerType: string
      valuesFile: string
      chartPath: string
      valuesArg: string
      mirrorNodeVersion: string
      getUnusedConfigs: () => string[]
    }

    interface Context {
      config: MirrorNodeDeployConfigClass
      addressBook: string
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.chartDirectory,
            flags.deployHederaExplorer,
            flags.enableHederaExplorerTls,
            flags.soloChartVersion,
            flags.hederaExplorerTlsHostName,
            flags.hederaExplorerTlsLoadBalancerIp,
            flags.tlsClusterIssuerType,
            flags.valuesFile,
            flags.mirrorNodeVersion
          ])

          await prompts.execute(task, self.configManager, MirrorNodeCommand.DEPLOY_FLAGS_LIST)

          ctx.config = this.getConfig(MirrorNodeCommand.DEPLOY_CONFIGS_NAME, MirrorNodeCommand.DEPLOY_FLAGS_LIST,
            ['chartPath', 'valuesArg']) as MirrorNodeDeployConfigClass

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
            constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

          ctx.config.valuesArg = await self.prepareValuesArg(ctx.config)

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Enable mirror-node',
        task: (_, parentTask) => {
          return parentTask.newListr<Context>([
            {
              title: 'Prepare address book',
              task: async (ctx) => {
                ctx.addressBook = await self.accountManager.prepareAddressBookBase64()
                ctx.config.valuesArg += ` --set "hedera-mirror-node.importer.addressBook=${ctx.addressBook}"`
              }
            },
            {
              title: 'Deploy mirror-node',
              task: async (ctx) => {
                await self.chartManager.upgrade(
                  ctx.config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  ctx.config.chartPath,
                  ctx.config.valuesArg,
                  ctx.config.soloChartVersion
                )
              }
            }
          ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Check pods are ready',
        task: (_, parentTask) => {
          return parentTask.newListr([
            {
              title: 'Check Postgres DB',
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=postgresql',
                  'app.kubernetes.io/name=postgres'
                ], 1, 300, 2000)
            },
            {
              title: 'Check REST API',
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=rest',
                  'app.kubernetes.io/name=rest'
                ], 1, 300, 2000)
            },
            {
              title: 'Check GRPC',
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=grpc',
                  'app.kubernetes.io/name=grpc'
                ], 1, 300, 2000)
            },
            {
              title: 'Check Monitor',
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=monitor',
                  'app.kubernetes.io/name=monitor'
                ], 1, 300, 2000)
            },
            {
              title: 'Check Importer',
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=importer',
                  'app.kubernetes.io/name=importer'
                ], 1, 300, 2000)
            },
            {
              title: 'Check Hedera Explorer',
              skip: (ctx) => !ctx.config.deployHederaExplorer,
              task: async () => await self.k8.waitForPodReady([
                  'app.kubernetes.io/component=hedera-explorer',
                  'app.kubernetes.io/name=hedera-explorer'
                ], 1, 300, 2000)
            }
          ], {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Seed DB data',
        task: (_, parentTask) => {
          return parentTask.newListr([
            {
              title: 'Insert data in public.file_data',
              task: async () => {
                const namespace = self.configManager.getFlag<string>(flags.namespace) as string

                const feesFileIdNum = 111
                const exchangeRatesFileIdNum = 112
                const timestamp = Date.now()

                const fees = await getFileContents(this.accountManager, namespace, feesFileIdNum)
                const exchangeRates = await getFileContents(this.accountManager, namespace, exchangeRatesFileIdNum)

                const importFeesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'}, ${feesFileIdNum}, 17);`
                const importExchangeRatesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${exchangeRates}', 'hex'), ${
                  timestamp + '000001'
                }, ${exchangeRatesFileIdNum}, 17);`
                const sqlQuery = [importFeesQuery, importExchangeRatesQuery].join('\n')

                const pods = await this.k8.getPodsByLabel(['app.kubernetes.io/name=postgres'])
                if (pods.length === 0) {
                  throw new SoloError('postgres pod not found')
                }
                const postgresPodName = pods[0].metadata.name as PodName
                const postgresContainerName = 'postgresql'
                const mirrorEnvVars = await self.k8.execContainer(postgresPodName, postgresContainerName, '/bin/bash -c printenv')
                const mirrorEnvVarsArray = mirrorEnvVars.split('\n')
                const HEDERA_MIRROR_IMPORTER_DB_OWNER = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_OWNER')
                const HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD')
                const HEDERA_MIRROR_IMPORTER_DB_NAME = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_NAME')

                await self.k8.execContainer(postgresPodName, postgresContainerName, [
                  'psql',
                  `postgresql://${HEDERA_MIRROR_IMPORTER_DB_OWNER}:${HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD}@localhost:5432/${HEDERA_MIRROR_IMPORTER_DB_NAME}`,
                  '-c',
                  sqlQuery
                ])
              }
            }
          ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
      self.logger.debug('node start has completed')
    } catch (e: Error | any) {
      throw new SoloError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.accountManager.close()
    }

    return true
  }

  async destroy (argv: any) {
    const self = this

    interface Context {
      config: {
        chartDirectory: string
        soloChartVersion: string
        namespace: string
        chartPath: string
        valuesArg: string
      }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          if (!argv.force) {
            const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
              type: 'toggle',
              default: false,
              message: 'Are you sure you would like to destroy the mirror-node components?'
            })

            if (!confirm) {
              process.exit(0)
            }
          }

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace
          ])

          // @ts-ignore
          ctx.config = {
            chartDirectory: self.configManager.getFlag<string>(flags.chartDirectory) as string,
            soloChartVersion: self.configManager.getFlag<string>(flags.soloChartVersion) as string,
            namespace: self.configManager.getFlag<string>(flags.namespace) as string
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
            constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

          ctx.config.valuesArg = ' --set hedera-mirror-node.enabled=false --set hedera-explorer.enabled=false'

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Destroy mirror-node',
        task: async (ctx) => {
          await self.chartManager.upgrade(
            ctx.config.namespace,
            constants.SOLO_DEPLOYMENT_CHART,
            ctx.config.chartPath,
            ctx.config.valuesArg,
            ctx.config.soloChartVersion
          )
        }
      },
      {
        title: 'Delete PVCs',
        task: async (ctx) => {
          const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace, [
            'app.kubernetes.io/component=postgresql',
            'app.kubernetes.io/instance=solo-deployment',
            'app.kubernetes.io/name=postgres'
          ])

          if (pvcs) {
            for (const pvc of pvcs) {
              await self.k8.deletePvc(pvc, ctx.config.namespace)
            }
          }
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
      self.logger.debug('node start has completed')
    } catch (e: Error | any) {
      throw new SoloError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.accountManager.close()
    }

    return true
  }

  /** Return Yargs command definition for 'mirror-mirror-node' command */
  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const mirrorNodeCmd = this
    return {
      command: 'mirror-node',
      desc: 'Manage Hedera Mirror Node in solo network',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: (y: any) => flags.setCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
              mirrorNodeCmd.logger.debug('==== Running \'mirror-node deploy\' ===')
              mirrorNodeCmd.logger.debug(argv)

              mirrorNodeCmd.deploy(argv).then(r => {
                mirrorNodeCmd.logger.debug('==== Finished running `mirror-node deploy`====')
                if (!r) process.exit(1)
              }).catch(err => {
                mirrorNodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.chartDirectory,
              flags.force,
              flags.soloChartVersion,
              flags.namespace
            ),
            handler: (argv: any) => {
              mirrorNodeCmd.logger.debug('==== Running \'mirror-node destroy\' ===')
              mirrorNodeCmd.logger.debug(argv)

              mirrorNodeCmd.destroy(argv).then(r => {
                mirrorNodeCmd.logger.debug('==== Finished running `mirror-node destroy`====')
                if (!r) process.exit(1)
              }).catch(err => {
                mirrorNodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a mirror-node command')
      }
    }
  }
}
