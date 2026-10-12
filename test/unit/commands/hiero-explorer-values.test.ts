// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../../src/core/constants.js';

interface ExplorerValuesConfig {
  mirrorNodeServices?: Record<string, string>;
  proxyPass?: Record<string, string>;
}

const readExplorerValues: () => ExplorerValuesConfig = (): ExplorerValuesConfig =>
  yaml.parse(fs.readFileSync(constants.EXPLORER_VALUES_FILE, 'utf8')) as ExplorerValuesConfig;

describe('hiero explorer values', (): void => {
  it('should leave the mirror node service URLs empty for Solo to inject at deploy time', (): void => {
    expect(readExplorerValues().mirrorNodeServices).to.deep.equal({
      rest: '',
      restjava: '',
      web3: '',
    });
  });

  it('should route every mirror node API path to the service that implements it', (): void => {
    // The routing must mirror hiero-mirror-node/docker-compose.yml: each location key is emitted
    // verbatim as an nginx location spec, so regex keys keep their ~ modifier and quotes.
    expect(readExplorerValues().proxyPass).to.deep.equal({
      '/api': '{{ .Values.mirrorNodeServices.rest }}',
      '/api/v1/contracts/call': '{{ .Values.mirrorNodeServices.web3 }}',
      '~ "^/api/v1/contracts/results/((0x)?[A-Fa-f0-9]{64}|\\d+\\.\\d+\\.\\d+-\\d+-\\d+)/opcodes"':
        '{{ .Values.mirrorNodeServices.web3 }}',
      '~ "^/api/v1/accounts/(\\d+\\.){0,2}(\\d+|(0x)?[A-Fa-f0-9]{40}|(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}|[A-Z2-7]{4,5}|[A-Z2-7]{7,8}))/(allowances/nfts|airdrops|hooks)"':
        '{{ .Values.mirrorNodeServices.restjava }}',
      '~ "^/api/v1/accounts/(\\d+\\.){0,2}(\\d+|(0x)?[A-Fa-f0-9]{40}|(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}|[A-Z2-7]{4,5}|[A-Z2-7]{7,8}))/hooks/(0|[1-9]\\d*)/storage$"':
        '{{ .Values.mirrorNodeServices.restjava }}',
      '/api/v1/network/': '{{ .Values.mirrorNodeServices.restjava }}',
      '~ "^/api/v1/topics/(\\d+\\.){0,2}\\d+$"': '{{ .Values.mirrorNodeServices.restjava }}',
    });
  });
});
