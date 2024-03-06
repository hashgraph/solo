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
import chalk from 'chalk'
import * as fs from 'fs'
import { Listr } from 'listr2'
import path from 'path'
import { FullstackTestingError, IllegalArgumentError } from '../core/errors.mjs'
import * as helpers from '../core/helpers.mjs'
import { sleep } from '../core/helpers.mjs'
import { constants, Templates } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'

/**
 * Defines the core functionalities of 'node' command
 */
export class NodeCommand extends BaseCommand {
  constructor (opts) {
    super(opts)

    if (!opts || !opts.downloader) throw new IllegalArgumentError('An instance of core/PackageDowner is required', opts.downloader)
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)

    this.downloader = opts.downloader
    this.plaformInstaller = opts.platformInstaller
    this.keyManager = opts.keyManager
    this.accountManager = opts.accountManager
  }

  async checkNetworkNodePod (namespace, nodeId) {
    nodeId = nodeId.trim()
    const podName = Templates.renderNetworkPodName(nodeId)

    try {
      await this.k8.waitForPod(constants.POD_STATUS_RUNNING, [
        'fullstack.hedera.com/type=network-node',
        `fullstack.hedera.com/node-name=${nodeId}`
      ], 1)

      return podName
    } catch (e) {
      throw new FullstackTestingError(`no pod found for nodeId: ${nodeId}`, e)
    }
  }

  async checkNetworkNodeStarted (nodeId, maxAttempt = 100, status = 'ACTIVE') {
    nodeId = nodeId.trim()
    const podName = Templates.renderNetworkPodName(nodeId)
    const logfilePath = `${constants.HEDERA_HAPI_PATH}/logs/hgcaa.log`
    let attempt = 0
    let isActive = false

    // check log file is accessible
    let logFileAccessible = false
    while (attempt++ < maxAttempt) {
      try {
        if (await this.k8.hasFile(podName, constants.ROOT_CONTAINER, logfilePath)) {
          logFileAccessible = true
          break
        }
      } catch (e) {} // ignore errors

      await sleep(1000)
    }

    if (!logFileAccessible) {
      throw new FullstackTestingError(`Logs are not accessible: ${logfilePath}`)
    }

    attempt = 0
    while (attempt < maxAttempt) {
      try {
        const output = await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['tail', '-10', logfilePath])
        if (output && output.indexOf('Terminating Netty') < 0 && // make sure we are not at the beginning of a restart
            output.indexOf(`Now current platform status = ${status}`) > 0) {
          this.logger.debug(`Node ${nodeId} is ${status} [ attempt: ${attempt}/${maxAttempt}]`)
          isActive = true
          break
        }
        this.logger.debug(`Node ${nodeId} is not ${status} yet. Trying again... [ attempt: ${attempt}/${maxAttempt} ]`)
      } catch (e) {
        this.logger.warn(`error in checking if node ${nodeId} is ${status}: ${e.message}. Trying again... [ attempt: ${attempt}/${maxAttempt} ]`)

        // ls the HAPI path for debugging
        await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}`)

        // ls the logs directory for debugging
        await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}/logs`)
      }
      attempt += 1
      await sleep(1000)
    }

    this.logger.info(`!> -- Node ${nodeId} is ${status} -- <!`)

    if (!isActive) {
      throw new FullstackTestingError(`node '${nodeId}' is not ${status} [ attempt = ${attempt}/${maxAttempt} ]`)
    }

    return true
  }

  /**
   * Return task for checking for all network node pods
   */
  taskCheckNetworkNodePods (ctx, task) {
    if (!ctx.config) {
      ctx.config = {}
    }

    ctx.config.podNames = {}

    const subTasks = []
    for (const nodeId of ctx.config.nodeIds) {
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeId)}`,
        task: async (ctx) => {
          ctx.config.podNames[nodeId] = await this.checkNetworkNodePod(ctx.config.namespace, nodeId)
        }
      })
    }

    // setup the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  async _copyNodeKeys (nodeKey, destDir) {
    for (const keyFile of [nodeKey.privateKeyFile, nodeKey.certificateFile]) {
      if (!fs.existsSync(keyFile)) {
        throw new FullstackTestingError(`file (${keyFile}) is missing`)
      }

      const fileName = path.basename(keyFile)
      fs.cpSync(keyFile, `${destDir}/${fileName}`)
    }
  }

  async setup (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeIDs,
            flags.releaseTag,
            flags.cacheDir,
            flags.chainId,
            flags.generateGossipKeys,
            flags.generateTlsKeys,
            flags.keyFormat
          ])

          const config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIDs(self.configManager.getFlag(flags.nodeIDs)),
            releaseTag: self.configManager.getFlag(flags.releaseTag),
            cacheDir: self.configManager.getFlag(flags.cacheDir),
            force: self.configManager.getFlag(flags.force),
            chainId: self.configManager.getFlag(flags.chainId),
            generateGossipKeys: self.configManager.getFlag(flags.generateGossipKeys),
            generateTlsKeys: self.configManager.getFlag(flags.generateTlsKeys),
            keyFormat: self.configManager.getFlag(flags.keyFormat)
          }

          // compute other config parameters
          config.releasePrefix = Templates.prepareReleasePrefix(config.releaseTag)
          config.buildZipFile = `${config.cacheDir}/${config.releasePrefix}/build-${config.releaseTag}.zip`
          config.keysDir = path.join(config.cacheDir, 'keys')
          config.stagingDir = Templates.renderStagingDir(self.configManager, flags)
          config.stagingKeysDir = path.join(config.stagingDir, 'keys')

          if (config.keyFormat === constants.KEY_FORMAT_PFX && config.generateGossipKeys) {
            throw new FullstackTestingError('Unable to generate PFX gossip keys.\n' +
              `Please ensure you have pre-generated (*.pfx) key files in keys directory: ${config.keysDir}\n`
            )
          }

          if (!await this.k8.hasNamespace(config.namespace)) {
            throw new FullstackTestingError(`namespace ${config.namespace} does not exist`)
          }

          // prepare staging keys directory
          if (!fs.existsSync(config.stagingKeysDir)) {
            fs.mkdirSync(config.stagingKeysDir, { recursive: true })
          }

          // create cached keys dir if it does not exist yet
          if (!fs.existsSync(config.keysDir)) {
            fs.mkdirSync(config.keysDir)
          }

          // set config in the context for later tasks to use
          ctx.config = config

          self.logger.debug('Initialized config', { config })
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task)
      },
      {
        title: 'Generate Gossip keys',
        task: async (ctx, _) => {
          const config = ctx.config

          // generate gossip keys if required
          if (config.generateGossipKeys) {
            for (const nodeId of ctx.config.nodeIds) {
              const signingKey = await self.keyManager.generateSigningKey(nodeId)
              const signingKeyFiles = await self.keyManager.storeSigningKey(nodeId, signingKey, config.keysDir)
              self.logger.debug(`generated Gossip signing keys for node ${nodeId}`, { keyFiles: signingKeyFiles })

              const agreementKey = await self.keyManager.generateAgreementKey(nodeId, signingKey)
              const agreementKeyFiles = await self.keyManager.storeAgreementKey(nodeId, agreementKey, config.keysDir)
              self.logger.debug(`generated Gossip agreement keys for node ${nodeId}`, { keyFiles: agreementKeyFiles })
            }
          }
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, _) => {
          const config = ctx.config
          // generate TLS keys if required
          if (config.generateTlsKeys) {
            for (const nodeId of ctx.config.nodeIds) {
              const tlsKeys = await self.keyManager.generateGrpcTLSKey(nodeId)
              const tlsKeyFiles = await self.keyManager.storeTLSKey(nodeId, tlsKeys, config.keysDir)
              self.logger.debug(`generated TLS keys for node: ${nodeId}`, { keyFiles: tlsKeyFiles })
            }
          }
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = [
            {
              title: 'Copy configuration files',
              task: () => {
                for (const flag of flags.nodeConfigFileFlags.values()) {
                  const filePath = self.configManager.getFlag(flag)
                  if (!filePath) {
                    throw new FullstackTestingError(`Configuration file path is missing for: ${flag.name}`)
                  }

                  const fileName = path.basename(filePath)
                  fs.cpSync(`${filePath}`, `${config.stagingDir}/templates/${fileName}`, { recursive: true })
                }
              }
            },
            {
              title: 'Copy Gossip keys to staging',
              task: async (ctx, _) => {
                const config = ctx.config

                // copy gossip keys to the staging
                for (const nodeId of ctx.config.nodeIds) {
                  switch (config.keyFormat) {
                    case constants.KEY_FORMAT_PEM: {
                      const signingKeyFiles = self.keyManager.prepareNodeKeyFilePaths(nodeId, config.keysDir, constants.SIGNING_KEY_PREFIX)
                      await self._copyNodeKeys(signingKeyFiles, config.stagingKeysDir)

                      // generate missing agreement keys
                      const agreementKeyFiles = self.keyManager.prepareNodeKeyFilePaths(nodeId, config.keysDir, constants.AGREEMENT_KEY_PREFIX)
                      await self._copyNodeKeys(agreementKeyFiles, config.stagingKeysDir)
                      break
                    }

                    case constants.KEY_FORMAT_PFX: {
                      const privateKeyFile = Templates.renderGossipPfxPrivateKeyFile(nodeId)
                      fs.cpSync(`${config.keysDir}/${privateKeyFile}`, `${config.stagingKeysDir}/${privateKeyFile}`)
                      fs.cpSync(`${config.keysDir}/public.pfx`, `${config.stagingKeysDir}/public.pfx`)
                      break
                    }

                    default:
                      throw new FullstackTestingError(`Unsupported key-format ${config.keyFormat}`)
                  }
                }
              }
            },
            {
              title: 'Copy gRPC TLS keys to staging',
              task: async (ctx, _) => {
                const config = ctx.config
                for (const nodeId of ctx.config.nodeIds) {
                  const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeId, config.keysDir)
                  await self._copyNodeKeys(tlsKeyFiles, config.stagingKeysDir)
                }
              }
            },
            {
              title: 'Prepare config.txt for the network',
              task: async (ctx, _) => {
                const config = ctx.config
                const configTxtPath = `${config.stagingDir}/config.txt`
                const template = `${constants.RESOURCES_DIR}/templates/config.template`
                await self.plaformInstaller.prepareConfigTxt(config.nodeIds, configTxtPath, config.releaseTag, config.chainId, template)
              }
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Fetch platform software into network nodes',
        task:
          async (ctx, task) => {
            const config = ctx.config

            const subTasks = []
            for (const nodeId of ctx.config.nodeIds) {
              const podName = ctx.config.podNames[nodeId]
              subTasks.push({
                title: `Node: ${chalk.yellow(nodeId)}`,
                task: () =>
                  self.plaformInstaller.fetchPlatform(podName, config.releaseTag)
              })
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true, // since we download in the container directly, we want this to be in parallel across all nodes
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          const config = ctx.config

          const subTasks = []
          for (const nodeId of config.nodeIds) {
            const podName = config.podNames[nodeId]
            subTasks.push({
              title: `Node: ${chalk.yellow(nodeId)}`,
              task: () =>
                self.plaformInstaller.taskInstall(podName, config.buildZipFile, config.stagingDir, config.nodeIds, config.keyFormat, config.force)
            })
          }

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
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
    } catch (e) {
      throw new FullstackTestingError(`Error in setting up nodes: ${e.message}`, e)
    }

    return true
  }

  async start (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.chartDirectory,
            flags.nodeIDs,
            flags.deployHederaExplorer,
            flags.deployMirrorNode,
            flags.updateAccountKeys
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            fstChartVersion: self.configManager.getFlag(flags.fstChartVersion),
            nodeIds: helpers.parseNodeIDs(self.configManager.getFlag(flags.nodeIDs)),
            deployMirrorNode: self.configManager.getFlag(flags.deployMirrorNode),
            deployHederaExplorer: self.configManager.getFlag(flags.deployHederaExplorer),
            updateAccountKeys: self.configManager.getFlag(flags.updateAccountKeys),
            applicationEnv: self.configManager.getFlag(flags.applicationEnv),
            cacheDir: self.configManager.getFlag(flags.cacheDir)
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDir,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

          ctx.config.stagingDir = Templates.renderStagingDir(self.configManager, flags)

          ctx.config.valuesArg = ` --set hedera-mirror-node.enabled=${ctx.config.deployMirrorNode} --set hedera-explorer.enabled=${ctx.config.deployHederaExplorer}`

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task)
      },
      {
        title: 'Starting nodes',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            const podName = ctx.config.podNames[nodeId]
            subTasks.push({
              title: `Start node: ${chalk.yellow(nodeId)}`,
              task: async () => {
                await self.k8.execContainer(podName, constants.ROOT_CONTAINER, ['rm', '-rf', `${constants.HEDERA_HAPI_PATH}/data/logs`])

                // copy application.env file if required
                if (ctx.config.applicationEnv) {
                  const stagingDir = Templates.renderStagingDir(self.configManager, flags)
                  const applicationEnvFile = path.join(stagingDir, 'application.env')
                  fs.cpSync(ctx.config.applicationEnv, applicationEnvFile)
                  await self.k8.copyTo(podName, constants.ROOT_CONTAINER, applicationEnvFile, `${constants.HEDERA_HAPI_PATH}`)
                }

                await self.k8.execContainer(podName, constants.ROOT_CONTAINER, ['systemctl', 'restart', 'network-node'])
              }
            })
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      },
      {
        title: 'Check nodes are ACTIVE',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            subTasks.push({
              title: `Check node: ${chalk.yellow(nodeId)}`,
              task: () => self.checkNetworkNodeStarted(nodeId)
            })
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        }
      },
      {
        title: 'Enable mirror node',
        task: async (ctx, parentTask) => {
          if (ctx.config.deployMirrorNode) {
            const subTasks = [
              {
                title: 'Check node proxies are ACTIVE',
                task: async (ctx, _) => {
                  const subTasks = []
                  for (const nodeId of ctx.config.nodeIds) {
                    subTasks.push({
                      title: `Check proxy for node: ${chalk.yellow(nodeId)}`,
                      task: async () => await self.checkNetworkNodeProxyUp(ctx.config.namespace, nodeId)
                    })
                  }

                  // set up the sub-tasks
                  return parentTask.newListr(subTasks, {
                    concurrent: false,
                    rendererOptions: {
                      collapseSubtasks: false
                    }
                  })
                }
              },
              {
                title: 'Prepare address book',
                task: async (ctx, _) => {
                  ctx.addressBook = await self.getAddressBook(ctx.nodeClient)
                  ctx.config.valuesArg += ` --set "hedera-mirror-node.importer.addressBook=${ctx.addressBook}"`
                }
              },
              {
                title: 'Deploy mirror node',
                task: async (ctx, _) => {
                  await self.chartManager.upgrade(
                    ctx.config.namespace,
                    constants.FULLSTACK_DEPLOYMENT_CHART,
                    ctx.config.chartPath,
                    ctx.config.valuesArg
                  )
                }
              },
              {
                title: 'Waiting for Hedera Explorer to be ready',
                task: async (ctx, _) => {
                  if (ctx.config.deployHederaExplorer) {
                    await self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                      'app.kubernetes.io/component=hedera-explorer', 'app.kubernetes.io/name=hedera-explorer'
                    ], 1, 200)
                  }
                }
              }
            ]

            return parentTask.newListr(subTasks, {
              concurrent: false,
              rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
            })
          }
        }
      },
      {
        title: 'Update special account keys',
        task: async (ctx, task) => {
          if (ctx.config.updateAccountKeys) {
            return new Listr([
              {
                title: 'Prepare for account key updates',
                task: async (ctx) => {
                  const secrets = await self.k8.getSecretsByLabel(['fullstack.hedera.com/account-id'])
                  ctx.updateSecrets = secrets.length > 0

                  ctx.accountsBatchedSet = self.accountManager.batchAccounts()

                  ctx.resultTracker = {
                    rejectedCount: 0,
                    fulfilledCount: 0,
                    skippedCount: 0
                  }
                }
              },
              {
                title: 'Update special account key sets',
                task: async (ctx) => {
                  let setIndex = 1
                  const subTasks = []
                  for (const currentSet of ctx.accountsBatchedSet) {
                    subTasks.push({
                      title: `Updating set ${chalk.yellow(
                          setIndex)} of ${chalk.yellow(
                          ctx.accountsBatchedSet.length)}`,
                      task: async (ctx) => {
                        ctx.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                          ctx.config.namespace, currentSet,
                          ctx.updateSecrets, ctx.resultTracker)
                      }
                    })
                    setIndex++
                  }

                  // set up the sub-tasks
                  return task.newListr(subTasks, {
                    concurrent: false,
                    rendererOptions: {
                      collapseSubtasks: false
                    }
                  })
                }
              },
              {
                title: 'Display results',
                task: async (ctx) => {
                  self.logger.showUser(chalk.green(`Account keys updated SUCCESSFULLY: ${ctx.resultTracker.fulfilledCount}`))
                  if (ctx.resultTracker.skippedCount > 0) self.logger.showUser(chalk.cyan(`Account keys updates SKIPPED: ${ctx.resultTracker.skippedCount}`))
                  if (ctx.resultTracker.rejectedCount > 0) {
                    self.logger.showUser(chalk.yellowBright(`Account keys updates with ERROR: ${ctx.resultTracker.rejectedCount}`))
                    throw new FullstackTestingError(`Account keys updates failed for ${ctx.resultTracker.rejectedCount} accounts, exiting`)
                  }
                }
              }
            ], {
              concurrent: false,
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          } else {
            self.logger.showUser(chalk.yellowBright('> WARNING:'), chalk.yellow(
              'skipping special account keys update, special accounts will retain genesis private keys'))
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
    } catch (e) {
      throw new FullstackTestingError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.accountManager.close()
    }

    return true
  }

  async checkNetworkNodeProxyUp (namespace, nodeId, maxAttempts = 100) {
    const podArray = await this.k8.getPodsByLabel([`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'])

    let attempts = 0
    if (podArray.length > 0) {
      const podName = podArray[0].metadata.name

      while (attempts < maxAttempts) {
        const logResponse = await this.k8.kubeClient.readNamespacedPodLog(
          podName, namespace)

        if (logResponse.response.statusCode !== 200) {
          throw new FullstackTestingError(`Expected pod ${podName} log query to execute successful, but instead got a status of ${logResponse.response.statusCode}`)
        }

        if (logResponse.body.includes('Server be_servers/server1 is UP')) {
          return true
        }

        attempts++
        this.logger.debug(`Checking for pod ${podName} to realize network node is UP [attempt: ${attempts}/${maxAttempts}]`)
        await sleep(1000)
      }
    } else {
      throw new FullstackTestingError(`proxy for '${nodeId}' is not ACTIVE [ attempt = ${attempts}/${maxAttempts}`)
    }

    return false
  }

  /**
   * Will get the address book from the network (base64 encoded)
   * @param nodeClient the configured and active NodeClient to use to retrieve the address book
   * @returns {Promise<string>} the base64 encoded address book for the network
   */
  async getAddressBook (nodeClient) {
    try {
      // Retrieve the AddressBook as base64
      return await this.accountManager.prepareAddressBookBase64(nodeClient)
    } catch (e) {
      throw new FullstackTestingError(`an error was encountered while trying to prepare the address book: ${e.message}`, e)
    }
  }

  async stop (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeIDs
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIDs(self.configManager.getFlag(flags.nodeIDs))
          }

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task)
      },
      {
        title: 'Stopping nodes',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            const podName = ctx.config.podNames[nodeId]
            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeId)}`,
              task: () => self.k8.execContainer(podName, constants.ROOT_CONTAINER, 'systemctl stop network-node')
            })
          }

          // setup the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error starting node', e)
    }

    return true
  }

  async keys (argv) {
    const self = this
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.nodeIDs,
            flags.cacheDir,
            flags.generateGossipKeys,
            flags.generateTlsKeys,
            flags.keyFormat
          ])

          const config = {
            nodeIds: helpers.parseNodeIDs(self.configManager.getFlag(flags.nodeIDs)),
            cacheDir: self.configManager.getFlag(flags.cacheDir),
            generateGossipKeys: self.configManager.getFlag(flags.generateGossipKeys),
            generateTlsKeys: self.configManager.getFlag(flags.generateTlsKeys),
            keyFormat: self.configManager.getFlag(flags.keyFormat),
            keysDir: path.join(self.configManager.getFlag(flags.cacheDir), 'keys')
          }

          if (!fs.existsSync(config.keysDir)) {
            fs.mkdirSync(config.keysDir)
          }

          if (config.keyFormat === constants.KEY_FORMAT_PFX && config.generateGossipKeys) {
            throw new FullstackTestingError('Unable to generate PFX gossip keys.\n' +
              `Please ensure you have pre-generated (*.pfx) key files in keys directory: ${config.keysDir}\n`
            )
          }

          ctx.config = config
        }
      },
      {
        title: 'Generate gossip keys',
        task: async (ctx, task) => {
          const keysDir = ctx.config.keysDir
          const nodeKeyFiles = new Map()
          if (ctx.config.generateGossipKeys) {
            for (const nodeId of ctx.config.nodeIds) {
              const signingKey = await self.keyManager.generateSigningKey(nodeId)
              const signingKeyFiles = await self.keyManager.storeSigningKey(nodeId, signingKey, keysDir)
              const agreementKey = await self.keyManager.generateAgreementKey(nodeId, signingKey)
              const agreementKeyFiles = await self.keyManager.storeAgreementKey(nodeId, agreementKey, keysDir)
              nodeKeyFiles.set(nodeId, {
                signingKey,
                agreementKey,
                signingKeyFiles,
                agreementKeyFiles
              })
            }

            if (argv.dev) {
              self.logger.showUser(chalk.green('*** Generated Node Gossip Keys ***'))
              for (const entry of nodeKeyFiles.entries()) {
                const nodeId = entry[0]
                const fileList = entry[1]
                self.logger.showUser(chalk.cyan('---------------------------------------------------------------------------------------------'))
                self.logger.showUser(chalk.cyan(`Node ID: ${nodeId}`))
                self.logger.showUser(chalk.cyan('==========================='))
                self.logger.showUser(chalk.green('Signing key\t\t:'), chalk.yellow(fileList.signingKeyFiles.privateKeyFile))
                self.logger.showUser(chalk.green('Signing certificate\t:'), chalk.yellow(fileList.signingKeyFiles.certificateFile))
                self.logger.showUser(chalk.green('Agreement key\t\t:'), chalk.yellow(fileList.agreementKeyFiles.privateKeyFile))
                self.logger.showUser(chalk.green('Agreement certificate\t:'), chalk.yellow(fileList.agreementKeyFiles.certificateFile))
                self.logger.showUser(chalk.blue('Inspect certificate\t: '), chalk.yellow(`openssl storeutl -noout -text -certs ${fileList.agreementKeyFiles.certificateFile}`))
                self.logger.showUser(chalk.blue('Verify certificate\t: '), chalk.yellow(`openssl verify -CAfile ${fileList.signingKeyFiles.certificateFile} ${fileList.agreementKeyFiles.certificateFile}`))
              }
              self.logger.showUser(chalk.cyan('---------------------------------------------------------------------------------------------'))
            }
          }
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, task) => {
          const keysDir = ctx.config.keysDir
          const nodeKeyFiles = new Map()
          if (ctx.config.generateTlsKeys) {
            for (const nodeId of ctx.config.nodeIds) {
              const tlsKey = await self.keyManager.generateGrpcTLSKey(nodeId)
              const tlsKeyFiles = await self.keyManager.storeTLSKey(nodeId, tlsKey, keysDir)
              nodeKeyFiles.set(nodeId, {
                tlsKeyFiles
              })
            }

            if (argv.dev) {
              self.logger.showUser(chalk.green('*** Generated Node TLS Keys ***'))
              for (const entry of nodeKeyFiles.entries()) {
                const nodeId = entry[0]
                const fileList = entry[1]
                self.logger.showUser(chalk.cyan('---------------------------------------------------------------------------------------------'))
                self.logger.showUser(chalk.cyan(`Node ID: ${nodeId}`))
                self.logger.showUser(chalk.cyan('==========================='))
                self.logger.showUser(chalk.green('TLS key\t\t:'), chalk.yellow(fileList.tlsKeyFiles.privateKeyFile))
                self.logger.showUser(chalk.green('TLS certificate\t:'), chalk.yellow(fileList.tlsKeyFiles.certificateFile))
                self.logger.showUser(chalk.blue('Inspect certificate\t: '), chalk.yellow(`openssl storeutl -noout -text -certs ${fileList.tlsKeyFiles.certificateFile}`))
                self.logger.showUser(chalk.blue('Verify certificate\t: '), chalk.yellow(`openssl verify -CAfile ${fileList.tlsKeyFiles.certificateFile} ${fileList.tlsKeyFiles.certificateFile}`))
              }
              self.logger.showUser(chalk.cyan('---------------------------------------------------------------------------------------------'))
            }
          }
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      }
    ])

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error generating keys: ${e.message}`, e)
    }

    return true
  }

  /**
   * Return Yargs command definition for 'node' command
   * @param nodeCmd an instance of NodeCommand
   */
  static getCommandDefinition (nodeCmd) {
    return {
      command: 'node',
      desc: 'Manage Hedera platform node in fullstack testing network',
      builder: yargs => {
        return yargs
          .command({
            command: 'setup',
            desc: 'Setup node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.nodeIDs,
              flags.releaseTag,
              flags.generateGossipKeys,
              flags.generateTlsKeys,
              flags.cacheDir,
              flags.chainId,
              flags.force,
              flags.keyFormat,
              flags.applicationProperties,
              flags.apiPermissionProperties,
              flags.bootstrapProperties,
              flags.settingTxt,
              flags.log4j2Xml
            ),
            handler: argv => {
              nodeCmd.logger.debug("==== Running 'node setup' ===")
              nodeCmd.logger.debug(argv)

              nodeCmd.setup(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node setup`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'start',
            desc: 'Start a node',
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.nodeIDs,
              flags.updateAccountKeys,
              flags.applicationEnv
            ),
            handler: argv => {
              nodeCmd.logger.debug("==== Running 'node start' ===")
              nodeCmd.logger.debug(argv)

              nodeCmd.start(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node start`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'stop',
            desc: 'Stop a node',
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.nodeIDs
            ),
            handler: argv => {
              nodeCmd.logger.debug("==== Running 'node stop' ===")
              nodeCmd.logger.debug(argv)

              nodeCmd.stop(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node stop`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'keys',
            desc: 'Generate node keys',
            builder: y => flags.setCommandFlags(y,
              flags.nodeIDs,
              flags.cacheDir,
              flags.generateGossipKeys,
              flags.generateTlsKeys,
              flags.keyFormat
            ),
            handler: argv => {
              nodeCmd.logger.debug("==== Running 'node keys' ===")
              nodeCmd.logger.debug(argv)

              nodeCmd.keys(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node keys`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a node command')
      }
    }
  }
}
