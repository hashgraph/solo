// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {Container, type InstanceOverrides} from '../src/core/dependency-injection/container-init.js';
import {type ConfigProvider} from '../src/data/configuration/api/config-provider.js';
import fs from 'node:fs';
import {type NamespaceNameAsString} from '../src/types/index.js';
import * as yaml from 'yaml';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../src/core/constants.js';
import {PathEx} from '../src/business/utils/path-ex.js';
import {CommandInvoker} from './helpers/command-invoker.js';
import {InjectTokens} from '../src/core/dependency-injection/inject-tokens.js';
import {SingletonContainer} from '../src/core/dependency-injection/singleton-container.js';
import {ValueContainer} from '../src/core/dependency-injection/value-container.js';

const CACHE_DIRECTORY: string = PathEx.join('test', 'data', 'tmp');

export function resetTestContainer(
  cacheDirectory: string = CACHE_DIRECTORY,
  containerOverrides: InstanceOverrides = new Map<symbol, ValueContainer | SingletonContainer>(),
): void {
  // Register test-specific containers
  if (!containerOverrides.get(InjectTokens.CommandInvoker)) {
    containerOverrides.set(
      InjectTokens.CommandInvoker,
      new SingletonContainer(InjectTokens.CommandInvoker, CommandInvoker),
    );
  }

  if (!containerOverrides.get(InjectTokens.CommandInvoker)) {
    containerOverrides.set(
      InjectTokens.CommandInvoker,
      new SingletonContainer(InjectTokens.CommandInvoker, CommandInvoker),
    );
  }
  if (!containerOverrides.get(InjectTokens.LogLevel)) {
    containerOverrides.set(InjectTokens.LogLevel, new ValueContainer(InjectTokens.LogLevel, 'debug'));
  }

  if (!containerOverrides.get(InjectTokens.DevelopmentMode)) {
    containerOverrides.set(InjectTokens.DevelopmentMode, new ValueContainer(InjectTokens.DevelopmentMode, true));
  }

  // For the test suites cacheDir === homeDir is acceptable because the data is temporary
  Container.getInstance().reset(cacheDirectory, cacheDirectory, 'debug', true, containerOverrides);
}

/**
 * Loads the layered Solo config sources into the already-initialized container.
 *
 * `Container.init()` registers the config sources through a synchronous factory and therefore cannot
 * await them, so tests that assert on values sourced from `resources/config/*.yaml` (or from the
 * `SOLO_*` config-system environment overrides) must call this first.
 */
export async function loadSoloConfigForTest(): Promise<void> {
  await container.resolve<ConfigProvider>(InjectTokens.ConfigProvider).config().refresh();
}

export function resetForTest(
  namespace?: NamespaceNameAsString,
  cacheDirectory: string = CACHE_DIRECTORY,
  resetLocalConfig: boolean = true,
  containerOverrides?: InstanceOverrides,
): void {
  if (resetLocalConfig) {
    const localConfigFile: string = DEFAULT_LOCAL_CONFIG_FILE;
    if (!fs.existsSync(CACHE_DIRECTORY)) {
      fs.mkdirSync(CACHE_DIRECTORY, {recursive: true});
    }

    const localConfigData: string = fs.readFileSync(PathEx.joinWithRealPath('test', 'data', localConfigFile), 'utf8');
    const parsedData: object = yaml.parse(localConfigData);
    fs.writeFileSync(PathEx.join(CACHE_DIRECTORY, localConfigFile), yaml.stringify(parsedData));
  }
  // need to init the container prior to using K8Client for dependency injection to work
  resetTestContainer(cacheDirectory, containerOverrides);
}
