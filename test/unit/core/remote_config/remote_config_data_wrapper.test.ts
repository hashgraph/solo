/**
 * SPDX-License-Identifier: Apache-2.0
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

async function createRemoteConfigDataWrapper() {
  const {metadata} = createMetadata();
  const {
    wrapper: {componentsDataWrapper},
  } = createComponentsDataWrapper();

  const clusters = {};
  const components = componentsDataWrapper;
  const lastExecutedCommand = 'lastExecutedCommand';
  const commandHistory = [];
  const flags = await CommonFlagsDataWrapper.initialize(configManagerMock as any, {});

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

describe('RemoteConfigDataWrapper', async () => {
  it('should be able to create a instance', () => createRemoteConfigDataWrapper());

  it('should be able to add new command to history with addCommandToHistory()', async () => {
    const {dataWrapper} = await createRemoteConfigDataWrapper();

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

  it('should successfully be able to parse yaml and create instance with fromConfigmap()', async () => {
    const {dataWrapper} = await createRemoteConfigDataWrapper();
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

  it('should fail if invalid data is passed to setters', async () => {
    const {dataWrapper} = await createRemoteConfigDataWrapper();

    // @ts-expect-error TS2322: Type string is not assignable to type string[]
    expect(() => (dataWrapper.commandHistory = '')).to.throw(SoloError);

    // @ts-expect-error TS2341 Property lastExecutedCommand is private and only accessible within class RemoteConfigDataWrapper
    expect(() => (dataWrapper.lastExecutedCommand = '')).to.throw(SoloError);

    // @ts-expect-error TS2341 Property lastExecutedCommand is private and only accessible within class RemoteConfigDataWrapper
    expect(() => (dataWrapper.lastExecutedCommand = 1)).to.throw(SoloError);

    // @ts-expect-error TS2322 Type number is not assignable to type Record<string, string>
    expect(() => (dataWrapper.clusters = 1)).to.throw(SoloError);

    // @ts-expect-error TS2322 Type string is not assignable to type Record<string, string>
    expect(() => (dataWrapper.clusters = '')).to.throw(SoloError);

    // @ts-expect-error TS2322 Type number is not assignable to type ComponentsDataWrapper
    expect(() => (dataWrapper.components = 1)).to.throw(SoloError);

    // @ts-expect-error TS2322 Type string is not assignable to type ComponentsDataWrapper
    expect(() => (dataWrapper.components = '')).to.throw(SoloError);

    expect(() => (dataWrapper.metadata = null)).to.throw(SoloError);

    // @ts-expect-error 2740: Type {} is missing the following properties from type RemoteConfigMetadata
    expect(() => (dataWrapper.metadata = {})).to.throw(SoloError);

    expect(() => (dataWrapper.clusters = {null: null})).to.throw(SoloError);
    expect(() => (dataWrapper.clusters = {namespace: null})).to.throw(SoloError);
    expect(() => (dataWrapper.clusters = {null: 'namespace'})).to.throw(SoloError);
  });
});
