// SPDX-License-Identifier: Apache-2.0

import {
  AccountCreateTransaction,
  type AccountId,
  type AccountInfo,
  AccountInfoQuery,
  AccountUpdateTransaction,
  type Client,
  FileContentsQuery,
  type FileId,
  Hbar,
  HbarUnit,
  PrecheckStatusError,
  type PrivateKey,
  Status,
  type TransactionReceipt,
  type TransactionResponse,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import {type HederaClient} from '../hedera-client.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {sleep} from '../../../core/helpers.js';
import {Duration} from '../../../core/time/duration.js';

/** A {@link HederaClient} backed by the Hedera JavaScript SDK. */
export class SdkHederaClient implements HederaClient {
  private static readonly ACCOUNT_CREATE_MAX_ATTEMPTS: number = 3;
  private static readonly ACCOUNT_CREATE_RETRY_DELAY_MS: number = 250;
  private static readonly FILE_CONTENTS_MAX_ATTEMPTS: number = 5;
  private static readonly FILE_CONTENTS_RETRY_DELAY_MS: number = 5000;

  public constructor(
    public readonly sdkClient: Client,
    private readonly logger: SoloLogger,
  ) {}

  public get isShutDown(): boolean {
    return this.sdkClient.isClientShutDown;
  }

  public get operatorAccountId(): AccountId | null {
    return this.sdkClient.operatorAccountId;
  }

  public setOperator(accountId: string, privateKey: string): void {
    this.sdkClient.setOperator(accountId, privateKey);
  }

  public async ping(accountId: AccountId): Promise<void> {
    await this.sdkClient.ping(accountId);
  }

  public close(): void {
    this.sdkClient.close();
  }

  public async getAccountInfo(accountId: AccountId | string): Promise<AccountInfo> {
    return await new AccountInfoQuery()
      .setAccountId(accountId)
      .setMaxAttempts(3)
      .setMaxBackoff(1000)
      .execute(this.sdkClient);
  }

  public async updateAccountKey(
    accountId: AccountId | string,
    newPrivateKey: PrivateKey,
    oldPrivateKey: PrivateKey,
  ): Promise<boolean> {
    // Create the transaction to update the key on the account
    const transaction: AccountUpdateTransaction = new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setKey(newPrivateKey.publicKey)
      .freezeWith(this.sdkClient);

    // Sign the transaction with the old key and new key
    let signedTransaction: AccountUpdateTransaction = await transaction.sign(oldPrivateKey);
    signedTransaction = await signedTransaction.sign(newPrivateKey);

    // Sign the transaction with the client operator private key and submit to a Hedera network
    const txResponse: TransactionResponse = await signedTransaction.execute(this.sdkClient);

    // Request the receipt of the transaction
    const receipt: TransactionReceipt = await txResponse.getReceipt(this.sdkClient);

    return receipt.status === Status.Success;
  }

  public async createAccount(
    privateKey: PrivateKey,
    initialBalanceHbar: number,
    setAlias: boolean,
  ): Promise<AccountId> {
    const maxAttempts: number = SdkHederaClient.ACCOUNT_CREATE_MAX_ATTEMPTS;
    const retryDelayMs: number = SdkHederaClient.ACCOUNT_CREATE_RETRY_DELAY_MS;
    let response: TransactionResponse | undefined;
    let lastError: PrecheckStatusError | undefined;

    for (let attempt: number = 0; attempt < maxAttempts; attempt++) {
      try {
        const transaction: AccountCreateTransaction = new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(initialBalanceHbar, HbarUnit.Hbar));

        if (setAlias) {
          transaction.setAlias(privateKey.publicKey.toEvmAddress());
        }

        response = await transaction.execute(this.sdkClient);
        break;
      } catch (error) {
        if (
          error instanceof PrecheckStatusError &&
          error.status === Status.DuplicateTransaction &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(
            `Account create returned DUPLICATE_TRANSACTION (attempt ${attempt + 1}/${maxAttempts}), retrying in ${retryDelayMs}ms`,
          );
          lastError = error;
          await sleep(Duration.ofMillis(retryDelayMs));
          continue;
        }
        throw error;
      }
    }

    if (!response) {
      throw lastError!;
    }

    const receipt: TransactionReceipt = await response.getReceipt(this.sdkClient);
    return receipt.accountId!;
  }

  public async transferHbar(
    fromAccountId: AccountId | string,
    toAccountId: AccountId | string,
    hbarAmount: number,
  ): Promise<boolean> {
    const transaction: TransferTransaction = new TransferTransaction()
      .addHbarTransfer(fromAccountId, new Hbar(-1 * hbarAmount))
      .addHbarTransfer(toAccountId, new Hbar(hbarAmount))
      .freezeWith(this.sdkClient);

    const txResponse: TransactionResponse = await transaction.execute(this.sdkClient);
    const receipt: TransactionReceipt = await txResponse.getReceipt(this.sdkClient);

    this.logger.debug(
      `The transfer from account ${fromAccountId} to account ${toAccountId} for amount ${hbarAmount} was ${receipt.status.toString()} `,
    );

    return receipt.status === Status.Success;
  }

  public async getFileContents(fileId: FileId, retryInvalidNodeAccount: boolean = false): Promise<Uint8Array> {
    const maxAttempts: number = retryInvalidNodeAccount ? SdkHederaClient.FILE_CONTENTS_MAX_ATTEMPTS : 1;
    const retryDelayMs: number = SdkHederaClient.FILE_CONTENTS_RETRY_DELAY_MS;
    let lastError: PrecheckStatusError | undefined;

    for (let attempt: number = 0; attempt < maxAttempts; attempt++) {
      try {
        return await new FileContentsQuery().setFileId(fileId).execute(this.sdkClient);
      } catch (error) {
        if (
          retryInvalidNodeAccount &&
          error instanceof PrecheckStatusError &&
          error.status === Status.InvalidNodeAccount &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(
            `File contents query returned INVALID_NODE_ACCOUNT (attempt ${attempt + 1}/${maxAttempts}), retrying in ${retryDelayMs}ms`,
          );
          lastError = error;
          await sleep(Duration.ofMillis(retryDelayMs));
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }
}
