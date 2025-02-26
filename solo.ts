#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fnm from './src/index.js';

await fnm.main(process.argv).catch(err => {
  console.error(err);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
