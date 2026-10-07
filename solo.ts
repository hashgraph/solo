#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import * as fnm from './src/index.js';
import {CliBootstrap} from './src/core/cli-bootstrap.js';

await CliBootstrap.run(process.argv, fnm.main);
