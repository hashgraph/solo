// SPDX-License-Identifier: Apache-2.0

import {Client, Hbar, Logger, LogLevel} from '@hiero-ledger/sdk';
import {inject, injectable} from 'tsyringe-neo';
import {type HederaClient} from '../hedera-client.js';
import {type HederaClientFactory} from '../hedera-client-factory.js';
import {type HederaClientOptions} from '../hedera-client-options.js';
import {SdkHederaClient} from './sdk-hedera-client.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';

@injectable()
export class SdkHederaClientFactory implements HederaClientFactory {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public create(options: HederaClientOptions): HederaClient {
    // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work
    // when running locally or in a pipeline
    const client: Client = Client.fromConfig({network: options.network, scheduleNetworkUpdate: false});

    if (options.operator) {
      client.setOperator(options.operator.accountId, options.operator.privateKey);
    }
    if (options.logFilePath) {
      client.setLogger(new Logger(LogLevel.Trace, options.logFilePath));
    }
    if (options.maxAttempts !== undefined) {
      client.setMaxAttempts(options.maxAttempts);
    }
    if (options.minBackoffMs !== undefined) {
      client.setMinBackoff(options.minBackoffMs);
    }
    if (options.maxBackoffMs !== undefined) {
      client.setMaxBackoff(options.maxBackoffMs);
    }
    if (options.requestTimeoutMs !== undefined) {
      client.setRequestTimeout(options.requestTimeoutMs);
    }
    if (options.maxQueryPaymentHbar !== undefined) {
      client.setMaxQueryPayment(new Hbar(options.maxQueryPaymentHbar));
    }

    return new SdkHederaClient(client, this.logger);
  }
}
