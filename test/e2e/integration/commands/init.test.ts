// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {type InitCommand} from '../../../../src/commands/init.js';
import {K8Client} from '../../../../src/integration/kube/k8-client/k8-client.js';
import {LocalConfig} from '../../../../src/core/config/local/local-config.js';
import sinon from 'sinon';
import {BASE_TEST_DIR} from '../../../test-utility.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../../src/core/constants.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {resetTestContainer} from '../../../test-container.js';
import {SoloWinstonLogger} from '../../../../src/core/logging/solo-winston-logger.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

const testLogger: SoloLogger = new SoloWinstonLogger('debug', true);
describe('InitCommand', () => {
  let sandbox = sinon.createSandbox();
  let initCmd: InitCommand;

  before(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(K8Client.prototype, 'init').callsFake(() => this);
    resetTestContainer(undefined, undefined, {
      LocalConfig: [{useValue: new LocalConfig(PathEx.join(BASE_TEST_DIR, DEFAULT_LOCAL_CONFIG_FILE))}],
    });
    initCmd = container.resolve(InjectTokens.InitCommand);
  });

  after(() => {
    sandbox.restore();
  });

  describe('commands', () => {
    it('init execution should succeed', async () => {
      await expect(initCmd.init({})).to.eventually.equal(true);
    }).timeout(Duration.ofSeconds(60).toMillis());
  });

  describe('methods', () => {
    it('command definition should return a valid command def', () => {
      const commandDefinition = initCmd.getCommandDefinition();

      // @ts-ignore
      expect(commandDefinition.name).not.to.be.null;
      expect(commandDefinition.desc).not.to.be.null;
      expect(commandDefinition.handler).not.to.be.null;
    });
  });
});
