/**
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import {Container} from '../src/core/dependency_injection/container_init.js';
import fs from 'fs';
import {type NamespaceNameAsString} from '../src/core/config/remote/types.js';
import * as yaml from 'yaml';
import {K8Client} from '../src/core/kube/k8_client/k8_client.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../src/core/constants.js';

const cacheDirectory = path.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDir: string = cacheDirectory) {
  Container.getInstance().reset(cacheDir, 'debug', true);
}

export function resetForTest(namespace?: NamespaceNameAsString, cacheDir: string = cacheDirectory) {
  const localConfigFile = DEFAULT_LOCAL_CONFIG_FILE;
  if (!fs.existsSync(cacheDirectory)) {
    fs.mkdirSync(cacheDirectory, {recursive: true});
  }

  const localConfigData = fs.readFileSync(path.join('test', 'data', localConfigFile), 'utf8');
  const parsedData = yaml.parse(localConfigData);

  // need to init the container prior to using K8Client for dependency injection to work
  resetTestContainer(cacheDir);

  fs.writeFileSync(path.join(cacheDirectory, localConfigFile), yaml.stringify(parsedData));
}
