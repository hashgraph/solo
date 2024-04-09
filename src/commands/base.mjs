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
import paths from 'path'
import { MissingArgumentError } from '../core/errors.mjs'
import { ShellRunner } from '../core/shell_runner.mjs'

export class BaseCommand extends ShellRunner {
  async prepareChartPath (chartDir, chartRepo, chartReleaseName) {
    if (!chartRepo) throw new MissingArgumentError('chart repo name is required')
    if (!chartReleaseName) throw new MissingArgumentError('chart release name is required')

    if (chartDir) {
      const chartPath = `${chartDir}/${chartReleaseName}`
      await this.helm.dependency('update', chartPath)
    }

    return `${chartRepo}/${chartReleaseName}`
  }

  prepareValuesFiles (valuesFile) {
    let valuesArg = ''
    if (valuesFile) {
      const valuesFiles = valuesFile.split(',')
      valuesFiles.forEach(vf => {
        const vfp = paths.resolve(vf)
        valuesArg += ` --values ${vfp}`
      })
    }

    return valuesArg
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
}
