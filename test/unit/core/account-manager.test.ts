// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {AccountId, PrivateKey} from '@hiero-ledger/sdk';
import {AccountManager} from '../../../src/core/account-manager.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type HederaClient} from '../../../src/integration/hedera/hedera-client.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

type MockK8Factory = {
  getK8: sinon.SinonStub;
};

type CreateOrReplaceStub = sinon.SinonStub;

function makeAccountManager(createOrReplaceStub: CreateOrReplaceStub, loggerMock: SoloLogger): AccountManager {
  const k8FactoryMock: MockK8Factory = {
    getK8: sinon.stub().returns({
      secrets: (): {createOrReplace: CreateOrReplaceStub} => ({
        createOrReplace: createOrReplaceStub,
      }),
    }),
  };

  return new AccountManager(loggerMock, k8FactoryMock as unknown as K8Factory, {} as never, {} as never, {} as never);
}

describe('AccountManager createNewAccount', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('creates the account through the Hedera client and stores its keys in a secret', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {warn: sinon.stub(), error: sinon.stub()} as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const createAccountStub: sinon.SinonStub = sinon.stub().resolves(AccountId.fromString('0.0.7001'));
    (accountManager as unknown as {_hederaClient: Partial<HederaClient>})._hederaClient = {
      createAccount: createAccountStub,
    };
    const privateKey: PrivateKey = PrivateKey.generateED25519();

    const createdAccount: {accountId: string; balance: number} = await accountManager.createNewAccount(
      NamespaceName.of('solo'),
      privateKey,
      11,
      false,
      'kind-solo',
    );

    expect(createdAccount.accountId).to.equal('0.0.7001');
    expect(createdAccount.balance).to.equal(11);
    expect(createAccountStub.calledOnceWithExactly(privateKey, 11, false)).to.equal(true);
    expect(createOrReplaceStub.callCount).to.equal(1);
  });

  it('does not store a secret when the Hedera client fails to create the account', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {warn: sinon.stub(), error: sinon.stub()} as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const failure: Error = new Error('invalid signature');
    (accountManager as unknown as {_hederaClient: Partial<HederaClient>})._hederaClient = {
      createAccount: sinon.stub().rejects(failure),
    };

    try {
      await accountManager.createNewAccount(
        NamespaceName.of('solo'),
        PrivateKey.generateED25519(),
        11,
        false,
        'kind-solo',
      );
      expect.fail('expected createNewAccount to reject');
    } catch (error) {
      expect(error).to.equal(failure);
    }

    expect(createOrReplaceStub.callCount).to.equal(0);
  });
});
