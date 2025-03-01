#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {container} from 'tsyringe-neo';
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging.js';
import {InjectTokens} from './src/core/dependency_injection/inject_tokens.js';

await fnm
  .main(process.argv)
  .then(() => {
    container.resolve<SoloLogger>(InjectTokens.SoloLogger).logAndExitSuccess('Solo CLI completed, via entrypoint');
  })
  .catch(err => {
    container.resolve<SoloLogger>(InjectTokens.SoloLogger).logAndExitError('Solo CLI failed, via entrypoint', err);
  });
