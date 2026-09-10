// SPDX-License-Identifier: Apache-2.0

import http from 'node:http';
import {type AddressInfo} from 'node:net';
import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
// eslint-disable-next-line no-restricted-imports
import {CoreV1Api, KubeConfig, type V1NamespaceList} from '@kubernetes/client-node';
import {K8ClientApiFactory} from '../../../../src/integration/kube/k8-client/k8-client-api-factory.js';
import {MissingActiveClusterError} from '../../../../src/integration/kube/errors/missing-active-cluster-error.js';
import {resetForTest} from '../../../test-container.js';

describe('K8ClientApiFactory', (): void => {
  let server: http.Server;
  let serverPort: number;
  let requestCount: number;

  before(async (): Promise<void> => {
    resetForTest();

    requestCount = 0;
    server = http.createServer((request: http.IncomingMessage, response: http.ServerResponse): void => {
      requestCount++;
      if (requestCount === 1) {
        response.writeHead(429, {'Content-Type': 'text/plain', 'Retry-After': '1'});
        response.end('Too many requests, please try again later.\n');
        return;
      }
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({apiVersion: 'v1', kind: 'NamespaceList', metadata: {}, items: []}));
    });

    await new Promise<void>((resolve: () => void): void => {
      server.listen(0, '127.0.0.1', resolve);
    });
    serverPort = (server.address() as AddressInfo).port;
  });

  after((): void => {
    server?.close();
  });

  function buildKubeConfig(): KubeConfig {
    const kubeConfig: KubeConfig = new KubeConfig();
    kubeConfig.loadFromString(
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [
          {name: 'fake', cluster: {server: `http://127.0.0.1:${serverPort}`, 'insecure-skip-tls-verify': true}},
        ],
        users: [{name: 'fake', user: {token: 'fake-token'}}],
        contexts: [{name: 'fake', context: {cluster: 'fake', user: 'fake'}}],
        'current-context': 'fake',
      }),
    );
    return kubeConfig;
  }

  it('creates a client that retries a request throttled by the API server', async (): Promise<void> => {
    const client: CoreV1Api = K8ClientApiFactory.makeApiClient(buildKubeConfig(), CoreV1Api);

    const namespaceList: V1NamespaceList = await client.listNamespace();

    expect(requestCount, 'the throttled request must be resent once').to.equal(2);
    expect(namespaceList.items).to.be.an('array').that.is.empty;
  }).timeout(10_000);

  it('throws when the kube config has no current cluster', (): void => {
    expect((): void => {
      K8ClientApiFactory.makeApiClient(new KubeConfig(), CoreV1Api);
    }).to.throw(MissingActiveClusterError);
  });
});
