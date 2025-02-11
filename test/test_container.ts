/**
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import {Container} from '../src/core/dependency_injection/container_init.js';
import fs from 'fs';
import {type NamespaceNameAsString} from '../src/core/config/remote/types.js';
import * as yaml from 'yaml';

const cacheDirectory = path.join('test', 'data', 'tmp');

export function resetTestContainer(cacheDir: string = cacheDirectory) {
  Container.getInstance().reset(cacheDir, 'debug', true);
}

export function resetForTest(namespace?: NamespaceNameAsString, cacheDir: string = cacheDirectory) {
  const localConfigFile = 'local-config.yaml';
  if (!fs.existsSync(cacheDirectory)) {
    fs.mkdirSync(cacheDirectory, {recursive: true});
  }

  const localConfigData = fs.readFileSync(path.join('test', 'data', localConfigFile), 'utf8');
  const parsedData = yaml.parse(localConfigData);

  if (namespace) {
    parsedData.deployments['deployment'].namespace = namespace;
  }

  fs.writeFileSync(path.join(cacheDirectory, localConfigFile), yaml.stringify(parsedData));
  resetTestContainer(cacheDir);
}
