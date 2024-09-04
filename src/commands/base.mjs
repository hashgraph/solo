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
  /**
   * @param {string} chartDir
   * @param {string} chartRepo
   * @param {string} chartReleaseName
   * @returns {Promise<string>}
   */
  async prepareChartPath (chartDir, chartRepo, chartReleaseName) {
    if (!chartRepo) throw new MissingArgumentError('chart repo name is required')
    if (!chartReleaseName) throw new MissingArgumentError('chart release name is required')

    if (chartDir) {
      const chartPath = `${chartDir}/${chartReleaseName}`
      await this.helm.dependency('update', chartPath)
      return chartPath
    }

    return `${chartRepo}/${chartReleaseName}`
  }

  /**
   * @param {string} valuesFile
   * @returns {string}
   */
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

  /**
   * @param {{logger: Logger, helm: Helm, k8: K8, chartManager: ChartManager, configManager: ConfigManager, depManager: DependencyManager}} opts
   */
  constructor (opts) {
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.helm) throw new Error('An instance of core/Helm is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.chartManager) throw new Error('An instance of core/ChartManager is required')
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.depManager) throw new Error('An instance of core/DependencyManager is required')

    super(opts.logger)

    this.helm = opts.helm
    this.k8 = /** @type {K8} **/ opts.k8
    this.chartManager = opts.chartManager
    this.configManager = opts.configManager
    this.depManager = opts.depManager
    this._configMaps = new Map()
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   *
   * @param {string} configName the name of the configuration
   * @param {CommandFlag[]} flags an array of flags
   * @param {string[]} [extraProperties] an array of extra properties
   * @returns {Object} the instance of the new class
   */
  getConfig (configName, flags, extraProperties = []) {
    const configManager = this.configManager

    // build the dynamic class that will keep track of which properties are used
    const NewConfigClass = class {
      constructor () {
        // the map to keep track of which properties are used
        this.usedConfigs = new Map()

        // add the flags as properties to this class
        flags?.forEach(flag => {
          this[`_${flag.constName}`] = configManager.getFlag(flag)
          Object.defineProperty(this, flag.constName, {
            get () {
              this.usedConfigs.set(flag.constName, this.usedConfigs.get(flag.constName) + 1 || 1)
              return this[`_${flag.constName}`]
            }
          })
        })

        // add the extra properties as properties to this class
        extraProperties?.forEach(name => {
          this[`_${name}`] = ''
          Object.defineProperty(this, name, {
            get () {
              this.usedConfigs.set(name, this.usedConfigs.get(name) + 1 || 1)
              return this[`_${name}`]
            },
            set (value) {
              this[`_${name}`] = value
            }
          })
        })
      }

      /**
       * Get the list of unused configurations that were not accessed
       * @returns {string[]} an array of unused configurations
       */
      getUnusedConfigs () {
        const unusedConfigs = []

        // add the flag constName to the unusedConfigs array if it was not accessed
        flags?.forEach(flag => {
          if (!this.usedConfigs.has(flag.constName)) {
            unusedConfigs.push(flag.constName)
          }
        })

        // add the extra properties to the unusedConfigs array if it was not accessed
        extraProperties?.forEach(item => {
          if (!this.usedConfigs.has(item)) {
            unusedConfigs.push(item)
          }
        })
        return unusedConfigs
      }
    }

    const newConfigInstance = new NewConfigClass()

    // add the new instance to the configMaps so that it can be used to get the
    // unused configurations using the configName from the BaseCommand
    this._configMaps.set(configName, newConfigInstance)

    return newConfigInstance
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @param {string} configName
   * @returns {string[]} an array of unused configurations
   */
  getUnusedConfigs (configName) {
    return this._configMaps.get(configName).getUnusedConfigs()
  }
}
