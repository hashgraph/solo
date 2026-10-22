// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {accountCreationShouldSucceed} from '../../test-utility.js';
import {it} from 'mocha';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {main} from '../../../../src/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';

export class AccountTest extends BaseCommandTest {
  public static accountCreationShouldSucceed(options: BaseTestOptions): void {
    const {testName, namespace, testLogger: logger, contexts} = options;

    it(`${testName}: account creation should succeed`, async (): Promise<void> => {
      const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
      const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
        InjectTokens.RemoteConfigRuntimeState,
      );

      await remoteConfig.load(namespace, contexts ? contexts[0] : undefined);

      accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);
    });
  }

  public static predefinedAccountCreationShouldSucceed(options: BaseTestOptions): void {
    const {testName, deployment} = options;
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = AccountTest;

    it(`${testName}: ledger account predefined should succeed`, async (): Promise<void> => {
      const argv: string[] = newArgv();
      argv.push(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_PREDEFINED,
        optionFromFlag(Flags.deployment),
        deployment,
      );
      argvPushGlobalFlags(argv, testName, true);

      await main(argv);
    });
  }
}
