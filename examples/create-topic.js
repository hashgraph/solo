/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {Wallet, LocalProvider, TopicCreateTransaction, TopicMessageSubmitTransaction} from '@hashgraph/sdk';

import dotenv from 'dotenv';

dotenv.config();

async function main() {
  if (process.env.OPERATOR_ID === null || process.env.OPERATOR_KEY === null || process.env.HEDERA_NETWORK === null) {
    throw new Error('Environment variables OPERATOR_ID, HEDERA_NETWORK, and OPERATOR_KEY are required.');
  }

  console.log(`Hedera network = ${process.env.HEDERA_NETWORK}`);
  const provider = new LocalProvider();

  const wallet = new Wallet(process.env.OPERATOR_ID, process.env.OPERATOR_KEY, provider);

  try {
    console.log('before create topic');
    // create topic
    let transaction = await new TopicCreateTransaction().freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    console.log('after sign transaction');
    const createResponse = await transaction.executeWithSigner(wallet);
    const createReceipt = await createResponse.getReceiptWithSigner(wallet);

    console.log(`topic id = ${createReceipt.topicId.toString()}`);

    // send one message
    let topicMessageSubmitTransaction = await new TopicMessageSubmitTransaction({
      topicId: createReceipt.topicId,
      message: 'Hello World',
    }).freezeWithSigner(wallet);
    topicMessageSubmitTransaction = await topicMessageSubmitTransaction.signWithSigner(wallet);
    const sendResponse = await topicMessageSubmitTransaction.executeWithSigner(wallet);

    const sendReceipt = await sendResponse.getReceiptWithSigner(wallet);

    console.log(`topic sequence number = ${sendReceipt.topicSequenceNumber.toString()}`);
  } catch (error) {
    console.error(error);
  }

  provider.close();
}

void main();
