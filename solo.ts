#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fnm from './src/index.js';

fnm
  .main(process.argv)
  .then(() => {
    // eslint-disable-next-line n/no-process-exit
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
