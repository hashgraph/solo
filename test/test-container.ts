// SPDX-License-Identifier: Apache-2.0

import {Container} from '../src/core/dependency-injection/container-init.js';
import fs from 'fs';
import {type NamespaceNameAsString} from '../src/core/config/remote/types.js';
import * as yaml from 'yaml';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../src/core/constants.js';
import {type SoloLogger} from '../src/core/logging/solo-logger.js';
import {PathEx} from '../src/business/utils/path-ex.js';

const cacheDirectory = PathEx.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDir: string = cacheDirectory, testLogger?: SoloLogger) {
  // For the test suites cacheDir === homeDir is acceptable because the data is temporary
  Container.getInstance().reset(cacheDir, cacheDir, 'debug', true, testLogger);
}

export function resetForTest(
  namespace?: NamespaceNameAsString,
  cacheDir: string = cacheDirectory,
  testLogger?: SoloLogger,
  resetLocalConfig: boolean = true,
) {
  if (resetLocalConfig) {
    const localConfigFile = DEFAULT_LOCAL_CONFIG_FILE;
    if (!fs.existsSync(cacheDirectory)) {
      fs.mkdirSync(cacheDirectory, {recursive: true});
    }

    const localConfigData = fs.readFileSync(PathEx.joinWithRealPath('test', 'data', localConfigFile), 'utf8');
    const parsedData = yaml.parse(localConfigData);
    fs.writeFileSync(PathEx.join(cacheDirectory, localConfigFile), yaml.stringify(parsedData));
  }
  // need to init the container prior to using K8Client for dependency injection to work
  resetTestContainer(cacheDir, testLogger);
}
