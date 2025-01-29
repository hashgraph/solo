/**
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import {Container} from '../src/core/container_init.js';

const cacheDirectory = path.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDir: string = cacheDirectory) {
  Container.getInstance().reset(cacheDir, 'debug', true);
}
