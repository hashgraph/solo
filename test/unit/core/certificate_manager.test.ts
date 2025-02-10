/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import jest from 'jest-mock';

import {ConfigManager} from '../../../src/core/config_manager.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {CertificateManager} from '../../../src/core/certificate_manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {SoloError} from '../../../src/core/errors.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test_container.js';
import {K8ClientSecrets} from '../../../src/core/kube/k8_client/resources/secret/k8_client_secrets.js';

describe('Certificate Manager', () => {
  const argv = {};
  // @ts-ignore
  const k8InitSpy = jest.spyOn(K8Client.prototype, 'init').mockImplementation(() => {});
  const k8CreateSecretSpy = jest.spyOn(K8ClientSecrets.prototype, 'create').mockResolvedValue(true);
  let certificateManager: CertificateManager;

  before(() => {
    resetForTest();
    argv[flags.namespace.name] = 'namespace';
    const configManager = container.resolve(ConfigManager);
    configManager.update(argv);
    certificateManager = container.resolve(CertificateManager);
  });

  after(() => {
    k8InitSpy.mockRestore();
    k8CreateSecretSpy.mockRestore();
  });

  it('should throw if and error if nodeAlias is not provided', async () => {
    const input = '=/usr/bin/fake.cert';

    // @ts-ignore to access private method
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      'Failed to parse input =/usr/bin/fake.cert of type testing on =/usr/bin/fake.cert, index 0',
    );
  });

  it('should throw if and error if path is not provided', async () => {
    const input = 'node=';

    // @ts-ignore to access private method
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      'Failed to parse input node= of type testing on node=, index 0',
    );
  });

  it('should throw if and error if type is not valid', () => {
    const input = 'node=/invalid/path';

    // @ts-ignore to access private method
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      "File doesn't exist on path node=/invalid/path input of type testing on node=/invalid/path, index 0",
    );
  });
});
