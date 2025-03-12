// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'fs';
import {loadYaml} from '@kubernetes/client-node';
import {expect} from 'chai';
import {beforeEach} from 'mocha';
import os from 'os';
import {RemoteConfig} from '../../../../../src/data/schema/model/remote/remote_config.js';
import {instanceToPlain, plainToClass} from 'class-transformer';

function migrate(plainObject: object): void {
  plainObject['schemaVersion'] = 0;
  const meta: object = plainObject['metadata'];
  meta['lastUpdatedBy'] = {
    name: os.userInfo().username,
    hostname: os.hostname(),
  };

  const clusters: object = plainObject['clusters'];
  const ca: object[] = [];
  for (const key in clusters) {
    expect(clusters[key]).to.not.be.undefined.and.to.not.be.null;
    const c = clusters[key];
    ca.push(c);
  }
  plainObject['history'] = {};
  plainObject['history']['commands'] = [];
  for (const historyItem of plainObject['commandHistory']) {
    plainObject['history']['commands'].push(historyItem);
  }

  plainObject['clusters'] = ca;
}

describe('RemoteConfig', () => {
  const remoteConfigPath = 'test/data/remote-config.yaml';

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(remoteConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = loadYaml<object>(yamlData);
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;

      migrate(plainObject);
    });

    it('should transform plain to class', async () => {
      const rc = plainToClass(RemoteConfig, plainObject);
      expect(rc).to.not.be.undefined.and.to.not.be.null;
      expect(rc.history.commands.length).to.be.equal(1);
    });

    it('should transform class to plain', async () => {
      const rc: RemoteConfig = plainToClass(RemoteConfig, plainObject);
      const remoteConfigObject = instanceToPlain(rc);
      expect(remoteConfigObject).to.not.be.undefined.and.to.not.be.null;
    });
  });
});
