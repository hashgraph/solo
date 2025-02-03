/**
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import {Container} from '../src/core/container_init.js';
import fs from 'fs';

const cacheDirectory = path.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDir: string = cacheDirectory) {
  const localConfigFile = 'local-config.yaml';
  fs.copyFileSync(path.join('test', 'data', localConfigFile), path.join(cacheDirectory, localConfigFile));
  Container.getInstance().reset(cacheDir, 'debug', true);
}
