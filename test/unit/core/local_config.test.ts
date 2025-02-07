/**
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'fs';
import {stringify} from 'yaml';
import {expect} from 'chai';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import {type ConfigManager} from '../../../src/core/config_manager.js';
import {MissingArgumentError, SoloError} from '../../../src/core/errors.js';
import {getTestCacheDir, testLogger, testLocalConfigData} from '../../test_util.js';
import {type EmailAddress} from '../../../src/core/config/remote/types.js';
import {ErrorMessages} from '../../../src/core/error_messages.js';

describe('LocalConfig', () => {
  let localConfig: LocalConfig;
  const configManager = {} as unknown as ConfigManager;

  const filePath = `${getTestCacheDir('LocalConfig')}/localConfig.yaml`;
  const config = testLocalConfigData;

  const expectFailedValidation = expectedMessage => {
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
    expect(localConfig.currentDeploymentName).to.eq(config.currentDeploymentName);
    expect(localConfig.clusterContextMapping).to.deep.eq(config.clusterContextMapping);
  });

  it('should set user email address', async () => {
    const newEmailAddress = 'jane.doe@example.com';
    localConfig.setUserEmailAddress(newEmailAddress);
    expect(localConfig.userEmailAddress).to.eq(newEmailAddress);

    await localConfig.write();

    // reinitialize with updated config file
    const newConfig = new LocalConfig(filePath);
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
    const newConfig = new LocalConfig(filePath);
    expect(newConfig.deployments).to.deep.eq(newDeployments);
  });

  it('should not set invalid deployments', async () => {
    const validDeployment = {clusters: ['cluster-3', 'cluster-4']};
    const invalidDeployments = [
      {foo: ['bar']},
      {clusters: [5, 6, 7]},
      {clusters: 'bar'},
      {clusters: 5},
      {clusters: {foo: 'bar '}},
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

  it('should set clusterContextMapping', async () => {
    const newClusterMappings = {
      'cluster-3': 'context-3',
      'cluster-4': 'context-4',
    };
    localConfig.setClusterContextMapping(newClusterMappings);
    expect(localConfig.clusterContextMapping).to.eq(newClusterMappings);

    await localConfig.write();
    const newConfig = new LocalConfig(filePath, testLogger, configManager);
    expect(newConfig.clusterContextMapping).to.deep.eq(newClusterMappings);
  });

  it('should not set invalid clusterContextMapping', async () => {
    const invalidClusterContextMappings = {
      'cluster-3': 'context-3',
      'invalid-cluster': 5,
    };

    try {
      // @ts-ignore
      localConfig.setContextMappings(invalidClusterContextMappings);
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
    const newConfig = new LocalConfig(filePath);
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

  it('should throw a validation error if clusterContextMapping format is not correct', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, clusterContextMapping: 'foo'}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT);

    await fs.promises.writeFile(filePath, stringify({...config, clusterContextMapping: ['foo', 5]}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT);
  });

  it('should throw a validation error if currentDeploymentName format is not correct', async () => {
    await fs.promises.writeFile(filePath, stringify({...config, currentDeploymentName: 5}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST);

    await fs.promises.writeFile(filePath, stringify({...config, currentDeploymentName: ['foo', 'bar']}));
    expectFailedValidation(ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST);
  });
});
