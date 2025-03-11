#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging.js';

const context: {logger: SoloLogger} = {logger: undefined};
await fnm
  .main(process.argv, context)
  .then(() => {
    context.logger.logAndExitSuccess('Solo CLI completed, via entrypoint');
  })
  .catch(err => {
    context.logger.logAndExitError(err);
  });
