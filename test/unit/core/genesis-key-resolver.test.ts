// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import * as Base64 from 'js-base64';
import {PrivateKey} from '@hiero-ledger/sdk';
import {GenesisKeyResolver} from '../../../src/core/genesis-key-resolver.js';
import * as constants from '../../../src/core/constants.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type Context} from '../../../src/types/index.js';

describe('GenesisKeyResolver', (): void => {
  const namespace: NamespaceName = NamespaceName.of('genesis-test');
  const contexts: Context[] = ['ctx-a', 'ctx-b'];

  function fakeFactory(stored: Map<string, Record<string, string>>): K8Factory {
    return {
      getK8: (context: Context): unknown => ({
        secrets: (): unknown => ({
          exists: async (_namespace: NamespaceName, name: string): Promise<boolean> => stored.has(`${context}/${name}`),
          read: async (_namespace: NamespaceName, name: string): Promise<unknown> => ({
            data: stored.get(`${context}/${name}`),
          }),
          createOrReplace: async (
            _namespace: NamespaceName,
            name: string,
            _type: unknown,
            data: Record<string, string>,
          ): Promise<boolean> => {
            stored.set(`${context}/${name}`, data);
            return true;
          },
        }),
      }),
    } as unknown as K8Factory;
  }

  it('falls back to the environment/default key when no secret exists', async (): Promise<void> => {
    const key: PrivateKey = await GenesisKeyResolver.resolve(fakeFactory(new Map()), contexts, namespace);
    expect(key.toString()).to.equal(PrivateKey.fromStringED25519(constants.GENESIS_KEY).toString());
  });

  it('prefers the stored secret over the environment/default key', async (): Promise<void> => {
    const customKey: PrivateKey = PrivateKey.generateED25519();
    const stored: Map<string, Record<string, string>> = new Map([
      [`ctx-b/${GenesisKeyResolver.SECRET_NAME}`, {privateKey: Base64.encode(customKey.toString())}],
    ]);
    const key: PrivateKey = await GenesisKeyResolver.resolve(fakeFactory(stored), contexts, namespace);
    expect(key.toString()).to.equal(customKey.toString());
  });

  it('stores the effective genesis key in every context and resolves it back', async (): Promise<void> => {
    const stored: Map<string, Record<string, string>> = new Map();
    const factory: K8Factory = fakeFactory(stored);
    await GenesisKeyResolver.store(factory, contexts, namespace);
    expect(stored.size).to.equal(contexts.length);
    const key: PrivateKey = await GenesisKeyResolver.resolve(factory, contexts, namespace);
    expect(key.publicKey.toString()).to.equal(constants.GENESIS_PUBLIC_KEY.toString());
  });
});
