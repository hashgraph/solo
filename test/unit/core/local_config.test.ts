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
import { type ConfigManager, LocalConfig } from '../../../src/core/index.js'
import fs from 'fs'
import { stringify } from 'yaml'
import { expect } from 'chai'
import { MissingArgumentError, SoloError } from '../../../src/core/errors.js'
import { getTestCacheDir, testLogger, testLocalConfigData } from '../../test_util.js'
import type { EmailAddress } from '../../../src/core/config/remote/types.js'
import {ErrorMessages} from '../../../src/core/error_messages.js';

describe('LocalConfig', () => {
  let localConfig: LocalConfig
  const configManager = {} as unknown as ConfigManager

  const filePath = `${getTestCacheDir('LocalConfig')}/localConfig.yaml`
  const config = testLocalConfigData;

  const expectFailedValidation = expectedMessage => {
    try {
      new LocalConfig(filePath, testLogger, configManager)
      expect.fail('Expected an error to be thrown')
    } catch(error) {
      expect(error).to.be.instanceOf(SoloError)
      expect(error.message).to.equal(expectedMessage);
    }
  }

  beforeEach(async () => {
    await fs.promises.writeFile(filePath, stringify(config));
    localConfig = new LocalConfig(filePath, testLogger, configManager);
  });

  afterEach(async () => {
    await fs.promises.unlink(filePath);
  });

  it('should load config from file', async () => {
    expect(localConfig.userEmailAddress).to.eq(config.userEmailAddress);
    expect(localConfig.deployments).to.deep.eq(config.deployments);
    expect(localConfig.currentDeploymentName).to.eq(config.currentDeploymentName);
  });

  it('should set user email address', async () => {
    const newEmailAddress = 'jane.doe@example.com';
    localConfig.setUserEmailAddress(newEmailAddress);
    expect(localConfig.userEmailAddress).to.eq(newEmailAddress);

    await localConfig.write();

    // reinitialize with updated config file
    const newConfig = new LocalConfig(filePath, testLogger, configManager);
    expect(newConfig.userEmailAddress).to.eq(newEmailAddress);
  });

  it('should not set an invalid email as user email address', async () => {
    try {
      localConfig.setUserEmailAddress('invalidEmail' as EmailAddress);
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }
  });

  it('should set deployments', async () => {
    const newDeployments = {
      deployment: {
        clusters: ['cluster-1', 'context-1'],
      },
      'deployment-2': {
        clusters: ['cluster-3', 'context-3'],
      },
    };

    localConfig.setDeployments(newDeployments);
    expect(localConfig.deployments).to.deep.eq(newDeployments);

    await localConfig.write();
    const newConfig = new LocalConfig(filePath, testLogger, configManager);
    expect(newConfig.deployments).to.deep.eq(newDeployments);
  });

  it('should not set invalid deployments', async () => {
    const validDeployment = { clusters: ['cluster-3', 'cluster-4']};
    const invalidDeployments = [
      { foo: ['bar'] },
      { clusters: [5, 6, 7] },
      { clusters: 'bar' },
      { clusters: 5 },
      { clusters: {foo: 'bar '}},
    ];

    for (const invalidDeployment of invalidDeployments) {
      const deployments = {
        'my-deployment': validDeployment,
        'invalid-deployment': invalidDeployment,
      };

      try {
        localConfig.setDeployments(deployments as any);
        expect.fail('expected an error to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    }
  });

  it('should not set invalid context mappings', async () => {
    const invalidContextMappings = {
      'cluster-3': 'context-3',
      'invalid-cluster': 5,
    };

    try {
      // @ts-ignore
      localConfig.setContextMappings(invalidContextMappings);
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(TypeError);
    }
  });

  it('should get current deployment', async () => {
    expect(localConfig.getCurrentDeployment()).to.deep.eq(config.deployments[config.currentDeploymentName]);
  });

  it('should set current deployment', async () => {
    const newCurrentDeployment = 'deployment-2';
    localConfig.setCurrentDeployment(newCurrentDeployment);

    expect(localConfig.currentDeploymentName).to.eq(newCurrentDeployment);

    await localConfig.write();
    const newConfig = new LocalConfig(filePath, testLogger, configManager);
    expect(newConfig.currentDeploymentName).to.eq(newCurrentDeployment);
  });

  it('should not set invalid or non-existent current deployment', async () => {
    const invalidCurrentDeploymentName = 5;
    try {
      localConfig.setCurrentDeployment(invalidCurrentDeploymentName as any);
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }

    const nonExistentCurrentDeploymentName = 'non-existent-deployment';
    try {
      localConfig.setCurrentDeployment(nonExistentCurrentDeploymentName);
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }
  });

  it('should throw an error if file path is not set', async () => {
    try {
      new LocalConfig('', testLogger, configManager);
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

    await fs.promises.writeFile(filePath, stringify({
        ...config,
        deployments: [{ foo: 'bar'}],
    }),
    );
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT);
  });

  it('should throw a validation error if currentDeploymentName format is not correct', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, currentDeploymentName: 5}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST);

    await fs.promises.writeFile(filePath, stringify({ ...config, currentDeploymentName: ['foo', 'bar'] }));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST);
  });
  });