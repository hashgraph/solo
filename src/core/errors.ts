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

export class SoloError extends Error {
  /**
     * Create a custom error object
     *
     * error metadata will include the `cause`
     *
     * @param {string} message error message
     * @param {Error | Object} cause source error (if any)
     * @param {Object} meta additional metadata (if any)
     */
  constructor (message, cause = {}, meta = {}) {
    super(message)
    this.name = this.constructor.name

    this.meta = meta
    if (cause) {
      this.cause = cause
    }

    Error.captureStackTrace(this, this.constructor)
  }
}

export class ResourceNotFoundError extends SoloError {
  /**
     * Create a custom error for resource not found scenario
     *
     * error metadata will include `resource`
     *
     * @param {string} message - error message
     * @param {string} resource - name of the resource
     * @param {Error|Object} cause - source error (if any)
     */
  constructor (message, resource, cause = {}) {
    super(message, cause, { resource })
  }
}

export class MissingArgumentError extends SoloError {
  /**
     * Create a custom error for missing argument scenario
     *
     * @param {string} message - error message
     * @param {Error|Object} cause - source error (if any)
     */
  constructor (message, cause = {}) {
    super(message, cause)
  }
}

export class IllegalArgumentError extends SoloError {
  /**
     * Create a custom error for illegal argument scenario
     *
     * error metadata will include `value`
     *
     * @param {string} message - error message
     * @param {*} value - value of the invalid argument
     * @param {Error|Object} cause - source error (if any)
     */
  constructor (message, value = '', cause = {}) {
    super(message, cause, { value })
  }
}

export class DataValidationError extends SoloError {
  /**
     * Create a custom error for data validation error scenario
     *
     * error metadata will include `expected` and `found` values.
     *
     * @param {string} message - error message
     * @param {*} expected - expected value
     * @param {*} found - value found
     * @param {Error|Object} [cause] - source error (if any)
     */
  constructor (message, expected, found, cause = {}) {
    super(message, cause, { expected, found })
  }
}
