/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import sinon from 'sinon';

import {type ConfigManager} from '../../../src/core/config_manager.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {type CertificateManager} from '../../../src/core/certificate_manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {SoloError} from '../../../src/core/errors.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test_container.js';
import {K8ClientSecrets} from '../../../src/core/kube/k8_client/resources/secret/k8_client_secrets.js';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../helpers/argv_wrapper.js';

describe('Certificate Manager', () => {
  const argv = Argv.initializeEmpty();

  const k8InitSpy = new K8Client(undefined);

  let certificateManager: CertificateManager;

  before(() => {
    resetForTest();
    sinon.stub(K8Client.prototype, 'init').returns(k8InitSpy);
    sinon.stub(K8ClientSecrets.prototype, 'create').resolves(true);
    argv.setArg(flags.namespace, 'namespace');
    const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
    configManager.update(argv.build());
    certificateManager = container.resolve(InjectTokens.CertificateManager);
  });

  after(() => {
    sinon.restore();
  });

  it('should throw if and error if nodeAlias is not provided', async () => {
    const input = '=/usr/bin/fake.cert';

    // @ts-expect-error - TS2341: to access private property
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      'Failed to parse input =/usr/bin/fake.cert of type testing on =/usr/bin/fake.cert, index 0',
    );
  });

  it('should throw if and error if path is not provided', async () => {
    const input = 'node=';

    // @ts-expect-error - TS2341: to access private property
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      'Failed to parse input node= of type testing on node=, index 0',
    );
  });

  it('should throw if and error if type is not valid', () => {
    const input = 'node=/invalid/path';

    // @ts-expect-error - TS2341: to access private property
    expect(() => certificateManager.parseAndValidate(input, 'testing')).to.throw(
      SoloError,
      "File doesn't exist on path node=/invalid/path input of type testing on node=/invalid/path, index 0",
    );
  });
});
