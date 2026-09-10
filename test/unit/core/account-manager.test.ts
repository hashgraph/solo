// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {
  AccountCreateTransaction,
  PrivateKey,
  PrecheckStatusError,
  Status,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {AccountManager} from '../../../src/core/account-manager.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

type MockK8Factory = {
  getK8: sinon.SinonStub;
};

type CreateOrReplaceStub = sinon.SinonStub;

function makePrecheckStatusError(status: Status): PrecheckStatusError {
  const precheckStatusError: PrecheckStatusError = Object.create(PrecheckStatusError.prototype) as PrecheckStatusError;
  precheckStatusError.status = status;
  precheckStatusError.message = `precheck failed with ${status.toString()}`;
  return precheckStatusError;
}

function makeTransactionResponse(accountId: string): TransactionResponse {
  const receipt: TransactionReceipt = {
    accountId: {toString: (): string => accountId} as unknown as TransactionReceipt['accountId'],
  } as TransactionReceipt;
  const transactionResponse: TransactionResponse = {
    getReceipt: sinon.stub().resolves(receipt),
  } as unknown as TransactionResponse;
  return transactionResponse;
}

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

describe('AccountManager createNewAccount duplicate precheck retry', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('retries once when account creation hits DUPLICATE_TRANSACTION precheck', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {
      warn: sinon.stub(),
      error: sinon.stub(),
    } as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const privateKey: PrivateKey = PrivateKey.generateED25519();
    const duplicateTransactionError: PrecheckStatusError = makePrecheckStatusError(Status.DuplicateTransaction);
    const executeStub: sinon.SinonStub = sinon.stub(AccountCreateTransaction.prototype, 'execute');
    executeStub.onFirstCall().rejects(duplicateTransactionError);
    executeStub.onSecondCall().resolves(makeTransactionResponse('0.0.7001'));

    const createdAccount: {
      accountId: string;
      privateKey: string;
      publicKey: string;
      balance: number;
      accountAlias?: string;
    } = await accountManager.createNewAccount(NamespaceName.of('solo'), privateKey, 11, false, 'kind-solo');

    expect(createdAccount.accountId).to.equal('0.0.7001');
    expect(executeStub.callCount).to.equal(2);
    expect((loggerMock.warn as sinon.SinonStub).callCount).to.equal(1);
    expect(createOrReplaceStub.callCount).to.equal(1);
  });

  it('does not retry for non-duplicate precheck failures', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {
      warn: sinon.stub(),
      error: sinon.stub(),
    } as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const privateKey: PrivateKey = PrivateKey.generateED25519();
    const invalidSignatureError: PrecheckStatusError = makePrecheckStatusError(Status.InvalidSignature);
    const executeStub: sinon.SinonStub = sinon.stub(AccountCreateTransaction.prototype, 'execute');
    executeStub.rejects(invalidSignatureError);

    try {
      await accountManager.createNewAccount(NamespaceName.of('solo'), privateKey, 11, false, 'kind-solo');
      expect.fail('expected createNewAccount to reject');
    } catch (error) {
      expect(error).to.equal(invalidSignatureError);
    }

    expect(executeStub.callCount).to.equal(1);
    expect((loggerMock.warn as sinon.SinonStub).callCount).to.equal(0);
    expect(createOrReplaceStub.callCount).to.equal(0);
  });
});
