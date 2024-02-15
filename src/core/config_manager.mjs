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
import fs from 'fs'
import { FullstackTestingError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'
import { Logger } from './logging.mjs'
import * as flags from '../commands/flags.mjs'
import * as paths from 'path'
import * as helpers from './helpers.mjs'

/**
 * ConfigManager cache command flag values so that user doesn't need to enter the same values repeatedly.
 *
 * For example, 'namespace' is usually remains the same across commands once it is entered, and therefore user
 * doesn't need to enter it repeatedly. However, user should still be able to specify the flag explicitly for any command.
 */
export class ConfigManager {
  constructor (logger, cachedConfigFile = constants.SOLO_CONFIG_FILE) {
    if (!logger || !(logger instanceof Logger)) throw new MissingArgumentError('An instance of core/Logger is required')
    if (!cachedConfigFile) throw new MissingArgumentError('cached config file path is required')

    this.logger = logger
    this.cachedConfigFile = cachedConfigFile
    this.reset()
  }

  /**
   * Load the cached config
   */
  load () {
    try {
      if (fs.existsSync(this.cachedConfigFile)) {
        const configJSON = fs.readFileSync(this.cachedConfigFile)
        this.config = JSON.parse(configJSON.toString())
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to initialize config manager: ${e.message}`, e)
    }
  }

  /**
   * Reset config
   */
  reset () {
    this.config = {
      flags: {},
      version: helpers.packageVersion(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * Apply the command flags precedence
   *
   * It uses the below precedence for command flag values:
   *  1. User input of the command flag
   *  2. Cached config value of the command flag.
   *  3. Default value of the command flag if the command is not 'init'.
   *
   * @param argv yargs.argv
   * @param aliases yargv.parsed.aliases
   * @return {*} updated argv
   */
  applyPrecedence (argv, aliases) {
    for (const key of Object.keys(aliases)) {
      const flag = flags.allFlagsMap.get(key)
      if (flag) {
        if (argv[key] !== undefined) {
          // argv takes precedence, nothing to do
        } else if (this.hasFlag(flag)) {
          argv[key] = this.getFlag(flag)
        } else {
          argv[key] = flag.definition.defaultValue
        }
      }
    }

    return argv
  }

  /**
   * Update the config using the argv
   *
   * @param argv list of yargs argv
   * @param persist
   */
  update (argv = {}, persist = false) {
    if (argv && Object.keys(argv).length > 0) {
      for (const flag of flags.allFlags) {
        if (flag.name === flags.force.name) {
          continue // we don't want to cache force flag
        }

        if (argv[flag.name] === '' &&
          [flags.namespace.name, flags.clusterName.name, flags.chartDirectory.name].includes(flag.name)) {
          continue // don't cache empty namespace, clusterName, or chartDirectory
        }

        if (argv[flag.name] !== undefined) {
          let val = argv[flag.name]
          switch (flag.definition.type) {
            case 'string':
              if (flag.name === flags.chartDirectory.name || flag.name === flags.cacheDir.name) {
                this.logger.debug(`Resolving directory path for '${flag.name}': ${val}`)
                val = paths.resolve(val)
              }
              this.logger.debug(`Setting flag '${flag.name}' of type '${flag.definition.type}': ${val}`)
              this.config.flags[flag.name] = `${val}` // force convert to string
              break

            case 'number':
              this.logger.debug(`Setting flag '${flag.name}' of type '${flag.definition.type}': ${val}`)
              try {
                if (flags.integerFlags.has(flag.name)) {
                  this.config.flags[flag.name] = Number.parseInt(val)
                } else {
                  this.config.flags[flag.name] = Number.parseFloat(val)
                }
              } catch (e) {
                throw new FullstackTestingError(`invalid number value '${val}': ${e.message}`, e)
              }
              break

            case 'boolean':
              this.logger.debug(`Setting flag '${flag.name}' of type '${flag.definition.type}': ${val}`)
              this.config.flags[flag.name] = (val === true) || (val === 'true') // use comparison to enforce boolean value
              break

            default:
              throw new FullstackTestingError(`Unsupported field type for flag '${flag.name}': ${flag.definition.type}`)
          }
        }
      }

      // store last command that was run
      if (argv._) {
        this.config.lastCommand = argv._
      }

      this.config.updatedAt = new Date().toISOString()

      if (persist) {
        this.persist()
      }
    }
  }

  /**
   * Persist the config in the cached config file
   */
  persist () {
    try {
      this.config.updatedAt = new Date().toISOString()
      let configJSON = JSON.stringify(this.config)
      fs.writeFileSync(`${this.cachedConfigFile}`, configJSON)

      // refresh config with the file contents
      configJSON = fs.readFileSync(this.cachedConfigFile)
      this.config = JSON.parse(configJSON.toString())
    } catch (e) {
      throw new FullstackTestingError(`failed to persis config: ${e.message}`, e)
    }
  }

  /**
   * Check if a flag value is set
   * @param flag flag object
   * @return {boolean}
   */
  hasFlag (flag) {
    return this.config.flags[flag.name] !== undefined
  }

  /**
   * Return the value of the given flag
   *
   * @param flag flag object
   * @return {*|string} value of the flag or undefined if flag value is not available
   */
  getFlag (flag) {
    if (this.config.flags[flag.name] !== undefined) {
      return this.config.flags[flag.name]
    }

    return undefined
  }

  /**
   * Set value for the flag
   * @param flag flag object
   * @param value value of the flag
   */

  setFlag (flag, value) {
    if (!flag || !flag.name) throw new MissingArgumentError('flag must have a name')
    this.config.flags[flag.name] = value
  }

  /**
   * Get package version
   * @return {*}
   */
  getVersion () {
    return this.config.version
  }

  /**
   * Get last updated at timestamp
   * @return {string}
   */
  getUpdatedAt () {
    return this.config.updatedAt
  }
}
