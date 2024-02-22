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
'use strict'
import { FullstackTestingError, MissingArgumentError } from '../core/errors.mjs'
import { ConfigManager } from '../core/index.mjs'
import { ShellRunner } from '../core/shell_runner.mjs'

export class BaseCommand extends ShellRunner {
  async prepareChartPath (chartDir, chartRepo, chartName) {
    if (!chartRepo) throw new MissingArgumentError('chart repo name is required')
    if (!chartName) throw new MissingArgumentError('chart name is required')

    if (chartDir) {
      const chartPath = `${chartDir}/${chartName}`
      await this.helm.dependency('update', chartPath)
      return chartPath
    }

    return `${chartRepo}/${chartName}`
  }

  constructor (opts) {
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.helm) throw new Error('An instance of core/Helm is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.chartManager) throw new Error('An instance of core/ChartManager is required')
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.depManager) throw new Error('An instance of core/DependencyManager is required')

    super(opts.logger)

    this.helm = opts.helm
    this.k8 = opts.k8
    this.chartManager = opts.chartManager
    this.configManager = opts.configManager
    this.depManager = opts.depManager
  }

  /**
   * Handle the execution of the command
   *
   * It ensures process file is locked before the handleFunc is called
   *
   * @param argv argv of the command
   * @param handleFunc async function to be invoked
   * @return {Promise<boolean>} true if the execution succeeded
   */
  async handleCommand (argv, handleFunc) {
    if (!argv) throw new MissingArgumentError('argv is required')
    if (!handleFunc) throw new MissingArgumentError('handleFunc is required')

    let error = null
    try {
      this.logger.debug(`==== Start: '${argv._.join(' ')}' ===`)
      await ConfigManager.acquireProcessLock(this.logger)
      await handleFunc(argv)
    } catch (e) {
      error = new FullstackTestingError(`Error occurred: ${e.message}`, e)
    } finally {
      await ConfigManager.releaseProcessLock(this.logger)
      this.logger.debug(`==== End: '${argv._.join(' ')}' ===`)
    }

    if (error) {
      this.logger.showUserError(error)

      // do not exit immediately so that logger can flush properly
      setTimeout(() => {
        process.exit(1)
      }, 1)

      return false // we return false here, but process will exit with error code eventually.
    }

    return true
  }
}
