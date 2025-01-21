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
import {expect} from 'chai';
import {describe, it} from 'mocha';

import * as yaml from 'yaml';
import {RemoteConfigDataWrapper} from '../../../../src/core/config/remote/remote_config_data_wrapper.js';
import {createMetadata} from './metadata.test.js';
import {createComponentsDataWrapper} from './components_data_wrapper.test.js';
import {SoloError} from '../../../../src/core/errors.js';
import * as constants from '../../../../src/core/constants.js';
import {CommonFlagsDataWrapper} from '../../../../src/core/config/remote/common_flags_data_wrapper.js';

const configManagerMock = {
  update: (...args: any) => true,
  getFlag: (...args: any) => true,
  hasFlag: (...args: any) => true,
  setFlag: (...args: any) => true,
};

function createRemoteConfigDataWrapper() {
  const {metadata} = createMetadata();
  const {
    wrapper: {componentsDataWrapper},
  } = createComponentsDataWrapper();

  const clusters = {};
  const components = componentsDataWrapper;
  const lastExecutedCommand = 'lastExecutedCommand';
  const commandHistory = [];
  const flags = CommonFlagsDataWrapper.initializeEmpty(configManagerMock as any, {}); // TODO MOCK

  const dataWrapper = new RemoteConfigDataWrapper({
    metadata,
    clusters,
    components,
    lastExecutedCommand,
    commandHistory,
    flags,
  });

  return {
    dataWrapper,
    values: {metadata, clusters, components, lastExecutedCommand, commandHistory},
  };
}

describe('RemoteConfigDataWrapper', () => {
  it('should be able to create a instance', () => createRemoteConfigDataWrapper());

  it('should be able to add new command to history with addCommandToHistory()', () => {
    const {dataWrapper} = createRemoteConfigDataWrapper();

    const command = 'command';

    dataWrapper.addCommandToHistory(command);

    expect(dataWrapper.lastExecutedCommand).to.equal(command);
    expect(dataWrapper.commandHistory).to.include(command);

    it('should be able to handle overflow', () => {
      for (let i = 0; i < constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY; i++) {
        dataWrapper.addCommandToHistory(command);
      }
    });
  });

  it('should successfully be able to parse yaml and create instance with fromConfigmap()', () => {
    const {dataWrapper} = createRemoteConfigDataWrapper();
    const dataWrapperObject = dataWrapper.toObject();

    const yamlData = yaml.stringify({
      metadata: dataWrapperObject.metadata,
      components: dataWrapperObject.components as any,
      clusters: dataWrapperObject.clusters,
      commandHistory: dataWrapperObject.commandHistory,
      lastExecutedCommand: dataWrapperObject.lastExecutedCommand,
    });

    RemoteConfigDataWrapper.fromConfigmap(configManagerMock as any, {data: {'remote-config-data': yamlData}} as any);
  });

  it('should fail if invalid data is passed to setters', () => {
    const {dataWrapper} = createRemoteConfigDataWrapper();

    // @ts-ignore
    expect(() => (dataWrapper.commandHistory = '')).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.lastExecutedCommand = '')).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.lastExecutedCommand = 1)).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.clusters = 1)).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.clusters = '')).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.components = 1)).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.components = '')).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.metadata = null)).to.throw(SoloError); // @ts-ignore
    expect(() => (dataWrapper.metadata = {})).to.throw(SoloError); // @ts-ignore

    expect(() => (dataWrapper.clusters = {null: null})).to.throw(SoloError);
    expect(() => (dataWrapper.clusters = {namespace: null})).to.throw(SoloError);
    expect(() => (dataWrapper.clusters = {null: 'namespace'})).to.throw(SoloError);
  });
});
