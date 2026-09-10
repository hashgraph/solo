#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging/solo-logger.js';
import {InjectTokens} from './src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error-handler.js';
import {SilentBreak} from './src/core/errors/silent-break.js';

const context: {logger: SoloLogger} = {logger: undefined};

await fnm
  .main(process.argv, context)
  .then((): void => {
    context.logger?.info('Solo CLI completed, via entrypoint');
  })
  .catch((error): void => {
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

// Exit with the proper exit code and force close any open handles that prevent Solo from exiting
if (context.logger) {
  // eslint-disable-next-line n/no-process-exit
  context.logger.flush((): void => process.exit(process.exitCode ?? 0));
} else {
  // eslint-disable-next-line n/no-process-exit
  process.exit(process.exitCode ?? 0);
}
