// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './error-handler.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {SilentBreak} from './errors/silent-break.js';

export class CliBootstrap {
  /**
   * Shared entrypoint tail: runs `main`, routes any thrown error through the DI ErrorHandler
   * (formatted output, doc links, diagnostics tip, error translators), flushes the logger, and
   * exits with the correct code. Used by both solo.ts (npm/dev entry) and the SEA bootstrap
   * (sea/sea-main.template.cjs) so the two entry points can't drift apart.
   */
  public static async run(
    argv: string[],
    main: (argv: string[], context?: {logger: SoloLogger}) => Promise<unknown>,
  ): Promise<void> {
    const context: {logger: SoloLogger} = {logger: undefined};

    await main(argv, context)
      .then((): void => {
        context.logger?.info('Solo CLI completed, via entrypoint');
      })
      .catch((error: unknown): void => {
        let errorHandler: ErrorHandler;
        try {
          errorHandler = container.resolve(InjectTokens.ErrorHandler);
        } catch {
          // The error handler depends on the logger, so it cannot be built when logger construction is what
          // failed — and `--version` breaks out before the container is built at all.
          if (error instanceof SilentBreak) {
            // Either main() already reported the failure and set the exit code itself, or this is a
            // deliberate early exit such as --version, which succeeded. Forcing a failure code here would
            // make `solo --version` exit 1 and break every caller that checks it.
            return;
          }
          // Any other resolve failure — a bad token, an unrelated constructor throwing — was never reported,
          // and exiting 1 with no output at all is harder to diagnose than the error itself.
          process.exitCode = 1;
          process.stderr.write(`\nsolo: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
          return;
        }
        errorHandler.handle(error);
      });

    if (context.logger) {
      // eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
      context.logger.flush((): void => process.exit(process.exitCode ?? 0));
    } else {
      // eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
      process.exit(process.exitCode ?? 0);
    }
  }
}
