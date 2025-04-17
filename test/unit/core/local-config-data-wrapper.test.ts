// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {testLocalConfigData} from '../../test-utility.js';
import {type EmailAddress} from '../../../src/core/config/remote/types.js';
import {LocalConfigDataWrapper} from '../../../src/core/config/local/local-config-data-wrapper.js';

describe('LocalConfigDataWrapper', () => {
  const config = testLocalConfigData;

  it('should set deployments', async () => {
    const namespace = 'namespace';
    const newDeployments = {
      deployment: {clusters: ['cluster-1', 'context-1'], namespace, shard: 1, realm: 2},
      'deployment-2': {clusters: ['cluster-3', 'context-3'], namespace, shard: 3, realm: 4},
    };

    new LocalConfigDataWrapper(
      config.userEmailAddress as EmailAddress,
      config.soloVersion,
      newDeployments,
      config.clusterRefs,
    );
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
        new LocalConfigDataWrapper(
          config.userEmailAddress as EmailAddress,
          config.soloVersion,
          deployments as never,
          {},
        );

        expect.fail('expected an error to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
      }
    }
  });

  it('should set clusterRefs', async () => {
    const newClusterMappings = {
      'cluster-3': 'context-3',
      'cluster-4': 'context-4',
    };

    new LocalConfigDataWrapper(config.userEmailAddress as EmailAddress, config.soloVersion, {}, newClusterMappings);
  });

  it('should not set invalid clusterRefs', async () => {
    const invalidClusterReferences = {
      'cluster-3': 'context-3',
      'invalid-cluster': 5,
    };

    try {
      new LocalConfigDataWrapper(
        config.userEmailAddress as EmailAddress,
        config.soloVersion,
        {},
        invalidClusterReferences as never,
      );

      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }
  });

  it('should set soloVersion', async () => {
    const validSoloVersion = '0.0.1';

    const localConfigData = new LocalConfigDataWrapper(
      config.userEmailAddress as EmailAddress,
      validSoloVersion,
      {},
      {},
    );

    expect(localConfigData.soloVersion).to.eq(validSoloVersion);
  });

  it('invalidSoloVersion not set invalid soloVersion', async () => {
    let invalidSoloVersion = null;
    try {
      new LocalConfigDataWrapper(invalidSoloVersion as never, config.soloVersion, {}, {});
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }

    invalidSoloVersion = '';
    try {
      new LocalConfigDataWrapper(invalidSoloVersion as never, config.soloVersion, {}, {});
      expect.fail('expected an error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
    }
  });
});
