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
import {
  SoloError,
  ResourceNotFoundError,
  MissingArgumentError,
  IllegalArgumentError,
  DataValidationError
} from '../../../src/core/errors.mjs'

describe('Errors', () => {
  const message = 'errorMessage'
  const cause = new Error('cause')

  it('should construct correct SoloError', () => {
    const error = new SoloError(message, cause)
    expect(error)
      .to.be.instanceof(Error)
      .and.to.have.property('name').that.equals('SoloError')
      .and.to.have.property('message').that.equals(message)
      .and.to.have.property('cause').that.equals(cause)
      .and.to.have.property('meta').that.deep.equals({})
  })

  it('should construct correct ResourceNotFoundError', () => {
    const resource = 'resource'
    const error = new ResourceNotFoundError(message, resource)
    expect(error)
      .to.be.instanceof(SoloError)
      .and.to.have.property('name').that.equals('ResourceNotFoundError')
      .and.to.have.property('message').that.equals(message)
      .and.to.have.property('cause').that.equals({})
      .and.to.have.property('meta').that.deep.equals({ resource })
  })

  it('should construct correct MissingArgumentError', () => {
    const error = new MissingArgumentError(message)
    expect(error)
      .to.be.instanceof(SoloError)
      .and.to.have.property('name').that.equals('MissingArgumentError')
      .and.to.have.property('message').that.equals(message)
      .and.to.have.property('cause').that.equals({})
      .and.to.have.property('meta').that.deep.equals({})
  })

  it('should construct correct IllegalArgumentError', () => {
    const value = 'invalid argument'
    const error = new IllegalArgumentError(message, value)
    expect(error)
      .to.be.instanceof(SoloError)
      .and.to.have.property('name').that.equals('IllegalArgumentError')
      .and.to.have.property('message').that.equals(message)
      .and.to.have.property('cause').that.equals({})
      .and.to.have.property('meta').that.deep.equals({ value })
  })

  it('should construct correct DataValidationError', () => {
    const expected = 'expected'
    const found = 'found'
    const error = new DataValidationError(message, expected, found)
    expect(error)
      .to.be.instanceof(SoloError)
      .and.to.have.property('name').that.equals('DataValidationError')
      .and.to.have.property('message').that.equals(message)
      .and.to.have.property('cause').that.equals({})
      .and.to.have.property('meta').that.deep.equals({ expected, found })
  })
})
