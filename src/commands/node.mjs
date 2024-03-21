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
import { getTmpDir, sleep } from '../core/helpers.mjs'
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
    if (!opts || !opts.keytoolDepManager) throw new IllegalArgumentError('An instance of KeytoolDependencyManager is required', opts.keytoolDepManager)

    this.downloader = opts.downloader
    this.plaformInstaller = opts.platformInstaller
    this.keyManager = opts.keyManager
    this.accountManager = opts.accountManager
    this.keytoolDepManager = opts.keytoolDepManager
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
      } catch (e) {
      } // ignore errors

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

  /**
   * Return a list of subtasks to generate gossip keys
   *
   * WARNING: These tasks MUST run in sequence.
   *
   * @param keyFormat key format (pem | pfx)
   * @param nodeIds node ids
   * @param keysDir keys directory
   * @param curDate current date
   * @return {*[]}
   * @private
   */
  _nodeGossipKeysTaskList (keyFormat, nodeIds, keysDir, curDate = new Date()) {
    const self = this
    const subTasks = []

    switch (keyFormat) {
      case constants.KEY_FORMAT_PFX: {
        const tmpDir = getTmpDir()
        const keytool = self.keytoolDepManager.getKeytool()

        subTasks.push({
          title: `Check keytool exists (Version: ${self.keytoolDepManager.getKeytoolVersion()})`,
          task: async () => self.keytoolDepManager.checkVersion(true)

        })

        subTasks.push({
          title: 'Backup old files',
          task: () => helpers.backupOldPfxKeys(nodeIds, keysDir, curDate)
        })

        for (const nodeId of nodeIds) {
          subTasks.push({
            title: `Generate ${Templates.renderGossipPfxPrivateKeyFile(nodeId)} for node: ${chalk.yellow(nodeId)}`,
            task: async () => {
              const privatePfxFile = await self.keyManager.generatePrivatePfxKeys(keytool, nodeId, keysDir, tmpDir)
              const output = await keytool.list(`-storetype pkcs12 -storepass password -keystore ${privatePfxFile}`)
              if (!output.includes('Your keystore contains 3 entries')) {
                throw new FullstackTestingError(`malformed private pfx file: ${privatePfxFile}`)
              }
            }
          })
        }

        subTasks.push({
          title: `Generate ${constants.PUBLIC_PFX} file`,
          task: async () => {
            const publicPfxFile = await self.keyManager.updatePublicPfxKey(self.keytoolDepManager.getKeytool(), nodeIds, keysDir, tmpDir)
            const output = await keytool.list(`-storetype pkcs12 -storepass password -keystore ${publicPfxFile}`)
            if (!output.includes('Your keystore contains 9 entries')) {
              throw new FullstackTestingError(`malformed public.pfx file: ${publicPfxFile}`)
            }
          }
        })

        subTasks.push({
          title: 'Clean up temp files',
          task: async () => {
            if (fs.existsSync(tmpDir)) {
              fs.rmSync(tmpDir, { recursive: true })
            }
          }
        })
        break
      }

      case constants.KEY_FORMAT_PEM: {
        subTasks.push({
          title: 'Backup old files',
          task: () => helpers.backupOldPemKeys(nodeIds, keysDir, curDate)
        }
        )

        for (const nodeId of nodeIds) {
          subTasks.push({
            title: `Gossip ${keyFormat} key for node: ${chalk.yellow(nodeId)}`,
            task: async () => {
              const signingKey = await this.keyManager.generateSigningKey(nodeId)
              const signingKeyFiles = await this.keyManager.storeSigningKey(nodeId, signingKey, keysDir)
              this.logger.debug(`generated Gossip signing keys for node ${nodeId}`, { keyFiles: signingKeyFiles })

              const agreementKey = await this.keyManager.generateAgreementKey(nodeId, signingKey)
              const agreementKeyFiles = await this.keyManager.storeAgreementKey(nodeId, agreementKey, keysDir)
              this.logger.debug(`generated Gossip agreement keys for node ${nodeId}`, { keyFiles: agreementKeyFiles })
            }
          })
        }

        break
      }

      default:
        throw new FullstackTestingError(`unsupported key-format: ${keyFormat}`)
    }

    return subTasks
  }

  /**
   * Return a list of subtasks to generate gRPC TLS keys
   *
   * WARNING: These tasks should run in sequence
   *
   * @param nodeIds node ids
   * @param keysDir keys directory
   * @param curDate current date
   * @return {*[]}
   * @private
   */
  _nodeTlsKeyTaskList (nodeIds, keysDir, curDate = new Date()) {
    const self = this
    const nodeKeyFiles = new Map()
    const subTasks = []

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldTlsKeys(nodeIds, keysDir, curDate)
    }
    )

    for (const nodeId of nodeIds) {
      subTasks.push({
        title: `TLS key for node: ${chalk.yellow(nodeId)}`,
        task: async () => {
          const tlsKey = await self.keyManager.generateGrpcTLSKey(nodeId)
          const tlsKeyFiles = await self.keyManager.storeTLSKey(nodeId, tlsKey, keysDir)
          nodeKeyFiles.set(nodeId, {
            tlsKeyFiles
          })
        }
      })
    }

    return subTasks
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
            keyFormat: self.configManager.getFlag(flags.keyFormat),
            devMode: self.configManager.getFlag(flags.devMode),
            curDate: new Date()
          }

          // compute other config parameters
          config.releasePrefix = Templates.prepareReleasePrefix(config.releaseTag)
          config.buildZipFile = `${config.cacheDir}/${config.releasePrefix}/build-${config.releaseTag}.zip`
          config.keysDir = path.join(config.cacheDir, 'keys')
          config.stagingDir = Templates.renderStagingDir(self.configManager, flags)
          config.stagingKeysDir = path.join(config.stagingDir, 'keys')

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
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeGossipKeysTaskList(config.keyFormat, config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeTlsKeyTaskList(config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
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
                      fs.cpSync(`${config.keysDir}/${constants.PUBLIC_PFX}`, `${config.stagingKeysDir}/${constants.PUBLIC_PFX}`)
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
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
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
            flags.nodeIDs
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            fstChartVersion: self.configManager.getFlag(flags.fstChartVersion),
            nodeIds: helpers.parseNodeIDs(self.configManager.getFlag(flags.nodeIDs)),
            applicationEnv: self.configManager.getFlag(flags.applicationEnv),
            cacheDir: self.configManager.getFlag(flags.cacheDir)
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDir,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

          ctx.config.stagingDir = Templates.renderStagingDir(self.configManager, flags)

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
                await self.k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/logs/*`])

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
        title: 'Check node proxies are ACTIVE',
        task: async (ctx, parentTask) => {
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
      }], {
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

  async checkNetworkNodeProxyUp (namespace, nodeId, maxAttempts = 10, delay = 5000) {
    const podArray = await this.k8.getPodsByLabel([`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'])

    let attempts = 0
    if (podArray.length > 0) {
      const podName = podArray[0].metadata.name

      while (attempts < maxAttempts) {
        const logResponse = await this.k8.kubeClient.readNamespacedPodLog(
          podName,
          namespace,
          'haproxy',
          undefined,
          undefined,
          1024,
          undefined,
          undefined,
          undefined,
          4
        )

        if (logResponse.response.statusCode !== 200) {
          throw new FullstackTestingError(`Expected pod ${podName} log query to execute successful, but instead got a status of ${logResponse.response.statusCode}`)
        }

        this.logger.debug(`Received HAProxy log from ${podName}`, { output: logResponse.body })
        if (logResponse.body.includes('Server be_servers/server1 is UP')) {
          this.logger.debug(`Proxy ${podName} is UP [attempt: ${attempts}/${maxAttempts}]`)
          return true
        }

        attempts++
        this.logger.debug(`Proxy ${podName} is not UP. Checking again in ${delay}ms ... [attempt: ${attempts}/${maxAttempts}]`)
        await sleep(delay)
      }
    }

    throw new FullstackTestingError(`proxy for '${nodeId}' is not UP [ attempt = ${attempts}/${maxAttempts}`)
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
      throw new FullstackTestingError('Error stopping node', e)
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
            keysDir: path.join(self.configManager.getFlag(flags.cacheDir), 'keys'),
            devMode: self.configManager.getFlag(flags.devMode),
            curDate: new Date()
          }

          if (!fs.existsSync(config.keysDir)) {
            fs.mkdirSync(config.keysDir)
          }

          ctx.config = config
        }
      },
      {
        title: 'Generate gossip keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeGossipKeysTaskList(config.keyFormat, config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeTlsKeyTaskList(config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
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
              nodeCmd.logger.debug('==== Running \'node setup\' ===')
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
              flags.applicationEnv
            ),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node start\' ===')
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
              nodeCmd.logger.debug('==== Running \'node stop\' ===')
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
              nodeCmd.logger.debug('==== Running \'node keys\' ===')
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
