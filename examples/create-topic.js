/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Wallet,
  LocalProvider,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  AccountCreateTransaction,
  PrivateKey,
  Hbar,
} from '@hashgraph/sdk';

import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

async function main() {
  if (process.env.OPERATOR_ID === null || process.env.OPERATOR_KEY === null || process.env.HEDERA_NETWORK === null) {
    throw new Error('Environment variables OPERATOR_ID, HEDERA_NETWORK, and OPERATOR_KEY are required.');
  }

  console.log(`Hedera network = ${process.env.HEDERA_NETWORK}`);
  const provider = new LocalProvider();

  const wallet = new Wallet(process.env.OPERATOR_ID, process.env.OPERATOR_KEY, provider);

  const TEST_MESSAGE = 'Hello World';
  try {
    // create topic
    let transaction = await new TopicCreateTransaction().setAdminKey(process.env.OPERATOR_KEY).freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    const createResponse = await transaction.executeWithSigner(wallet);
    const createReceipt = await createResponse.getReceiptWithSigner(wallet);

    console.log(`topic id = ${createReceipt.topicId.toString()}`);

    // send one message
    let topicMessageSubmitTransaction = await new TopicMessageSubmitTransaction({
      topicId: createReceipt.topicId,
      message: TEST_MESSAGE,
    }).freezeWithSigner(wallet);
    topicMessageSubmitTransaction = await topicMessageSubmitTransaction.signWithSigner(wallet);
    const sendResponse = await topicMessageSubmitTransaction.executeWithSigner(wallet);

    const sendReceipt = await sendResponse.getReceiptWithSigner(wallet);

    console.log(`topic sequence number = ${sendReceipt.topicSequenceNumber.toString()}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // send a create account transaction to push record stream files to mirror node
    const newKey = PrivateKey.generate();
    let accountCreateTransaction = await new AccountCreateTransaction()
      .setInitialBalance(new Hbar(10))
      .setKey(newKey.publicKey)
      .freezeWithSigner(wallet);
    accountCreateTransaction = await accountCreateTransaction.signWithSigner(wallet);
    const accountCreationResponse = await accountCreateTransaction.executeWithSigner(wallet);
    const accountCreationReceipt = await accountCreationResponse.getReceiptWithSigner(wallet);
    console.log(`account id = ${accountCreationReceipt.accountId.toString()}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check submit message result should success
    const queryURL = `http://localhost:8080/api/v1/topics/${createReceipt.topicId}/messages`;
    let received = false;
    let receivedMessage = '';

    // wait until the transaction reached consensus and retrievable from the mirror node API
    let retry = 0;
    while (!received && retry < 10) {
      const req = http.request(queryURL, {method: 'GET', timeout: 100, headers: {Connection: 'close'}}, res => {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          // convert chunk to json object
          const obj = JSON.parse(chunk);
          if (obj.messages.length === 0) {
            console.log('No messages yet');
          } else {
            // convert message from base64 to utf-8
            const base64 = obj.messages[0].message;
            const buff = Buffer.from(base64, 'base64');
            receivedMessage = buff.toString('utf-8');
            console.log(`Received message: ${receivedMessage}`);
            received = true;
          }
        });
      });
      req.on('error', e => {
        console.log(`problem with request: ${e.message}`);
      });
      req.end(); // make the request
      // wait and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
      retry++;
    }
    if (receivedMessage === TEST_MESSAGE) {
      console.log('Message received successfully');
    } else {
      console.error('Message received but not match: ' + receivedMessage);
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }
  } catch (error) {
    console.error(error);
  }
  provider.close();
}

void main();
