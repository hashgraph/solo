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
import { expect } from 'chai'
import { describe, it } from 'mocha'

import { RemoteConfigDataWrapper } from '../../../../src/core/config/remote/remote_config_data_wrapper.ts'
import { createMetadata } from './metadata.test.ts'
import { createComponentsDataWrapper } from './components_data_wrapper.test.ts'
import { RemoteConfigMetadata } from "../../../../src/core/config/remote/metadata.js";
import { ComponentsDataWrapper } from "../../../../src/core/config/remote/components_data_wrapper.js";

function createRemoteConfigDataWrapper () {

  const { metadata } = createMetadata()
  const { wrapper: { componentsDataWrapper } } = createComponentsDataWrapper()

  const clusters = {}
  const components = componentsDataWrapper
  const lastExecutedCommand = 'lastExecutedCommand'
  const commandHistory = []

  const dataWrapper = new RemoteConfigDataWrapper({
    metadata, clusters, components, lastExecutedCommand, commandHistory
  })

  return {
    dataWrapper,
    values: { metadata, clusters, components, lastExecutedCommand, commandHistory }
  }
}

describe('RemoteConfigDataWrapper', () => {
  it('should be able to create a instance', () => createRemoteConfigDataWrapper())

  it('should be able to add new command to history with addCommandToHistory()', () => {
    const { dataWrapper } = createRemoteConfigDataWrapper()

    const command = 'command'

    dataWrapper.addCommandToHistory(command)

    expect(dataWrapper.lastExecutedCommand).to.equal(command)
    expect(dataWrapper.commandHistory).to.include(command)
  })

  it('', () => {
    const { dataWrapper } = createRemoteConfigDataWrapper()
    const dataWrapperObject = dataWrapper.toObject()

    new RemoteConfigDataWrapper({
      metadata: RemoteConfigMetadata.fromObject(dataWrapperObject.metadata),
      components: ComponentsDataWrapper.fromObject(dataWrapperObject.components as any),
      clusters: dataWrapperObject.clusters,
      commandHistory: dataWrapperObject.commandHistory,
      lastExecutedCommand: dataWrapperObject.lastExecutedCommand,
    })
  })
})