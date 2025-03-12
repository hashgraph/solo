#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging.js';
import {InjectTokens} from './src/core/dependency_injection/inject_tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error_handler.js';

const context: {logger: SoloLogger} = {logger: undefined};
await fnm
  .main(process.argv, context)
  .then(() => {
    context.logger.info('Solo CLI completed, via entrypoint');
  })
  .catch(e => {
    const errorHandler: ErrorHandler = container.resolve(InjectTokens.ErrorHandler);
    errorHandler.handle(e);
  });
