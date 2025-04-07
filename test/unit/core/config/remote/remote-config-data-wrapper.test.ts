// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import * as yaml from 'yaml';
import {RemoteConfigDataWrapper} from '../../../../../src/core/config/remote/remote-config-data-wrapper.js';
import {createMetadata} from './metadata.test.js';
import {createComponentsDataWrapper} from './components-data-wrapper.test.js';
import * as constants from '../../../../../src/core/constants.js';
import {CommonFlagsDataWrapper} from '../../../../../src/core/config/remote/common-flags-data-wrapper.js';
import {type RemoteConfigDataStructure} from '../../../../../src/core/config/remote/types.js';
import {type RemoteConfigData} from '../../../../../src/core/config/remote/remote-config-data.js';

const configManagerMock: any = {
  update: (...arguments_: any) => true,
  getFlag: (...arguments_: any) => true,
  hasFlag: (...arguments_: any) => true,
  setFlag: (...arguments_: any) => true,
};

async function createRemoteConfigDataWrapper(): Promise<{
  values: RemoteConfigData;
  dataWrapper: RemoteConfigDataWrapper;
}> {
  const {metadata} = createMetadata();
  const {
    wrapper: {componentsDataWrapper},
  } = createComponentsDataWrapper();

  const values: RemoteConfigData = {
    metadata,
    clusters: {},
    components: componentsDataWrapper,
    lastExecutedCommand: 'lastExecutedCommand',
    commandHistory: [],
    flags: await CommonFlagsDataWrapper.initialize(configManagerMock, {}),
  };

  return {
    values,
    dataWrapper: new RemoteConfigDataWrapper(values),
  };
}

describe('RemoteConfigDataWrapper', async () => {
  it('should be able to create a instance', () => createRemoteConfigDataWrapper());

  it('should be able to add new command to history with addCommandToHistory()', async () => {
    const {dataWrapper} = await createRemoteConfigDataWrapper();

    const command: string = 'command';

    dataWrapper.addCommandToHistory(command);

    expect(dataWrapper.lastExecutedCommand).to.equal(command);
    expect(dataWrapper.commandHistory).to.include(command);

    it('should be able to handle overflow', () => {
      for (let index: number = 0; index < constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY; index++) {
        dataWrapper.addCommandToHistory(command);
      }
    });
  });

  it('should successfully be able to parse yaml and create instance with fromConfigmap()', async () => {
    const {dataWrapper} = await createRemoteConfigDataWrapper();
    const dataWrapperObject: RemoteConfigDataStructure = dataWrapper.toObject();

    const yamlData: string = yaml.stringify({
      metadata: dataWrapperObject.metadata,
      components: dataWrapperObject.components as any,
      clusters: dataWrapperObject.clusters,
      commandHistory: dataWrapperObject.commandHistory,
      lastExecutedCommand: dataWrapperObject.lastExecutedCommand,
    });

    RemoteConfigDataWrapper.fromConfigmap(configManagerMock, {data: {'remote-config-data': yamlData}} as any);
  });
});
