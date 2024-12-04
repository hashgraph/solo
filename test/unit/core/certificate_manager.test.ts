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
import {after, before, describe, it} from 'mocha';
import jest from 'jest-mock';

import {ConfigManager} from '../../../src/core/config_manager.js';
import {K8} from '../../../src/core/k8.js';
import {CertificateManager} from '../../../src/core/certificate_manager.js';
import {flags} from '../../../src/commands/index.js';
import {testLogger} from '../../test_util.js';
import {SoloError} from '../../../src/core/errors.js';

describe('Certificate Manager', () => {
  const argv = {};
  // @ts-ignore
  const k8InitSpy = jest.spyOn(K8.prototype, 'init').mockImplementation(() => {});
  const k8CreateSecret = jest.spyOn(K8.prototype, 'createSecret').mockResolvedValue(true);
  let k8: K8;
  let certificateManager: CertificateManager;

  before(() => {
    argv[flags.namespace.name] = 'namespace';
    const configManager = new ConfigManager(testLogger);
    configManager.update(argv);
    k8 = new K8(configManager, testLogger);
    certificateManager = new CertificateManager(k8, testLogger, configManager);
  });

  after(() => {
    k8InitSpy.mockRestore();
    k8CreateSecret.mockRestore();
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
