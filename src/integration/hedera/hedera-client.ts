// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type AccountInfo, type Client, type FileId, type PrivateKey} from '@hiero-ledger/sdk';

/**
 * A client for a Hedera network. Everything that talks to the Hedera SDK (transactions, queries, receipts, precheck
 * status handling and the retries that depend on it) lives behind this interface so callers do not import the SDK
 * transaction and query classes.
 */
export interface HederaClient {
  /**
   * The underlying SDK client.
   * @deprecated transitional seam for callers that still build SDK transactions and queries themselves; add a method
   * to this interface instead of using it.
   */
  readonly sdkClient: Client;

  readonly isShutDown: boolean;

  /** the account id of the operator, null when the client was created without one */
  readonly operatorAccountId: AccountId | null;

  /**
   * Replaces the operator that pays for and signs transactions
   * @param accountId - the operator account id
   * @param privateKey - the operator private key
   */
  setOperator(accountId: string, privateKey: string): void;

  /**
   * Pings a consensus node over gRPC
   * @param accountId - the account id of the node to ping
   * @throws if the node does not respond
   */
  ping(accountId: AccountId): Promise<void>;

  /** Closes the connections of the client */
  close(): void;

  /**
   * Queries the info of an account
   * @param accountId - the account
   */
  getAccountInfo(accountId: AccountId | string): Promise<AccountInfo>;

  /**
   * Replaces the key of an account, signing with both the old and the new key
   * @param accountId - the account
   * @param newPrivateKey - the new key
   * @param oldPrivateKey - the key currently on the account
   * @returns whether the update reached SUCCESS
   */
  updateAccountKey(
    accountId: AccountId | string,
    newPrivateKey: PrivateKey,
    oldPrivateKey: PrivateKey,
  ): Promise<boolean>;

  /**
   * Creates an account, retrying when the network answers DUPLICATE_TRANSACTION
   * @param privateKey - the key of the new account
   * @param initialBalanceHbar - the HBAR the new account starts with
   * @param setAlias - whether to set the account alias to the EVM address of the key
   * @returns the id of the new account
   */
  createAccount(privateKey: PrivateKey, initialBalanceHbar: number, setAlias: boolean): Promise<AccountId>;

  /**
   * Transfers HBAR between two accounts
   * @param fromAccountId - the account the HBAR is taken from
   * @param toAccountId - the account the HBAR is put into
   * @param hbarAmount - the amount of HBAR
   * @returns whether the transfer reached SUCCESS
   */
  transferHbar(
    fromAccountId: AccountId | string,
    toAccountId: AccountId | string,
    hbarAmount: number,
  ): Promise<boolean>;

  /**
   * Reads the contents of a file
   * @param fileId - the file
   * @param retryInvalidNodeAccount - retry while a node answers INVALID_NODE_ACCOUNT, which the SDK does not retry for
   * queries and which happens while the state of a freshly started node is still initializing
   */
  getFileContents(fileId: FileId, retryInvalidNodeAccount?: boolean): Promise<Uint8Array>;
}
