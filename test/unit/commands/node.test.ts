// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {describe, it, beforeEach} from 'mocha';
import {expect} from 'chai';

import {NodeCommand} from '../../../src/commands/node/index.js';

const getBaseCommandOpts = () => ({
  logger: sinon.stub(),
  helm: sinon.stub(),
  k8Factory: sinon.stub(),
  chartManager: sinon.stub(),
  configManager: sinon.stub(),
  depManager: sinon.stub(),
  localConfig: sinon.stub(),
  remoteConfigManager: sinon.stub(),
});

describe('NodeCommand unit tests', () => {
  describe('constructor error handling', () => {
    let opts: any;

    beforeEach(() => {
      opts = getBaseCommandOpts();
    });

    it('should throw an error if platformInstaller is not provided', () => {
      opts.downloader = sinon.stub();
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/PlatformInstaller is required');
    });

    it('should throw an error if keyManager is not provided', () => {
      opts.downloader = sinon.stub();
      opts.platformInstaller = sinon.stub();
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/KeyManager is required');
    });

    it('should throw an error if accountManager is not provided', () => {
      opts.downloader = sinon.stub();
      opts.platformInstaller = sinon.stub();
      opts.keyManager = sinon.stub();
      expect(() => new NodeCommand(opts)).to.throw('An instance of core/AccountManager is required');
    });
  });
});
