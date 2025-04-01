// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {stringify} from 'yaml';
import {expect} from 'chai';
import {LocalConfig} from '../../../src/core/config/local/local-config.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import {getTestCacheDirectory, testLocalConfigData} from '../../test-utility.js';
import {ErrorMessages} from '../../../src/core/error-messages.js';

describe('LocalConfig', () => {
  let localConfig: LocalConfig;
  const filePath = `${getTestCacheDirectory('LocalConfig')}/localConfig.yaml`;
  const config = testLocalConfigData;

  const expectFailedValidation = (expectedMessage: string) => {
    try {
      new LocalConfig(filePath);
      expect.fail('Expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
      expect(error.message).to.equal(expectedMessage);
    }
  };

  beforeEach(async () => {
    await fs.promises.writeFile(filePath, stringify(config));
    localConfig = new LocalConfig(filePath);
  });

  afterEach(async () => {
    await fs.promises.unlink(filePath);
  });

  it('should load config from file', async () => {
    expect(localConfig.userEmailAddress).to.eq(config.userEmailAddress);
    expect(localConfig.deployments).to.deep.eq(config.deployments);
    expect(localConfig.clusterRefs).to.deep.eq(config.clusterRefs);
  });

  it('should throw an error if file path is not set', async () => {
    try {
      new LocalConfig('');
      expect.fail('Expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(MissingArgumentError);
      expect(error.message).to.equal('a valid filePath is required');
    }
  });

  it('should throw a validation error if the config file is not a valid LocalConfig', async () => {
    // without any known properties
    await fs.promises.writeFile(filePath, 'foo: bar');
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_GENERIC);

    // with extra property
    await fs.promises.writeFile(filePath, stringify({...config, foo: 'bar'}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_GENERIC);
  });

  it('should throw a validation error if userEmailAddress is not a valid email', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, userEmailAddress: 'foo'}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL);

    await fs.promises.writeFile(filePath, stringify({...config, userEmailAddress: 5}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL);
  });

  it('should throw a validation error if deployments format is not correct', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, deployments: 'foo'}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT);

    await fs.promises.writeFile(filePath, stringify({...config, deployments: {foo: 'bar'}}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT);

    await fs.promises.writeFile(
      filePath,
      stringify({
        ...config,
        deployments: [{foo: 'bar'}],
      }),
    );
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT);
  });

  it('should throw a validation error if clusterRefs format is not correct', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, clusterRefs: 'foo'}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT);

    await fs.promises.writeFile(filePath, stringify({...config, clusterRefs: ['foo', 5]}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT);
  });
});
