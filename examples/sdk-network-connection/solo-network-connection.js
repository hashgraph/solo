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
import {AccountBalanceQuery, AccountId, Client, Logger, LogLevel, PrivateKey} from '@hashgraph/sdk';

export const TREASURY_ACCOUNT_ID = '0.0.2';
export const GENESIS_KEY =
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';

/**
 * Given that you have deployed Solo in a cluster on your local machine
 * And it is in namespace = solo-e2e
 * we want to run the following commands to open ports
 * $ export SOLO_NAMESPACE=solo-e2e
 * $ kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 &
 * $ kubectl port-forward svc/mirror-grpc -n "${SOLO_NAMESPACE}" 5600:5600 &
 **/

function main() {
  console.log('begin...');
  const treasuryAccountId = TREASURY_ACCOUNT_ID;
  const treasuryPrivateKey = PrivateKey.fromStringED25519(GENESIS_KEY);
  const network = {};

  network['127.0.0.1:50211'] = AccountId.fromString('0.0.3');

  const mirrorNetwork = '127.0.0.1:5600';

  // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work when running locally or in a pipeline
  console.log('creating client');
  const nodeClient = Client.fromConfig({
    network,
    mirrorNetwork,
    scheduleNetworkUpdate: false,
  });
  nodeClient.setOperator(treasuryAccountId, treasuryPrivateKey);
  nodeClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));
  console.log('client created');

  // check balance
  try {
    console.log('checking balance');
    new AccountBalanceQuery()
      .setAccountId('0.0.2')
      .execute(nodeClient)
      .then(balance => {
        console.log('checking balance...end');
        console.log(`Account ${treasuryAccountId} balance: ${balance?.hbars}`);
        console.log('...end');
      })
      .catch(err => {
        console.log('failure');
        console.log(err.message, err.stacktrace);
      });
  } catch (e) {
    console.log('failure');
    console.log(e.message, e.stacktrace);
  } finally {
    console.log('finally');
  }
}
main();
